// =============================================
// board.js — 상황판 뷰 렌더링
// =============================================

import * as Sound from './sound.js';

// 플레이어 패널 초기 렌더링
export function renderPlayerPanels(playerIds) {
  const wrap = document.getElementById('board-players');
  if (!wrap) return;
  wrap.innerHTML = '';
  playerIds.forEach(pid => {
    const div = document.createElement('div');
    div.className   = 'player-panel';
    div.id          = `panel-${pid}`;
    div.innerHTML   = `
      <div class="player-name">${pid}</div>
      <div class="player-status-dot" id="dot-${pid}"></div>
      <div class="player-submit-badge" id="badge-${pid}">대기 중</div>
      <div class="player-rank-badge"   id="rank-${pid}"></div>
      <div class="player-response"     id="resp-${pid}"></div>
    `;
    wrap.appendChild(div);
  });
}

// 접속 상태 업데이트
export function updateConnection(pid, connected) {
  const dot = document.getElementById(`dot-${pid}`);
  if (!dot) return;
  dot.classList.toggle('connected', connected);
}

// Firebase 배열/객체 모두 처리
function toArr(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : Object.values(v);
}

// 문제 표시
export function showQuestion(q, qIndex, total, options = {}) {
  const phaseEl   = document.getElementById('board-phase-label');
  const infoEl    = document.getElementById('board-q-info');
  const textEl    = document.getElementById('board-q-text');
  const choicesEl = document.getElementById('board-q-choices');
  const imgEl     = document.getElementById('board-q-img');

  if (phaseEl) phaseEl.textContent = '문제 진행 중';
  if (infoEl)  infoEl.textContent  = `문제 ${qIndex + 1} / ${total}  [${q.type}]`;
  if (textEl)  textEl.textContent  = q.content;
  if (choicesEl) choicesEl.innerHTML = '';

  if (imgEl) {
    if (q.imageUrl) {
      imgEl.src = q.imageUrl;
      imgEl.classList.remove('hidden');
      imgEl.onclick = () => imgEl.classList.toggle('zoomed');
    } else {
      imgEl.classList.add('hidden');
      imgEl.src = '';
    }
  }

  // 객관식: 난수 번호와 함께 보기 표시
  if (q.type === '객관식' && options.mcNumbers && choicesEl) {
    const nums    = toArr(options.mcNumbers);
    const choices = toArr(q.choices);
    choicesEl.innerHTML = choices.map((c, i) =>
      `<div class="board-choice-item">
        <span class="board-choice-num">${nums[i]}</span>${c}
      </div>`
    ).join('');
  }

  // 복수정답·순서: 번호(1,2,3…)와 함께 보기 표시
  if ((q.type === '복수정답' || q.type === '순서') && choicesEl) {
    const choices = toArr(q.choices);
    choicesEl.innerHTML = choices.map((c, i) =>
      `<div class="board-choice-item">
        <span class="board-choice-num">${i + 1}</span>${c}
      </div>`
    ).join('');
  }

  // 선잇기: 왼쪽·오른쪽 항목을 2열로 표시 (오른쪽은 셔플)
  if (q.type === '선잇기' && choicesEl) {
    const pairs         = toArr(q.matchPairs);
    const shuffledRight = [...pairs].sort(() => Math.random() - 0.5).map(p => p.right);
    choicesEl.innerHTML = `
      <div class="board-match-col">
        ${pairs.map(p => `<div class="board-choice-item">${p.left}</div>`).join('')}
      </div>
      <div class="board-match-col board-match-col-right">
        ${shuffledRight.map(r => `<div class="board-choice-item">${r}</div>`).join('')}
      </div>`;
  }

  hideCountdown();
  resetAllPanels();
}

// 카운트다운 표시
let _cdInterval = null;
export function showCountdown(startSec, onDone) {
  const el = document.getElementById('board-countdown');
  if (!el) return;
  el.classList.remove('hidden');

  clearInterval(_cdInterval);
  let n = startSec;
  el.textContent = n;
  Sound.playCountdownStart();

  _cdInterval = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(_cdInterval);
      el.textContent = 'START!';
      Sound.playLastTick();
      setTimeout(() => { el.classList.add('hidden'); if (onDone) onDone(); }, 800);
    } else {
      el.textContent = n;
      Sound.playTick();
    }
  }, 1000);
}

export function hideCountdown() {
  clearInterval(_cdInterval);
  const el = document.getElementById('board-countdown');
  if (el) el.classList.add('hidden');
}

// 문제 초기화 (idle 단계)
export function clearQuestion() {
  const phaseEl   = document.getElementById('board-phase-label');
  const infoEl    = document.getElementById('board-q-info');
  const textEl    = document.getElementById('board-q-text');
  const choicesEl = document.getElementById('board-q-choices');
  const imgEl     = document.getElementById('board-q-img');

  if (phaseEl)   phaseEl.textContent  = '대기 중';
  if (infoEl)    infoEl.textContent   = '';
  if (textEl)    textEl.textContent   = '';
  if (choicesEl) choicesEl.innerHTML  = '';
  if (imgEl)     { imgEl.classList.add('hidden'); imgEl.src = ''; }
  hideCountdown();
  resetAllPanels();
}

// 모든 플레이어 패널 초기화
function resetAllPanels() {
  document.querySelectorAll('.player-panel').forEach(p => {
    p.classList.remove('correct-flash', 'wrong-flash');
  });
  document.querySelectorAll('[id^="badge-"]').forEach(el => {
    el.textContent = '대기 중';
    el.className   = 'player-submit-badge';
  });
  document.querySelectorAll('[id^="rank-"]').forEach(el => { el.textContent = ''; el.className = 'player-rank-badge'; });
  document.querySelectorAll('[id^="resp-"]').forEach(el => { el.textContent = ''; });
}

// 개별 플레이어 답변 업데이트
// answers: { P1: {correct, displayValue, submittedAt, elapsedSec}, ... }
// correctCount: 정답 제출자 수
export function updateAnswers(answers, correctCount) {
  // 정답자 순위 계산 (submittedAt 기준 오름차순)
  const correctEntries = Object.entries(answers)
    .filter(([, a]) => a.correct)
    .sort((a, b) => (a[1].submittedAt || 0) - (b[1].submittedAt || 0));

  // 공동 순위 처리
  const rankMap = {};
  let rank = 1;
  for (let i = 0; i < correctEntries.length; i++) {
    const [pid] = correctEntries[i];
    if (i > 0 && correctEntries[i][1].submittedAt === correctEntries[i-1][1].submittedAt) {
      rankMap[pid] = rankMap[correctEntries[i-1][0]];
    } else {
      rankMap[pid] = rank;
    }
    rank++;
  }

  Object.entries(answers).forEach(([pid, a]) => {
    const badgeEl = document.getElementById(`badge-${pid}`);
    const rankEl  = document.getElementById(`rank-${pid}`);
    const respEl  = document.getElementById(`resp-${pid}`);
    const panelEl = document.getElementById(`panel-${pid}`);
    if (!badgeEl) return;

    if (a.correct) {
      badgeEl.textContent = '정답!';
      badgeEl.className   = 'player-submit-badge correct';
      // 패널 초록 플래시
      panelEl?.classList.add('correct-flash');

      // 순위 배지
      if (rankEl) {
        const r = rankMap[pid];
        const medal = r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}등`;
        rankEl.textContent = medal;
        rankEl.className   = `player-rank-badge rank-${Math.min(r, 3)}`;
      }
    } else {
      badgeEl.textContent = '오답';
      badgeEl.className   = 'player-submit-badge wrong';
      panelEl?.classList.add('wrong-flash');
    }

    // 오답: 즉시 응답 내용 공개 / 정답: 3명 이상 정답 시 공개
    if (respEl) {
      if (!a.correct || correctCount >= 3) {
        respEl.textContent = a.displayValue || '';
      }
    }
  });
}

// 게임 종료 시상식 오버레이
export function showCeremony() {
  const overlay = document.getElementById('ceremony-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  Sound.playCeremony();
  startFireworks();
}

// 간단한 Canvas 불꽃놀이
function startFireworks() {
  const canvas = document.getElementById('fireworks-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx     = canvas.getContext('2d');
  const particles = [];

  const colors = ['#f1c40f','#e74c3c','#3498db','#2ecc71','#9b59b6','#f39c12','#1abc9c'];

  function spawnBurst() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height * 0.6;
    const color = colors[Math.floor(Math.random() * colors.length)];
    for (let i = 0; i < 60; i++) {
      const angle  = (Math.PI * 2 * i) / 60;
      const speed  = 2 + Math.random() * 4;
      particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        alpha: 1, color, size: 3 + Math.random() * 3
      });
    }
  }

  function draw() {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.06;
      p.alpha -= 0.012;
      if (p.alpha <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 4초간 불꽃 발사
  let count = 0;
  const burstId = setInterval(() => {
    spawnBurst();
    if (++count > 20) clearInterval(burstId);
  }, 200);

  const animId = setInterval(draw, 16);
  setTimeout(() => clearInterval(animId), 6000);
}
