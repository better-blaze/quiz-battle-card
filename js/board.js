// =============================================
// board.js — 상황판 뷰 렌더링
// =============================================

import * as Sound from './sound.js';
import { getCardBackColor, getCardTextColor } from './config.js';

// ── 상황판 카드 그리드 ──

let _boardCardEls = {}; // { cardIndex: HTMLElement }

// 28장 카드를 우측 그리드에 초기 렌더링
export function renderBoardCards(deck) {
  _boardCardEls = {};
  const grid = document.getElementById('board-card-grid');
  if (!grid) return;
  grid.innerHTML = '';

  deck.forEach(card => {
    const el = document.createElement('div');
    el.className   = 'board-game-card';
    el.dataset.idx = card.index;

    if (card.takenBy) {
      el.classList.add('flipped');
      _renderBoardCardFront(el, card);
    } else {
      _renderBoardCardBack(el, card);
    }

    _boardCardEls[card.index] = el;
    grid.appendChild(el);
  });
}

// 뒷면 렌더링 — 등급별 색상만 노출, 점수는 뒤집기 전까지 절대 보여주지 않음 (spec §1-2)
function _renderBoardCardBack(el, card) {
  el.innerHTML = `<div class="board-card-back" style="background:${getCardBackColor(card.type)}">?</div>`;
}

// 뒤집힌 카드만 업데이트 (실시간 동기화)
// 누적 점수는 절대 표시하지 않고 카드 개별 점수 + 닉네임만 공개
export function updateBoardCards(deck) {
  deck.forEach(card => {
    const el = _boardCardEls[card.index];
    if (!el || el.classList.contains('flipped')) return;
    if (card.takenBy) {
      el.classList.add('flipped');
      _renderBoardCardFront(el, card);
      Sound.playCardFlip();
      if (card.type === 'explosion') showExplosionEffect();
    }
  });
}

// 대폭발 발동 연출 — 효과음 + 화면 전체 플래시/흔들림. 점수는 절대 표시하지 않는다 (spec §1-2, §2-4)
export function showExplosionEffect() {
  const overlay = document.getElementById('board-explosion-overlay');
  if (!overlay) return;
  Sound.playExplosion();
  overlay.classList.remove('hidden');
  overlay.classList.add('explosion-active');
  setTimeout(() => {
    overlay.classList.remove('explosion-active');
    overlay.classList.add('hidden');
  }, 5000);
}

export function clearBoardCards() {
  const grid = document.getElementById('board-card-grid');
  if (grid) grid.innerHTML = '';
  _boardCardEls = {};
}

// 앞면 색상도 뒷면과 동일하게 등급(CARD_CONFIG.colors) 기준으로 통일한다
function _renderBoardCardFront(el, card) {
  const bg = getCardBackColor(card.type);
  const fg = getCardTextColor(card.type);
  // 대폭발은 spec §1-2에 따라 점수를 공개하지 않고 발동 연출만 표시
  const scoreStr = card.type === 'double'    ? '×2'
                 : card.type === 'explosion' ? '💥'
                 : card.score >  0           ? `+${card.score}`
                 :                             `${card.score}`;
  el.innerHTML = `
    <div class="board-card-front" style="background:${bg};color:${fg}">
      <div class="bc-score">${scoreStr}</div>
      <div class="bc-nick">${card.takenBy === '—' ? '' : card.takenBy}</div>
    </div>`;
}

// ── 문제 표시 ──

// Firebase 배열/객체 모두 처리
function toArr(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : Object.values(v);
}

function choiceHtml(c) {
  if (/^https?:\/\//i.test(c)) {
    return `<img src="${String(c).replace(/"/g, '&quot;')}" class="choice-img" alt="이미지 보기">`;
  }
  return String(c).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function showQuestion(q, qIndex, total) {
  const phaseEl   = document.getElementById('board-phase-label');
  const infoEl    = document.getElementById('board-q-info');
  const textEl    = document.getElementById('board-q-text');
  const choicesEl = document.getElementById('board-q-choices');
  const imgEl     = document.getElementById('board-q-img');

  if (phaseEl)   phaseEl.textContent  = '문제 진행 중';
  if (infoEl)    infoEl.textContent   = `문제 ${qIndex + 1} / ${total}  [${q.type}]`;
  if (textEl)    textEl.textContent   = q.content;
  if (choicesEl) choicesEl.innerHTML  = '';

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

  // 객관식
  if (q.type === '객관식' && choicesEl) {
    const choices = toArr(q.choices);
    choicesEl.innerHTML = choices.map(c =>
      `<div class="board-choice-item">${choiceHtml(c)}</div>`
    ).join('');
  }

  // 복수정답·순서
  if ((q.type === '복수정답' || q.type === '순서') && choicesEl) {
    const choices = toArr(q.choices);
    choicesEl.innerHTML = choices.map((c, i) =>
      `<div class="board-choice-item">
        <span class="board-choice-num">${i + 1}</span>${choiceHtml(c)}
      </div>`
    ).join('');
  }

  // 선잇기
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
}

// ── 카운트다운 ──
let _cdInterval = null;
let _cdActive   = false;

export function showCountdown(startSec, onDone) {
  if (_cdActive) return;
  _cdActive = true;

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
      _cdActive = false;
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
  _cdActive = false;
  const el = document.getElementById('board-countdown');
  if (el) el.classList.add('hidden');
}

// ── 문제 초기화 (IDLE) ──
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
  clearBoardCards(); // 카드 그리드도 함께 초기화
}

// ── 시상식 ──
export function showCeremony(rankings = []) {
  const overlay = document.getElementById('ceremony-overlay');
  if (!overlay) return;
  _renderRankings('ceremony-rankings', rankings, null);
  overlay.classList.remove('hidden');
  Sound.playCeremony();
  startFireworks();
}

function _renderRankings(containerId, rankings, myNickname) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const medals = ['🥇', '🥈', '🥉'];
  el.innerHTML = rankings.map((r, i) => {
    const sign     = r.totalScore > 0 ? '+' : '';
    const scoreCls = r.totalScore > 0 ? 'pos' : r.totalScore < 0 ? 'neg' : 'zero';
    const isMine   = myNickname && r.nickname === myNickname;
    return `
      <div class="rank-item${isMine ? ' rank-mine' : ''}">
        <span class="rank-medal">${medals[i] ?? (i + 1)}</span>
        <span class="rank-nick">${r.nickname}${isMine ? ' 👈' : ''}</span>
        <span class="rank-score ${scoreCls}">${sign}${r.totalScore}점</span>
      </div>`;
  }).join('');
}

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
      const angle = (Math.PI * 2 * i) / 60;
      const speed = 2 + Math.random() * 4;
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

  let count = 0;
  const burstId = setInterval(() => { spawnBurst(); if (++count > 20) clearInterval(burstId); }, 200);
  const animId  = setInterval(draw, 16);
  setTimeout(() => clearInterval(animId), 6000);
}
