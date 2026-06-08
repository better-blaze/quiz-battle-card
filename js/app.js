// =============================================
// app.js — Firebase 연결, 라우팅, 게임 오케스트레이션
// =============================================

import { initializeApp }                       from 'firebase/app';
import { getDatabase, ref, set, get, update,
         onValue, serverTimestamp, remove }     from 'firebase/database';

import { firebaseConfig, GAME, PHASE }          from './config.js';
import { initSettingView }                      from './setting.js';
import * as Board                               from './board.js';
import * as Client                              from './client.js';
import * as Admin                               from './admin.js';
import * as Sound                               from './sound.js';

// ── Firebase 초기화 ──
const fbApp = initializeApp(firebaseConfig);
const db    = getDatabase(fbApp);

// 서버-클라이언트 시계 차이(clock skew) 동기화
// 크롬북 등 기기 시계가 어긋나 있어도 서버 기준으로 정확한 시간을 계산
let _serverTimeOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), snap => {
  _serverTimeOffset = snap.val() || 0;
});

// 서버 현재 시간(ms) = 클라이언트 시간 + 오프셋
function serverNow() {
  return Date.now() + _serverTimeOffset;
}

// Firebase 경로 헬퍼
const R = {
  room:      (c)        => ref(db, `rooms/${c}`),
  meta:      (c)        => ref(db, `rooms/${c}/meta`),
  players:   (c)        => ref(db, `rooms/${c}/players`),
  player:    (c, p)     => ref(db, `rooms/${c}/players/${p}`),
  questions: (c)        => ref(db, `rooms/${c}/questions`),
  question:  (c, qi)    => ref(db, `rooms/${c}/questions/${qi}`),
  gameState: (c)        => ref(db, `rooms/${c}/gameState`),
  answers:   (c, qi)    => ref(db, `rooms/${c}/answers/${qi}`),
  answer:    (c, qi, p) => ref(db, `rooms/${c}/answers/${qi}/${p}`),
  scores:    (c)        => ref(db, `rooms/${c}/scores`),
  score:     (c, p)     => ref(db, `rooms/${c}/scores/${p}`),
};

// ── 전역 상태 ──
let state = {
  roomCode:      null,
  role:          null,   // 'admin' | 'student' | 'board'
  myPlayerId:    null,   // P1~P6 (학생용)
  playerCount:   4,
  useRandomKeys: true,   // 객관식 난수 모드 여부
  useScore:      false,  // 점수 기록 모드 여부
  questions:     [],
  playerIds:     [],
  unsubscribers: []
};

// 현재 표시 중인 문제 인덱스 (중복 렌더 방지)
let _currentQIdx = -1;

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

  // 상황판 팝업 창으로 열렸을 때: URL 파라미터로 자동 입장
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
async function handleCreateRoom(code, playerCount, questions, useRandomKeys = true, useScore = false) {
  // 이미 같은 코드의 방이 있으면 경고
  const existing = await get(R.meta(code));
  if (existing.exists()) {
    if (!confirm(`방 코드 "${code}"이 이미 존재합니다. 덮어쓰시겠습니까?`)) return;
  }

  state.playerCount = playerCount;
  state.playerIds   = GAME.PLAYER_IDS.slice(0, playerCount);

  // Firebase에 방 데이터 저장
  const playersInit = {};
  state.playerIds.forEach(pid => { playersInit[pid] = { connected: false }; });

  // 문제 배열을 객체로 변환 (Firebase는 배열을 객체로 저장)
  const questionsObj = {};
  questions.forEach((q, i) => { questionsObj[i] = q; });

  // 점수 기록 모드이면 모든 플레이어 점수를 0으로 초기화
  const scoresInit = {};
  if (useScore) state.playerIds.forEach(pid => { scoresInit[pid] = 0; });

  await set(R.room(code), {
    meta:      { playerCount, status: 'playing', createdAt: Date.now(), useRandomKeys, useScore },
    players:   playersInit,
    questions: questionsObj,
    scores:    useScore ? scoresInit : null,
    gameState: {
      currentQuestion: 0,
      phase:           PHASE.IDLE,
      countdownStartAt: null,
      questionStartAt:  null
    }
  });

  state.roomCode      = code;
  state.role          = 'admin';
  state.questions     = questions;
  state.useRandomKeys = useRandomKeys;
  state.useScore      = useScore;
  enterAdmin(code);

  // 상황판 팝업 자동 실행 (16:9 비율)
  const popup = window.open(
    `?room=${code}&role=board`,
    `board_${code}`,
    'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no'
  );
  if (!popup) {
    alert('상황판 팝업이 차단되었습니다.\n브라우저의 팝업 차단을 해제한 후 다시 시도해주세요.');
  }
}

// ── 방 참여 ──
async function handleJoin(code, role) {
  const snap = await get(R.meta(code));
  if (!snap.exists()) {
    alert('방을 찾을 수 없습니다. 방 코드를 확인하세요.');
    return;
  }
  const meta = snap.val();
  state.roomCode      = code;
  state.role          = role;
  state.playerCount   = meta.playerCount;
  state.playerIds     = GAME.PLAYER_IDS.slice(0, meta.playerCount);
  state.useRandomKeys = meta.useRandomKeys !== false; // 누락 시 기본값 true
  state.useScore      = !!meta.useScore;              // 누락 시 기본값 false
  console.log('[handleJoin]', { role, useScore: state.useScore, raw: meta.useScore });

  // 문제 데이터 불러오기
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

// ── 리스너 해제 헬퍼 ──
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

  Board.renderPlayerPanels(state.playerIds, state.useScore);

  // 접속 상태 리스너
  const unsubPlayers = onValue(R.players(code), snap => {
    if (!snap.exists()) return;
    const players = snap.val();
    state.playerIds.forEach(pid => {
      Board.updateConnection(pid, !!(players[pid]?.connected));
    });
  });

  // 게임 상태 리스너
  const unsubGame = onValue(R.gameState(code), async snap => {
    if (!snap.exists()) return;
    const game = snap.val();
    handleBoardGameUpdate(code, game);
  });

  // 점수 리스너 (점수 기록 모드일 때만)
  if (state.useScore) {
    const unsubScores = onValue(R.scores(code), snap => {
      const scores = snap.exists() ? snap.val() : {};
      state.playerIds.forEach(pid => {
        Board.updateScore(pid, scores[pid] || 0);
      });
    });
    state.unsubscribers.push(unsubScores);
  }

  // 방 삭제 감지
  const unsubMeta = onValue(R.meta(code), snap => {
    if (!snap.exists()) backToSetting();
  });

  state.unsubscribers.push(unsubPlayers, unsubGame, unsubMeta);
}

let _boardAnswerUnsub = null;

async function handleBoardGameUpdate(code, game) {
  const qi = game.currentQuestion;
  const q  = state.questions[qi];

  if (game.phase === PHASE.IDLE) {
    Board.clearQuestion();
    if (_boardAnswerUnsub) { _boardAnswerUnsub(); _boardAnswerUnsub = null; }
    return;
  }

  if (game.phase === PHASE.COUNTDOWN) {
    // serverNow()로 서버 기준 elapsed 계산 → 기기 시계 차이 보정
    const elapsed   = (serverNow() - game.countdownStartAt) / 1000;
    const remaining = Math.max(1, GAME.COUNTDOWN_SECONDS - Math.floor(elapsed));
    Board.showCountdown(remaining, () => {});
    return;
  }

  if (game.phase === PHASE.ANSWERING && q) {
    let mcNumbers = null;
    if (q.type === '객관식' && state.useRandomKeys) {
      const qSnap = await get(R.question(code, qi));
      mcNumbers   = qSnap.val()?.randomKeys || null;
    }
    Board.showQuestion(q, qi, state.questions.length, { mcNumbers, useRandomKeys: state.useRandomKeys });

    // 답변 실시간 리스너
    if (_boardAnswerUnsub) { _boardAnswerUnsub(); _boardAnswerUnsub = null; }
    _boardAnswerUnsub = onValue(R.answers(code, qi), snap => {
      const answers      = snap.exists() ? snap.val() : {};
      const correctCount = Object.values(answers).filter(a => a.correct).length;
      Board.updateAnswers(answers, correctCount);
    });
    return;
  }

  if (game.phase === PHASE.ENDED) {
    Board.showCeremony();
  }
}

// =============================================
// 관리자 진입
// =============================================
function enterAdmin(code) {
  clearListeners();
  showView('view-admin');

  Admin.initAdminView({
    roomCode:          code,
    onStartCountdown:  () => startCountdown(code),
    onNextQuestion:    () => nextQuestion(code, false),
    onSkipQuestion:    () => nextQuestion(code, true),
    onEndGame:         () => endGame(code),
  });

  // 게임 상태 리스너
  const unsubGame = onValue(R.gameState(code), async snap => {
    if (!snap.exists()) return;
    const game = snap.val();
    const qi   = game.currentQuestion;
    const q    = state.questions[qi];
    if (q) Admin.updateQuestionPreview(q, qi, state.questions.length);
    Admin.setCountdownEnabled(game.phase === PHASE.IDLE);

    // 플레이어 상태 업데이트
    const [playerSnap, ansSnap] = await Promise.all([
      get(R.players(code)),
      get(R.answers(code, qi))
    ]);
    const players = playerSnap.exists() ? playerSnap.val() : {};
    const answers = ansSnap.exists()    ? ansSnap.val()    : {};
    Admin.updatePlayerStatus(state.playerIds, players, answers);
  });

  // 답변 실시간 리스너 (answering 단계 진입 시 재구독)
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
        Admin.updatePlayerStatus(state.playerIds, players, answers);
      });
    }
  });

  // 방 삭제 감지
  const unsubMeta = onValue(R.meta(code), snap => {
    if (!snap.exists()) backToSetting();
  });

  state.unsubscribers.push(unsubGame, unsubGame2, unsubMeta);
}

// ── 카운트다운 시작 ──
async function startCountdown(code) {
  const gsSnap = await get(R.gameState(code));
  if (!gsSnap.exists()) return;
  const game = gsSnap.val();
  if (game.phase !== PHASE.IDLE) return;

  const qi = game.currentQuestion;
  const q  = state.questions[qi];

  // 난수 모드일 때만 randomKeys 생성·저장 (클릭 모드에서는 불필요)
  if (q?.type === '객관식' && state.useRandomKeys) {
    const nums = generateMcNumbers(q.choices.length);
    await update(R.question(code, qi), { randomKeys: nums });
  }

  // serverTimestamp()를 사용해 서버 기준 절대 시간으로 저장 (기기 시계 차이 무관)
  await update(R.gameState(code), {
    phase:           PHASE.COUNTDOWN,
    countdownStartAt: serverTimestamp()
  });

  // 5초 후 answering 단계로 자동 전환
  setTimeout(async () => {
    const fresh = await get(R.gameState(code));
    if (fresh.val()?.phase !== PHASE.COUNTDOWN) return;
    await update(R.gameState(code), {
      phase:          PHASE.ANSWERING,
      questionStartAt: serverTimestamp()
    });
  }, GAME.COUNTDOWN_SECONDS * 1000);
}

// 10~99 사이 난수를 n개 중복 없이 생성
function generateMcNumbers(n) {
  const pool = [];
  while (pool.length < n) {
    const r = Math.floor(Math.random() * 90) + 10;
    if (!pool.includes(r)) pool.push(r);
  }
  return pool;
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

// =============================================
// 학생 진입
// =============================================
async function enterStudent(code) {
  clearListeners();
  showView('view-client');

  Client.setRoomLabel(code);

  // 현재 접속된 플레이어 확인
  const playerSnap = await get(R.players(code));
  const players    = playerSnap.exists() ? playerSnap.val() : {};
  const takenIds   = Object.entries(players)
    .filter(([, v]) => v.connected)
    .map(([k]) => k);

  Client.renderPlayerSelect({
    playerIds: state.playerIds,
    takenIds,
    onSelect:  (pid) => selectPlayer(code, pid)
  });

  // 방 삭제 감지
  const unsubMeta = onValue(R.meta(code), snap => {
    if (!snap.exists()) backToSetting();
  });
  state.unsubscribers.push(unsubMeta);
}

async function selectPlayer(code, playerId) {
  state.myPlayerId = playerId;
  await update(R.player(code, playerId), { connected: true });
  startStudentGameListener(code, playerId);
}

function startStudentGameListener(code, playerId) {
  Client.showWaiting('게임 시작을 기다리는 중...');

  const unsubGame = onValue(R.gameState(code), async snap => {
    if (!snap.exists()) return;
    const game = snap.val();
    await handleStudentGameUpdate(code, playerId, game);
  });

  // 동일 방코드로 방이 재생성될 때 문제 데이터를 자동으로 갱신
  const unsubQuestions = onValue(R.questions(code), snap => {
    if (!snap.exists()) return;
    state.questions = Object.values(snap.val()).sort((a, b) => Number(a.num) - Number(b.num));
  });

  // 접속 끊김 처리: 브라우저 종료 시 connected=false
  window.addEventListener('beforeunload', () => {
    update(R.player(code, playerId), { connected: false });
  });

  state.unsubscribers.push(unsubGame, unsubQuestions);
}

async function handleStudentGameUpdate(code, playerId, game) {
  const qi = game.currentQuestion;

  if (game.phase === PHASE.IDLE) {
    _currentQIdx = -1;
    Client.resetCountdownState(); // 다음 카운트다운을 위해 플래그 초기화
    // 방 재생성(동일 코드 덮어쓰기) 시 players가 초기화되므로 접속 상태 재등록
    const pSnap = await get(R.player(code, playerId));
    if (!pSnap.exists() || !pSnap.val().connected) {
      await update(R.player(code, playerId), { connected: true });
    }
    Client.showWaiting('다음 문제를 기다리는 중...');
    return;
  }

  if (game.phase === PHASE.COUNTDOWN) {
    // serverNow()로 서버 기준 elapsed 계산 → 기기 시계 차이 보정
    const elapsed   = (serverNow() - game.countdownStartAt) / 1000;
    const remaining = Math.max(1, GAME.COUNTDOWN_SECONDS - Math.floor(elapsed));
    Client.showClientCountdown(remaining, () => {});
    return;
  }

  if (game.phase === PHASE.ANSWERING) {
    // 이미 이 문제를 렌더링했으면 중복 방지
    if (qi === _currentQIdx) return;

    // 이미 제출한 답이 있는지 확인
    const ansSnap = await get(R.answer(code, qi, playerId));
    if (ansSnap.exists()) return; // 제출 완료 상태 유지

    _currentQIdx = qi;
    const q = state.questions[qi];
    if (!q) return;

    // 난수 모드일 때만 randomKeys 읽기
    let mcNumbers = null;
    if (q.type === '객관식' && state.useRandomKeys) {
      const qSnap = await get(R.question(code, qi));
      const raw   = qSnap.val()?.randomKeys;
      if (raw != null) {
        mcNumbers = Array.isArray(raw) ? raw : Object.values(raw);
      }
    }

    Client.showQuiz({
      playerId,
      question:         q,
      mcNumbers,
      questionStart:    game.questionStartAt,
      serverTimeOffset: _serverTimeOffset,
      useRandomKeys:    state.useRandomKeys, // 클라이언트 UI 모드 전달
      onSubmit: (result) => submitAnswer(code, qi, playerId, result)
    });
    return;
  }

  if (game.phase === PHASE.ENDED) {
    Client.showCeremony();
  }
}

// ── 학생 답변 제출 ──
async function submitAnswer(code, qIndex, playerId, { value, displayValue, correct, elapsedSec }) {
  // 직렬화: 배열은 JSON 문자열로 저장
  const serialized = Array.isArray(value) ? JSON.stringify(value) : String(value);

  try {
    await set(R.answer(code, qIndex, playerId), {
      value:        serialized,
      displayValue: displayValue || serialized,
      correct,
      elapsedSec,
      submittedAt:  Date.now()
    });
  } catch (err) {
    console.error('[답변 저장 오류]', err);
    return;
  }

  // 정답이면 점수 증가 시도
  // state.useScore 대신 Firebase meta를 직접 읽어 신뢰성 확보
  if (correct) {
    try {
      const metaSnap = await get(R.meta(code));
      const useScore = !!(metaSnap.exists() && metaSnap.val()?.useScore);
      console.log('[점수 체크]', { correct, useScore, playerId });

      if (useScore) {
        const scoreSnap = await get(R.score(code, playerId));
        const newScore  = (scoreSnap.val() ?? 0) + 1;
        await set(R.score(code, playerId), newScore);
        console.log('[점수 업데이트]', { playerId, newScore });
      }
    } catch (err) {
      console.error('[점수 업데이트 오류]', err);
    }
  }
}

// ── 세팅으로 돌아가기 ──
function backToSetting() {
  clearListeners();
  state.roomCode   = null;
  state.role       = null;
  state.myPlayerId = null;
  _currentQIdx     = -1;
  showView('view-setting');
  initSettingView({
    onCreateRoom:  handleCreateRoom,
    onJoinStudent: (c) => handleJoin(c, 'student'),
    onJoinBoard:   (c) => handleJoin(c, 'board'),
    onJoinAdmin:   (c) => handleJoin(c, 'admin'),
  });
}

// 앱 시작
main().catch(console.error);
