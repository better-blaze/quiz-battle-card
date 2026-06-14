// =============================================
// client.js — 클라이언트 뷰 렌더링 및 퀴즈 입력 처리
// =============================================

import * as Sound from './sound.js';
import { checkShortAnswer, checkMultipleChoice, checkMatching,
         checkMultiAnswer, checkOrder } from './quiz.js';

// 클라이언트 단계 전환
export function showSection(id) {
  document.querySelectorAll('.client-section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ── 플레이어 선택 화면 ──
export function renderPlayerSelect({ playerIds, takenIds, onSelect }) {
  showSection('cs-player-select');
  const wrap = document.getElementById('cs-player-buttons');
  if (!wrap) return;
  wrap.innerHTML = '';
  playerIds.forEach(pid => {
    const btn = document.createElement('button');
    btn.className   = 'cs-player-btn' + (takenIds.includes(pid) ? ' taken' : '');
    btn.textContent = pid;
    btn.disabled    = takenIds.includes(pid);
    btn.addEventListener('click', () => !btn.disabled && onSelect(pid));
    wrap.appendChild(btn);
  });
}

// 방 코드 표시
export function setRoomLabel(code) {
  const el = document.getElementById('cs-room-label');
  if (el) el.textContent = `방 코드: ${code}`;
}

// ── 대기 화면 ──
export function showWaiting(msg = '게임 시작 대기 중...') {
  showSection('cs-waiting');
  const el = document.getElementById('cs-wait-msg');
  if (el) el.textContent = msg;
}

// ── 카운트다운 화면 ──
let _cdTimer  = null;
let _cdActive = false; // 카운트다운 중복 실행 방지 플래그

export function showClientCountdown(seconds, onDone) {
  if (_cdActive) return; // 이미 카운트다운 진행 중이면 무시 (Firebase 이중 트리거 방지)
  _cdActive = true;

  showSection('cs-countdown');
  clearInterval(_cdTimer);
  const numEl = document.getElementById('cs-countdown-num');
  let n = seconds;
  if (numEl) numEl.textContent = n;
  Sound.playCountdownStart();

  _cdTimer = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(_cdTimer);
      _cdActive = false;
      if (numEl) numEl.textContent = 'GO!';
      Sound.playLastTick();
      setTimeout(() => { if (onDone) onDone(); }, 600);
    } else {
      if (numEl) numEl.textContent = n;
      Sound.playTick();
    }
  }, 1000);
}

// 다음 문제 시작 전(IDLE 단계) 카운트다운 상태 초기화
export function resetCountdownState() {
  _cdActive = false;
  clearInterval(_cdTimer);
}

// ── 퀴즈 화면 ──
let _timerInterval    = null;
let _questionStartTime = null;
let _serverTimeOffset  = 0; // app.js에서 전달받는 서버-클라이언트 시계 보정값
let _submitted         = false;

// 서버 기준 현재 시간 (기기 시계 차이 보정)
function serverNow() {
  return Date.now() + _serverTimeOffset;
}

// 이전 문제에서 잠긴 입력 요소를 다음 문제를 위해 다시 활성화
function unlockInputs() {
  document.querySelectorAll('#cq-answer-area button, #cq-answer-area input').forEach(el => {
    el.disabled = false;
  });
  document.querySelectorAll('.match-item, .multi-choice-btn, .order-choice-btn').forEach(el => {
    el.style.pointerEvents = '';
  });
  const area = document.getElementById('cq-answer-area');
  if (area) area.style.opacity = '';
}

export function showQuiz({ playerId, question, mcNumbers, questionStart, serverTimeOffset = 0, useRandomKeys = true, onSubmit }) {
  showSection('cs-quiz');
  _submitted         = false;
  _questionStartTime = questionStart;
  _serverTimeOffset  = serverTimeOffset; // 보정값 저장
  unlockInputs();

  // 플레이어 배지
  const badge = document.getElementById('cq-player-badge');
  if (badge) badge.textContent = playerId;

  // 문제 유형 배지
  const typeBadge = document.getElementById('cq-q-type-badge');
  if (typeBadge) typeBadge.textContent = question.type;

  // 문제 내용
  const qText = document.getElementById('cq-q-text');
  if (qText) qText.textContent = question.content;

  // 이미지
  const qImg = document.getElementById('cq-q-img');
  if (qImg) {
    if (question.imageUrl) {
      qImg.src = question.imageUrl;
      qImg.classList.remove('hidden');
    } else {
      qImg.classList.add('hidden');
    }
  }

  // 결과 숨김
  const resultEl = document.getElementById('cq-result');
  if (resultEl) { resultEl.classList.add('hidden'); resultEl.innerHTML = ''; }

  // 모든 입력 영역 숨김
  ['cq-mc','cq-sa','cq-match','cq-multi','cq-order'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });

  // 타이머 시작
  startTimer();

  // 유형별 입력 렌더링
  switch (question.type) {
    case '객관식':   renderMC(question, mcNumbers, onSubmit, useRandomKeys); break;
    case '단답형':   renderSA(question, onSubmit);               break;
    case '선잇기':   renderMatching(question, onSubmit);         break;
    case '복수정답': renderMultiAnswer(question, onSubmit);      break;
    case '순서':     renderOrder(question, onSubmit);            break;
  }
}

// 타이머 표시
function startTimer() {
  clearInterval(_timerInterval);
  const el = document.getElementById('cq-timer');
  _timerInterval = setInterval(() => {
    if (!_questionStartTime) return;
    const elapsed = Math.max(0, (serverNow() - _questionStartTime) / 1000);
    if (el) el.textContent = elapsed.toFixed(1) + '초';
  }, 100);
}

function stopTimer() {
  clearInterval(_timerInterval);
}

function getElapsed() {
  if (!_questionStartTime) return 0;
  // Math.max(0, ...) 으로 시계 차이로 인한 음수 방지
  return Math.max(0, (serverNow() - _questionStartTime) / 1000);
}

// 제출 공통 처리
function doSubmit(value, displayValue, question, mcNumbers, onSubmit) {
  if (_submitted) return;
  _submitted = true;
  stopTimer();
  const elapsed = getElapsed();

  // 정답 판정
  let correct = false;
  if (question.type === '객관식') {
    const normalize = s => String(s).replace(/\s+/g, '').toLowerCase();
    const choices   = toArray(question.choices);
    const mcNums    = mcNumbers ? toArray(mcNumbers) : null;

    if (mcNums && mcNums.length > 0) {
      // 난수 모드: 입력된 번호와 정답 번호 비교
      const normalAns = normalize(question.rawAnswer);
      let correctIdx  = choices.findIndex(c => normalize(c) === normalAns);
      if (correctIdx < 0 && question.correctChoiceIdx >= 0) correctIdx = question.correctChoiceIdx;
      if (correctIdx < 0) {
        const numIdx = parseInt(question.rawAnswer, 10) - 1;
        if (!isNaN(numIdx) && numIdx >= 0 && numIdx < choices.length) correctIdx = numIdx;
      }
      const correctNum = correctIdx >= 0 ? mcNums[correctIdx] : -1;
      console.log('[객관식 판정-난수]', { rawAnswer: question.rawAnswer, correctIdx, correctNum, input: value });
      correct = checkMultipleChoice(value, correctNum);
    } else {
      // 클릭 모드: 난수 모드와 동일한 3단계 전략으로 정답 인덱스를 구한 뒤 인덱스 비교
      // (rawAnswer가 텍스트든 숫자든 모두 처리)
      const normalAns  = normalize(question.rawAnswer);
      let correctIdx   = choices.findIndex(ch => normalize(ch) === normalAns);
      if (correctIdx < 0 && question.correctChoiceIdx >= 0) correctIdx = question.correctChoiceIdx;
      if (correctIdx < 0) {
        const numIdx = parseInt(question.rawAnswer, 10) - 1;
        if (!isNaN(numIdx) && numIdx >= 0 && numIdx < choices.length) correctIdx = numIdx;
      }
      const clickedIdx = choices.findIndex(ch => normalize(ch) === normalize(value));
      correct = clickedIdx !== -1 && clickedIdx === correctIdx;
      console.log('[객관식 판정-클릭]', { rawAnswer: question.rawAnswer, correctIdx, clickedIdx, correct });
    }
  } else if (question.type === '단답형') {
    correct = checkShortAnswer(value, question.rawAnswer);
  } else if (question.type === '선잇기') {
    correct = checkMatching(value, question.matchPairs);
  } else if (question.type === '복수정답') {
    correct = checkMultiAnswer(value, question.correctIndices);
  } else if (question.type === '순서') {
    correct = checkOrder(value, question.correctOrder);
  }

  // 사운드
  if (correct) Sound.playCorrect(); else Sound.playWrong();

  // 결과 표시
  showResult(correct, elapsed);

  // 입력 잠금
  lockInputs();

  // 콜백
  onSubmit({ value, displayValue, correct, elapsedSec: elapsed });
}

function lockInputs() {
  document.querySelectorAll('#cq-answer-area button, #cq-answer-area input').forEach(el => {
    el.disabled = true;
  });
  document.querySelectorAll('.match-item, .multi-choice-btn, .order-choice-btn').forEach(el => {
    el.style.pointerEvents = 'none';
  });
}

function showResult(correct, elapsed) {
  const area = document.getElementById('cq-answer-area');
  if (area) area.style.opacity = '0.4';

  const resultEl = document.getElementById('cq-result');
  if (!resultEl) return;
  resultEl.innerHTML = correct
    ? `<div class="result-correct">✅ 정답!</div><div class="result-time">${elapsed.toFixed(1)}초</div>`
    : `<div class="result-wrong">❌ 오답</div><div class="result-time">${elapsed.toFixed(1)}초</div>`;
  resultEl.classList.remove('hidden');
}

// Firebase가 배열을 객체로 반환할 수 있어 항상 배열로 정규화
function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : Object.values(v);
}

// 보기 텍스트가 http(s)://로 시작하면 <img> HTML, 아니면 텍스트 span HTML 반환
function choiceContentHtml(text) {
  if (/^https?:\/\//i.test(text)) {
    const img = document.createElement('img');
    img.src       = text;
    img.className = 'choice-img';
    img.alt       = '이미지 보기';
    return img.outerHTML;
  }
  const span = document.createElement('span');
  span.textContent = text;
  return span.outerHTML;
}

// URL 보기의 표시 이름 반환 (순서 선택 표시·응답 기록 등에서 사용)
function choiceLabel(text, index) {
  return /^https?:\/\//i.test(text) ? `이미지 ${index + 1}` : text;
}

// ── 객관식 ──
function renderMC(q, mcNumbers, onSubmit, useRandomKeys) {
  const wrap        = document.getElementById('cq-mc');
  const choicesWrap = document.getElementById('cq-mc-choices');
  const input       = document.getElementById('cq-mc-input');
  const inputRow    = document.getElementById('cq-mc-input-row');
  const btnSubmit   = document.getElementById('btn-mc-submit');
  if (!wrap) return;

  wrap.classList.remove('hidden');
  choicesWrap.innerHTML = '';

  // 매 렌더링 시작 시 입력행·input 표시 상태를 명시적으로 초기화
  // (이전 클릭 모드 렌더링에서 남은 style 잔여값 제거)
  if (inputRow) inputRow.style.display = '';
  if (input)    input.style.display    = '';

  const choices = toArray(q.choices);
  const mcNums  = mcNumbers ? toArray(mcNumbers) : null;

  if (useRandomKeys && mcNums && mcNums.length > 0) {
    // ── 난수 모드: 번호 표시 + 숫자 타이핑 ──
    input.value        = '';
    btnSubmit.disabled = false;

    choices.forEach((c, i) => {
      const item = document.createElement('div');
      item.className = 'mc-choice-item';
      item.innerHTML = `<span class="mc-choice-num">${mcNums[i]}</span>${choiceContentHtml(c)}`;
      choicesWrap.appendChild(item);
    });

    const submit = () => {
      const val = input.value.trim();
      if (!val) return;
      doSubmit(val, val, { ...q, choices }, mcNums, onSubmit);
    };
    btnSubmit.onclick = submit;
    input.onkeydown   = (e) => { if (e.key === 'Enter') submit(); };
    input.focus();
  } else {
    // ── 클릭 모드: 번호·입력행 숨기고 보기 버튼 클릭 → 즉시 제출 ──
    if (inputRow) inputRow.style.display = 'none';

    choices.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'mc-click-btn';
      btn.innerHTML = choiceContentHtml(c);
      btn.addEventListener('click', () => {
        choicesWrap.querySelectorAll('.mc-click-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        doSubmit(c, choiceLabel(c, choices.indexOf(c)), { ...q, choices }, null, onSubmit);
      });
      choicesWrap.appendChild(btn);
    });
  }
}

// ── 단답형 ──
function renderSA(q, onSubmit) {
  const wrap    = document.getElementById('cq-sa');
  const input   = document.getElementById('cq-sa-input');
  const btnSub  = document.getElementById('btn-sa-submit');
  if (!wrap) return;

  wrap.classList.remove('hidden');
  input.value = '';

  const submit = () => {
    const val = input.value.trim();
    if (!val) return;
    doSubmit(val, val, q, null, onSubmit);
  };
  btnSub.onclick = submit;
  input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
  input.focus();
}

// ── 선 잇기 ──
// 참고: team-quiz-battle의 MatchingCanvas 클래스 방식
// canvas는 선 그리기 전용(pointer-events:none), 클릭은 .match-item 에 직접
function renderMatching(q, onSubmit) {
  const wrap    = document.getElementById('cq-match');
  const leftCol = document.getElementById('cq-left-col');
  const rightCol= document.getElementById('cq-right-col');
  const canvas  = document.getElementById('cq-match-canvas');
  const btnSub  = document.getElementById('btn-match-submit');
  if (!wrap) return;

  wrap.classList.remove('hidden');
  btnSub.disabled    = true;
  btnSub.textContent = '모두 연결 후 제출';

  const pairs      = toArray(q.matchPairs);
  const leftItems  = pairs.map(p => p.left);
  const rightItems = [...pairs].sort(() => Math.random() - 0.5).map(p => p.right);

  leftCol.innerHTML  = '';
  rightCol.innerHTML = '';

  // 연결 상태: { leftIdx: rightIdx }
  const connections = {};
  let selectedLeft  = null;

  // 왼쪽 항목 — 클릭 시 선택/해제
  const leftEls = leftItems.map((text, i) => {
    const div = document.createElement('div');
    div.className   = 'match-item';
    div.textContent = text;
    div.addEventListener('click', () => {
      selectedLeft = (selectedLeft === i) ? null : i;
      updateStyles();
      draw();
    });
    leftCol.appendChild(div);
    return div;
  });

  // 오른쪽 항목 — 왼쪽이 선택된 상태에서 클릭 시 연결
  const rightEls = rightItems.map((text, j) => {
    const div = document.createElement('div');
    div.className   = 'match-item';
    div.textContent = text;
    div.addEventListener('click', () => {
      if (selectedLeft === null) return;
      // 이 오른쪽 항목에 이미 연결된 왼쪽 항목 해제
      Object.keys(connections).forEach(li => {
        if (connections[li] === j) delete connections[li];
      });
      connections[selectedLeft] = j;
      selectedLeft = null;
      updateStyles();
      draw();
      checkAllConnected();
    });
    rightCol.appendChild(div);
    return div;
  });

  function updateStyles() {
    leftEls.forEach((el, i) => {
      el.classList.toggle('selected',  selectedLeft === i);
      el.classList.toggle('connected', connections[i] !== undefined);
    });
    rightEls.forEach((el, j) => {
      el.classList.toggle('connected', Object.values(connections).includes(j));
    });
  }

  const ctx = canvas.getContext('2d');

  function draw() {
    const cRect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'var(--c-primary, #7c6ff7)';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';

    Object.entries(connections).forEach(([li, ri]) => {
      const lEl = leftEls[parseInt(li)];
      const rEl = rightEls[parseInt(ri)];
      if (!lEl || !rEl) return;
      const lRect = lEl.getBoundingClientRect();
      const rRect = rEl.getBoundingClientRect();
      // 왼쪽 항목 오른쪽 끝 → 오른쪽 항목 왼쪽 끝
      ctx.beginPath();
      ctx.moveTo(lRect.right - cRect.left, lRect.top + lRect.height / 2 - cRect.top);
      ctx.lineTo(rRect.left  - cRect.left, rRect.top + rRect.height / 2 - cRect.top);
      ctx.stroke();
    });
  }

  function resizeCanvas() {
    canvas.width  = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;
    draw();
  }

  function checkAllConnected() {
    const done     = leftItems.every((_, i) => connections[i] !== undefined);
    btnSub.disabled    = !done;
    btnSub.textContent = done ? '제출' : '모두 연결 후 제출';
  }

  const ro = new ResizeObserver(resizeCanvas);
  ro.observe(canvas.parentElement);
  setTimeout(resizeCanvas, 50);

  btnSub.onclick = () => {
    ro.disconnect();
    const submittedPairs = Object.entries(connections).map(([li, ri]) => ({
      left:  leftItems[parseInt(li)],
      right: rightItems[parseInt(ri)]
    }));
    const displayVal = submittedPairs.map(p => `${p.left}:${p.right}`).join(' | ');
    doSubmit(submittedPairs, displayVal, q, null, onSubmit);
  };
}

// ── 복수정답 ──
function renderMultiAnswer(q, onSubmit) {
  const wrap   = document.getElementById('cq-multi');
  const choices = document.getElementById('cq-multi-choices');
  const btnSub  = document.getElementById('btn-multi-submit');
  if (!wrap) return;

  wrap.classList.remove('hidden');
  choices.innerHTML  = '';
  const selected = new Set();

  q.choices.forEach((c, i) => {
    const btn = document.createElement('button');
    btn.className = 'multi-choice-btn';
    btn.innerHTML = choiceContentHtml(c);
    btn.addEventListener('click', () => {
      if (selected.has(i)) { selected.delete(i); btn.classList.remove('selected'); }
      else                 { selected.add(i);    btn.classList.add('selected'); }
    });
    choices.appendChild(btn);
  });

  btnSub.onclick = () => {
    const arr = [...selected].sort((a,b) => a-b);
    const displayVal = arr.map(i => q.choices[i]).join(', ');
    doSubmit(arr, displayVal, q, null, onSubmit);
  };
}

// ── 순서 ──
function renderOrder(q, onSubmit) {
  const wrap      = document.getElementById('cq-order');
  const choicesWr = document.getElementById('cq-order-choices');
  const seqEl     = document.getElementById('cq-order-sequence');
  const btnSub    = document.getElementById('btn-order-submit');
  if (!wrap) return;

  wrap.classList.remove('hidden');
  choicesWr.innerHTML = '';
  seqEl.textContent   = '선택된 순서: (없음)';
  const sequence = []; // 선택된 인덱스 순서

  const btns = q.choices.map((c, i) => {
    const btn = document.createElement('button');
    btn.className   = 'order-choice-btn';
    btn.dataset.idx = i;
    btn.innerHTML   = `<span class="order-seq-num" id="oseq-${i}"></span>${choiceContentHtml(c)}`;
    btn.addEventListener('click', () => {
      const pos = sequence.indexOf(i);
      if (pos !== -1) {
        // 이미 선택된 항목 클릭 → 해당 위치 이후 전체 취소
        const removed = sequence.splice(pos);
        removed.forEach(ri => {
          btns[ri].classList.remove('selected');
          document.getElementById(`oseq-${ri}`).textContent = '';
        });
      } else {
        // 새로 선택
        sequence.push(i);
        btn.classList.add('selected');
        document.getElementById(`oseq-${i}`).textContent = sequence.length;
      }
      // 순서 텍스트 갱신
      seqEl.textContent = sequence.length
        ? '선택된 순서: ' + sequence.map(idx => choiceLabel(q.choices[idx], idx)).join(' → ')
        : '선택된 순서: (없음)';
    });
    choicesWr.appendChild(btn);
    return btn;
  });

  btnSub.onclick = () => {
    const displayVal = sequence.map(i => q.choices[i]).join(' → ');
    doSubmit([...sequence], displayVal, q, null, onSubmit);
  };
}

// ── 시상식 화면 ──
export function showCeremony() {
  showSection('cs-ceremony');
}
