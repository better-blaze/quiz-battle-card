// =============================================
// app.js — Firebase 연결, 라우팅, 게임 오케스트레이션
// =============================================

import { initializeApp }                       from 'firebase/app';
import { getDatabase, ref, set, get, update,
         onValue, serverTimestamp, remove,
         runTransaction }                       from 'firebase/database';

import { firebaseConfig, GAME, PHASE, CARD_CONFIG } from './config.js';
import { initSettingView }                          from './setting.js';
import * as Board                                   from './board.js';
import * as Client                                  from './client.js';
import * as Admin                                   from './admin.js';
import * as Sound                                   from './sound.js';

// ── Firebase 초기화 ──
const fbApp = initializeApp(firebaseConfig);
const db    = getDatabase(fbApp);

// 서버-클라이언트 시계 차이(clock skew) 동기화
let _serverTimeOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), snap => {
  _serverTimeOffset = snap.val() || 0;
});
function serverNow() { return Date.now() + _serverTimeOffset; }

// ── Firebase 경로 헬퍼 ──
const R = {
  room:      (c)          => ref(db, `rooms/${c}`),
  meta:      (c)          => ref(db, `rooms/${c}/meta`),
  players:   (c)          => ref(db, `rooms/${c}/players`),
  player:    (c, p)       => ref(db, `rooms/${c}/players/${p}`),
  questions: (c)          => ref(db, `rooms/${c}/questions`),
  gameState: (c)          => ref(db, `rooms/${c}/gameState`),
  answers:   (c, qi)      => ref(db, `rooms/${c}/answers/${qi}`),
  answer:    (c, qi, p)   => ref(db, `rooms/${c}/answers/${qi}/${p}`),
  deck:      (c, qi)      => ref(db, `rooms/${c}/cards/${qi}/deck`),
  cardSlot:  (c, qi, idx) => ref(db, `rooms/${c}/cards/${qi}/deck/${idx}`),
};

// ── 전역 상태 ──
let state = {
  roomCode:      null,
  role:          null,   // 'admin' | 'student' | 'board'
  myPlayerId:    null,   // 닉네임 (입장 후 설정)
  questions:     [],
  unsubscribers: []
};

// ── 게임 내 임시 상태 ──
let _currentQIdx         = -1;   // 중복 렌더 방지
let _cardSelectionActive = false; // 카드 선택 진행 중
let _watchUnsub          = null;  // 오답자 구경 리스너
let _boardDeckUnsub      = null;  // board 덱 구독 해제 함수
let _boardCardsReady     = false; // board 카드 최초 렌더 완료 여부
let _adminDeckUnsub      = null;  // 관리자 덱 구독 해제 함수
let _adminCardsReady     = false; // 관리자 카드 프리뷰 최초 렌더 여부
let _adminDeckQIdx       = -1;    // 현재 구독 중인 관리자 덱의 질문 인덱스
let _adminCachedAnswers  = {};    // 최근 answers 캐시 (플레이어 리스너에서 재사용)
let _adminEnded          = false; // 게임 종료 여부 (플레이어 리스너 오버라이트 방지)

// ── 뷰 전환 ──
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ── 음소거 버튼 초기화 ──
function initMuteButtons() {
  document.querySelectorAll('.mute-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const nowMuted = !Sound.isMuted();
      Sound.setMuted(nowMuted);
      document.querySelectorAll('.mute-btn').forEach(b => {
        b.textContent = nowMuted ? '🔇' : '🔊';
      });
    });
  });
}

// ── 앱 시작 ──
async function main() {
  initMuteButtons();

  const params   = new URLSearchParams(window.location.search);
  const autoRoom = params.get('room');
  const autoRole = params.get('role');
  if (autoRoom && autoRole === 'board') {
    await handleJoin(autoRoom, 'board');
    return;
  }

  showView('view-setting');
  initSettingView({
    onCreateRoom:  handleCreateRoom,
    onJoinStudent: (code) => handleJoin(code, 'student'),
    onJoinBoard:   (code) => handleJoin(code, 'board'),
    onJoinAdmin:   (code) => handleJoin(code, 'admin'),
  });
}

// ── 방 만들기 (관리자) ──
async function handleCreateRoom(code, questions) {
  const existing = await get(R.meta(code));
  if (existing.exists()) {
    if (!confirm(`방 코드 "${code}"이 이미 존재합니다. 덮어쓰시겠습니까?`)) return;
  }

  const questionsObj = {};
  questions.forEach((q, i) => { questionsObj[i] = q; });

  await set(R.room(code), {
    meta:      { status: 'playing', createdAt: Date.now() },
    questions: questionsObj,
    gameState: {
      currentQuestion:  0,
      phase:            PHASE.IDLE,
      countdownStartAt: null,
      questionStartAt:  null
    }
  });

  state.roomCode  = code;
  state.role      = 'admin';
  state.questions = questions;
  enterAdmin(code);

  // 상황판 팝업 자동 오픈
  const popup = window.open(
    `?room=${code}&role=board`,
    `board_${code}`,
    'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no'
  );
  if (!popup) {
    alert('상황판 팝업이 차단되었습니다.\n팝업 차단을 해제 후 다시 시도해주세요.');
  }
}

// ── 방 참여 ──
async function handleJoin(code, role) {
  const snap = await get(R.meta(code));
  if (!snap.exists()) {
    alert('방을 찾을 수 없습니다. 방 코드를 확인하세요.');
    return;
  }

  state.roomCode = code;
  state.role     = role;

  const qSnap = await get(R.questions(code));
  state.questions = qSnap.exists()
    ? Object.values(qSnap.val()).sort((a, b) => Number(a.num) - Number(b.num))
    : [];

  switch (role) {
    case 'board':   enterBoard(code);   break;
    case 'admin':   enterAdmin(code);   break;
    case 'student': enterStudent(code); break;
  }
}

// ── 리스너 해제 ──
function clearListeners() {
  state.unsubscribers.forEach(fn => fn());
  state.unsubscribers = [];
}

// =============================================
// 상황판 진입
// =============================================
function enterBoard(code) {
  clearListeners();
  showView('view-board');

  const roomEl = document.getElementById('board-room-code');
  if (roomEl) roomEl.textContent = `방: ${code}`;

  const unsubGame = onValue(R.gameState(code), async snap => {
    if (!snap.exists()) return;
    handleBoardGameUpdate(code, snap.val());
  });

  const unsubMeta = onValue(R.meta(code), snap => {
    if (!snap.exists()) backToSetting();
  });

  state.unsubscribers.push(unsubGame, unsubMeta);
}

async function handleBoardGameUpdate(code, game) {
  const qi = game.currentQuestion;
  const q  = state.questions[qi];

  if (game.phase === PHASE.IDLE) {
    // 이전 문제 덱 구독 정리
    if (_boardDeckUnsub) { _boardDeckUnsub(); _boardDeckUnsub = null; }
    _boardCardsReady = false;
    Board.clearQuestion();
    return;
  }

  if (game.phase === PHASE.COUNTDOWN) {
    const elapsed   = (serverNow() - game.countdownStartAt) / 1000;
    const remaining = Math.max(1, GAME.COUNTDOWN_SECONDS - Math.floor(elapsed));
    Board.showCountdown(remaining, () => {});

    // 카운트다운 시작 시 카드 덱이 생성됨 → 구독 1회만 등록
    if (!_boardDeckUnsub) {
      _boardDeckUnsub = onValue(R.deck(code, qi), snap => {
        if (!snap.exists()) return;
        const deck = deckToArray(snap.val());
        if (!_boardCardsReady) {
          Board.renderBoardCards(deck); // 최초 28장 렌더
          _boardCardsReady = true;
        } else {
          Board.updateBoardCards(deck); // 이후 뒤집힘 업데이트
        }
      });
    }
    return;
  }

  if (game.phase === PHASE.ANSWERING && q) {
    Board.showQuestion(q, qi, state.questions.length);
    return;
  }

  if (game.phase === PHASE.ENDED) {
    if (_boardDeckUnsub) { _boardDeckUnsub(); _boardDeckUnsub = null; }
    const rankings = await fetchRankings(code);
    Board.showCeremony(rankings);
  }
}

// =============================================
// 관리자 진입
// =============================================
function enterAdmin(code) {
  clearListeners();
  showView('view-admin');

  Admin.initAdminView({
    roomCode:         code,
    onStartCountdown: () => startCountdown(code),
    onNextQuestion:   () => nextQuestion(code, false),
    onSkipQuestion:   () => nextQuestion(code, true),
    onEndGame:        () => endGame(code),
    onFlipAllCards:   () => flipAllCards(code),
  });

  // 게임 상태 변화 → 문제 미리보기 + 플레이어 현황 갱신
  const unsubGame = onValue(R.gameState(code), async snap => {
    if (!snap.exists()) return;
    const game = snap.val();
    const qi   = game.currentQuestion;
    const q    = state.questions[qi];
    if (q) Admin.updateQuestionPreview(q, qi, state.questions.length);
    Admin.setCountdownEnabled(game.phase === PHASE.IDLE);
    Admin.setFlipAllEnabled(
      game.phase === PHASE.COUNTDOWN ||
      game.phase === PHASE.ANSWERING ||
      game.phase === PHASE.CARDING
    );

    // 종료 시 관리자 카드 프리뷰 정리 + 최종 순위 표시
    if (game.phase === PHASE.ENDED) {
      _adminEnded = true;
      if (_adminDeckUnsub) { _adminDeckUnsub(); _adminDeckUnsub = null; }
      _adminCardsReady = false; _adminDeckQIdx = -1;
      Admin.clearAdminCards();
      const rankings = await fetchRankings(code);
      Admin.showFinalRankings(rankings);
      return;
    }

    // IDLE 시 카드 프리뷰 초기화 + 캐시 초기화
    if (game.phase === PHASE.IDLE) {
      _adminEnded = false;
      _adminCachedAnswers = {};
      if (_adminDeckUnsub) { _adminDeckUnsub(); _adminDeckUnsub = null; }
      _adminCardsReady = false; _adminDeckQIdx = -1;
      Admin.clearAdminCards();
    }

    // COUNTDOWN 이후 페이즈에서 라운드별 1회 덱 구독
    if (game.phase !== PHASE.IDLE && qi !== _adminDeckQIdx) {
      if (_adminDeckUnsub) { _adminDeckUnsub(); _adminDeckUnsub = null; }
      _adminDeckQIdx   = qi;
      _adminCardsReady = false;
      _adminDeckUnsub  = onValue(R.deck(code, qi), snap => {
        if (!snap.exists()) return;
        const deck = deckToArray(snap.val());
        if (!_adminCardsReady) {
          Admin.renderAdminCards(deck);
          _adminCardsReady = true;
        } else {
          Admin.updateAdminCards(deck);
        }
      });
    }

    const [playerSnap, ansSnap] = await Promise.all([
      get(R.players(code)),
      get(R.answers(code, qi))
    ]);
    const players = playerSnap.exists() ? playerSnap.val() : {};
    const answers = ansSnap.exists()    ? ansSnap.val()    : {};
    _adminCachedAnswers = answers;
    Admin.updatePlayerStatus(players, answers);
  });

  // 정답 입력 단계에서 실시간 현황 갱신
  let watchQIdx   = -1;
  let unsubAdmAns = null;
  const unsubGame2 = onValue(R.gameState(code), snap => {
    if (!snap.exists()) return;
    const { currentQuestion, phase } = snap.val();
    if (phase === PHASE.ANSWERING && currentQuestion !== watchQIdx) {
      if (unsubAdmAns) unsubAdmAns();
      watchQIdx   = currentQuestion;
      unsubAdmAns = onValue(R.answers(code, currentQuestion), async snap => {
        const answers    = snap.exists() ? snap.val() : {};
        const playerSnap = await get(R.players(code));
        const players    = playerSnap.exists() ? playerSnap.val() : {};
        _adminCachedAnswers = answers;
        Admin.updatePlayerStatus(players, answers);
      });
    }
  });

  // 플레이어 목록 실시간 구독 (IDLE 중 입장자 즉시 표시)
  const unsubPlayers = onValue(R.players(code), snap => {
    if (_adminEnded) return;
    const players = snap.exists() ? snap.val() : {};
    Admin.updatePlayerStatus(players, _adminCachedAnswers);
  });

  const unsubMeta = onValue(R.meta(code), snap => {
    if (!snap.exists()) backToSetting();
  });

  state.unsubscribers.push(unsubGame, unsubGame2, unsubPlayers, unsubMeta);
}

// ── 카운트다운 시작 (카드 배분 포함) ──
async function startCountdown(code) {
  const gsSnap = await get(R.gameState(code));
  if (!gsSnap.exists()) return;
  const game = gsSnap.val();
  if (game.phase !== PHASE.IDLE) return;

  const qi = game.currentQuestion;

  // 카드 28장 생성 → Firebase cards/{qi}/deck 에 저장 (spec §2-1)
  const deck    = generateDeck(CARD_CONFIG);
  const deckObj = {};
  deck.forEach((card, idx) => { deckObj[idx] = { ...card, takenBy: null }; });
  await set(R.deck(code, qi), deckObj);

  await update(R.gameState(code), {
    phase:            PHASE.COUNTDOWN,
    countdownStartAt: serverTimestamp()
  });

  setTimeout(async () => {
    const fresh = await get(R.gameState(code));
    if (fresh.val()?.phase !== PHASE.COUNTDOWN) return;
    await update(R.gameState(code), {
      phase:           PHASE.ANSWERING,
      questionStartAt: serverTimestamp()
    });
  }, GAME.COUNTDOWN_SECONDS * 1000);
}

// ── 다음 문제 / 건너뛰기 ──
async function nextQuestion(code, skip = false) {
  const gsSnap = await get(R.gameState(code));
  if (!gsSnap.exists()) return;
  const game    = gsSnap.val();
  const nextIdx = game.currentQuestion + (skip ? 2 : 1);

  if (nextIdx >= state.questions.length) {
    await endGame(code);
    return;
  }

  await update(R.gameState(code), {
    currentQuestion:  nextIdx,
    phase:            PHASE.IDLE,
    countdownStartAt: null,
    questionStartAt:  null
  });
}

// ── 게임 종료 ──
async function endGame(code) {
  await update(R.gameState(code), { phase: PHASE.ENDED });
  await update(R.meta(code),      { status: 'ended' });
}

// ── 최종 순위 산출 (누적 점수 내림차순) ──
async function fetchRankings(code) {
  const snap = await get(R.players(code));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([nick, p]) => ({ nickname: nick, totalScore: p.totalScore || 0 }))
    .sort((a, b) => b.totalScore - a.totalScore);
}

// ── 카드 모두 뒤집기 (확률 확인용) ──
// 선택되지 않은 카드 전체를 '—' 마커로 표시해 보드에 공개
async function flipAllCards(code) {
  const gsSnap = await get(R.gameState(code));
  if (!gsSnap.exists()) return;
  const { currentQuestion, phase } = gsSnap.val();
  if (phase === PHASE.IDLE || phase === PHASE.ENDED) return;

  const deckSnap = await get(R.deck(code, currentQuestion));
  if (!deckSnap.exists()) return;

  // 미선택 카드(takenBy === null)만 일괄 공개 마커로 업데이트
  const updates = {};
  Object.entries(deckSnap.val()).forEach(([idx, card]) => {
    if (card.takenBy == null) {
      updates[`rooms/${code}/cards/${currentQuestion}/deck/${idx}/takenBy`] = '—';
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(db, '/'), updates);
  }
}

// =============================================
// 학생 진입 (닉네임 방식)
// =============================================
async function enterStudent(code) {
  clearListeners();
  showView('view-client');
  Client.setRoomLabel(code);

  Client.renderNicknameInput({
    onEnter: (nickname) => enterWithNickname(code, nickname)
  });

  const unsubMeta = onValue(R.meta(code), snap => {
    if (!snap.exists()) backToSetting();
  });
  state.unsubscribers.push(unsubMeta);
}

async function enterWithNickname(code, nickname) {
  // 동일 닉네임이 이미 connected=true 이면 거부
  const pSnap = await get(R.player(code, nickname));
  if (pSnap.exists() && pSnap.val().connected) {
    Client.showNicknameError('이미 사용 중인 닉네임이에요. 다른 이름을 써주세요.');
    return;
  }

  state.myPlayerId = nickname;
  if (pSnap.exists()) {
    // 기존 플레이어가 재접속하는 경우: 누적 점수는 유지하고 접속 상태만 갱신
    await update(R.player(code, nickname), { connected: true });
  } else {
    // 처음 입장하는 플레이어: 점수 0으로 초기화
    await set(R.player(code, nickname), { nickname, connected: true, totalScore: 0 });
  }
  startStudentGameListener(code, nickname);
}

function startStudentGameListener(code, nickname) {
  Client.showWaiting('게임 시작을 기다리는 중...');

  const unsubGame = onValue(R.gameState(code), async snap => {
    if (!snap.exists()) return;
    await handleStudentGameUpdate(code, nickname, snap.val());
  });

  const unsubQuestions = onValue(R.questions(code), snap => {
    if (!snap.exists()) return;
    state.questions = Object.values(snap.val()).sort((a, b) => Number(a.num) - Number(b.num));
  });

  // 내 누적 점수 실시간 표시
  const unsubScore = onValue(R.player(code, nickname), snap => {
    if (!snap.exists()) return;
    Client.updateMyScore(snap.val().totalScore || 0);
  });

  window.addEventListener('beforeunload', () => {
    update(R.player(code, nickname), { connected: false });
  });

  state.unsubscribers.push(unsubGame, unsubQuestions, unsubScore);
}

async function handleStudentGameUpdate(code, nickname, game) {
  if (_cardSelectionActive) return; // 카드 선택 중에는 상태 변화 무시

  const qi = game.currentQuestion;

  if (game.phase === PHASE.IDLE) {
    _currentQIdx = -1;
    if (_watchUnsub) { _watchUnsub(); _watchUnsub = null; }
    Client.resetCountdownState();
    // 방 재생성 시 player 노드가 초기화돼도 접속 상태 복구
    const pSnap = await get(R.player(code, nickname));
    if (!pSnap.exists() || !pSnap.val().connected) {
      await update(R.player(code, nickname), { connected: true });
    }
    Client.showWaiting('다음 문제를 기다리는 중...');
    return;
  }

  if (game.phase === PHASE.COUNTDOWN) {
    const elapsed   = (serverNow() - game.countdownStartAt) / 1000;
    const remaining = Math.max(1, GAME.COUNTDOWN_SECONDS - Math.floor(elapsed));
    Client.showClientCountdown(remaining, () => {});
    return;
  }

  if (game.phase === PHASE.ANSWERING) {
    if (qi === _currentQIdx) return; // 같은 문제 중복 렌더 방지

    const ansSnap = await get(R.answer(code, qi, nickname));
    if (ansSnap.exists()) return; // 이미 제출한 경우

    _currentQIdx = qi;
    const q = state.questions[qi];
    if (!q) return;

    Client.showQuiz({
      playerId:         nickname,
      question:         q,
      questionStart:    game.questionStartAt,
      serverTimeOffset: _serverTimeOffset,
      onSubmit: async (result) => {
        await submitAnswer(code, qi, nickname, result);
        if (result.correct) {
          await startCardSelection(code, qi, nickname); // 정답자: 카드 선택
        } else {
          await startCardWatching(code, qi);            // 오답자: 구경 모드
        }
      }
    });
    return;
  }

  if (game.phase === PHASE.ENDED) {
    const rankings = await fetchRankings(code);
    Client.showCeremony(rankings, nickname);
  }
}

// ── 답변 제출 ──
async function submitAnswer(code, qIndex, nickname, { value, displayValue, correct, elapsedSec }) {
  const serialized = Array.isArray(value) ? JSON.stringify(value) : String(value);
  try {
    // pickedCards / gainedScore 는 카드 선택(carding) 단계에서 채워짐
    await set(R.answer(code, qIndex, nickname), {
      value:        serialized,
      displayValue: displayValue || serialized,
      correct,
      elapsedSec,
      submittedAt:  Date.now(),
      pickedCards:  [],
      gainedScore:  0
    });
  } catch (err) {
    console.error('[답변 저장 오류]', err);
  }
}

// =============================================
// 카드 선택 로직 (spec §2-2, §2-3)
// =============================================

// ── Firebase 트랜잭션으로 카드 선점 ──
// takenBy === null 일 때만 닉네임 기록 성공. 동시 탭 충돌은 서버가 직렬화.
async function claimCard(code, qi, cardIdx, nickname) {
  try {
    const result = await runTransaction(
      R.cardSlot(code, qi, cardIdx),
      (current) => {
        if (current === null)       return;        // 로컬 캐시 미스 → abort
        if (current.takenBy != null) return;       // 이미 선점 → abort
        return { ...current, takenBy: nickname };  // 선점 성공
      }
    );
    if (result.committed) return { success: true, card: result.snapshot.val() };
    return { success: false };
  } catch (err) {
    console.error('[카드 트랜잭션 오류]', err);
    return { success: false };
  }
}

// ── 정답자 카드 선택 흐름 ──
async function startCardSelection(code, qi, nickname) {
  _cardSelectionActive = true;

  // 실시간 덱 구독 → 다른 플레이어 픽이 내 화면에도 즉시 반영
  const deckUnsub = onValue(R.deck(code, qi), snap => {
    if (snap.exists()) Client.updateCardGrid(deckToArray(snap.val()));
  });

  try {
    const deckSnap = await get(R.deck(code, qi));
    if (!deckSnap.exists()) return;

    Client.initCardGrid(deckToArray(deckSnap.val()), false);

    let pickedCards  = [];
    let gainedScore  = 0;
    let isDoubleMode = false;

    while (true) {
      const cardIdx = await Client.waitForCardPick(isDoubleMode);
      const { success, card } = await claimCard(code, qi, cardIdx, nickname);

      if (!success) {
        Client.showCardClaimFail();
        continue;
      }

      pickedCards.push(cardIdx);

      if (!isDoubleMode && card.type === 'double') {
        // 2배카드 자체 점수 0점, 한 장 더 선택 (spec §2-3)
        await Client.showCardReveal(card, 0, true);
        isDoubleMode = true;
        continue;
      }

      // 일반/고위험 또는 2배 이후 두 번째 카드 — 부호 무관 2배 적용
      gainedScore = isDoubleMode ? card.score * 2 : card.score;
      await Client.showCardReveal(card, gainedScore, false);
      break;
    }

    await recordCardResult(code, qi, nickname, pickedCards, gainedScore);
    Client.showWaiting('관리자가 다음 문제로 넘길 때까지 기다려주세요...');

  } finally {
    deckUnsub();
    _cardSelectionActive = false;
  }
}

// ── 오답자 구경 모드 ──
async function startCardWatching(code, qi) {
  const deckSnap = await get(R.deck(code, qi));
  Client.initCardGrid(deckSnap.exists() ? deckToArray(deckSnap.val()) : [], true);

  _watchUnsub = onValue(R.deck(code, qi), snap => {
    if (snap.exists()) Client.updateCardGrid(deckToArray(snap.val()));
  });
}

// ── 카드 결과 Firebase 저장 ──
async function recordCardResult(code, qi, nickname, pickedCards, gainedScore) {
  await update(R.answer(code, qi, nickname), { pickedCards, gainedScore });

  // totalScore 트랜잭션으로 누적 (동시성 대비)
  await runTransaction(R.player(code, nickname), (current) => {
    if (!current) return { nickname, connected: true, totalScore: gainedScore };
    return { ...current, totalScore: (current.totalScore || 0) + gainedScore };
  });
}

// ── 카드 배분 로직 ──

function generateDeck(config) {
  const cards = [];

  const normalPool = buildWeightedPool(config.normal);
  for (let i = 0; i < config.normalCount; i++) {
    cards.push({ type: 'normal', score: pickWeighted(normalPool) });
  }

  const doubleEntry  = config.risk.find(r => r.score === 'double');
  const doubleMax    = doubleEntry?.max ?? 1;
  const riskFullPool = buildWeightedPool(config.risk);
  const riskNoDouble = buildWeightedPool(config.risk.filter(r => r.score !== 'double'));
  let doubleCount = 0;

  for (let i = 0; i < config.riskCount; i++) {
    const picked = pickWeighted(doubleCount < doubleMax ? riskFullPool : riskNoDouble);
    if (picked === 'double') {
      doubleCount++;
      cards.push({ type: 'double', score: 0 }); // 2배카드 자체 점수 0
    } else {
      cards.push({ type: 'risk', score: picked });
    }
  }

  // Fisher-Yates 셔플
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function buildWeightedPool(entries) {
  const pool = [];
  entries.forEach(e => { for (let w = 0; w < e.weight; w++) pool.push(e.score); });
  return pool;
}

function pickWeighted(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function deckToArray(deckObj) {
  return Object.entries(deckObj)
    .map(([idx, card]) => ({ index: parseInt(idx), ...card }))
    .sort((a, b) => a.index - b.index);
}

// ── 세팅으로 돌아가기 ──
function backToSetting() {
  clearListeners();
  state.roomCode   = null;
  state.role       = null;
  state.myPlayerId = null;
  _currentQIdx     = -1;
  _cardSelectionActive = false;
  if (_watchUnsub)     { _watchUnsub();     _watchUnsub     = null; }
  if (_boardDeckUnsub) { _boardDeckUnsub(); _boardDeckUnsub = null; }
  _boardCardsReady = false;
  if (_adminDeckUnsub) { _adminDeckUnsub(); _adminDeckUnsub = null; }
  _adminCardsReady = false; _adminDeckQIdx = -1;
  _adminCachedAnswers = {}; _adminEnded = false;

  showView('view-setting');
  initSettingView({
    onCreateRoom:  handleCreateRoom,
    onJoinStudent: (c) => handleJoin(c, 'student'),
    onJoinBoard:   (c) => handleJoin(c, 'board'),
    onJoinAdmin:   (c) => handleJoin(c, 'admin'),
  });
}

main().catch(console.error);
