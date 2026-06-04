// =============================================
// admin.js — 관리자 뷰 초기화 및 UI 업데이트
// =============================================

export function initAdminView({ roomCode, onStartCountdown, onNextQuestion, onSkipQuestion, onEndGame }) {
  const roomBadge = document.getElementById('admin-room-badge');
  if (roomBadge) roomBadge.textContent = `방: ${roomCode}`;

  document.getElementById('btn-start-countdown')?.addEventListener('click', onStartCountdown);
  document.getElementById('btn-next-question')  ?.addEventListener('click', onNextQuestion);
  document.getElementById('btn-skip-question')  ?.addEventListener('click', onSkipQuestion);
  document.getElementById('btn-end-game')        ?.addEventListener('click', () => {
    if (confirm('게임을 끝내시겠습니까?')) onEndGame();
  });
}

// 문제 미리보기 업데이트
export function updateQuestionPreview(q, qIndex, total) {
  const indexEl   = document.getElementById('admin-q-index');
  const previewEl = document.getElementById('admin-q-preview');
  if (indexEl)   indexEl.textContent   = `문제 ${qIndex + 1} / ${total}  [${q.type}]`;
  if (previewEl) previewEl.textContent = q.content + (q.imageUrl ? ' 🖼' : '');
}

// 카운트다운 버튼 활성/비활성
export function setCountdownEnabled(enabled) {
  const btn = document.getElementById('btn-start-countdown');
  if (!btn) return;
  btn.disabled = !enabled;
}

// 플레이어 상태 카드 업데이트
// players: { P1: {connected}, P2: ... }
// answers: { P1: {correct, submittedAt}, ... }
export function updatePlayerStatus(playerIds, players, answers) {
  const wrap = document.getElementById('admin-player-status');
  if (!wrap) return;
  wrap.innerHTML = '';

  playerIds.forEach(pid => {
    const p   = players[pid] || {};
    const ans = answers[pid];

    let stateLabel = '미접속';
    let stateCls   = '';
    if (p.connected && !ans) { stateLabel = '접속 중';  stateCls = 'connected'; }
    if (ans && ans.correct)  { stateLabel = '정답 ✅';   stateCls = 'correct'; }
    if (ans && !ans.correct) { stateLabel = '오답 ❌';   stateCls = 'wrong'; }
    if (p.connected && !ans) { stateLabel = '대기 중';   stateCls = 'connected'; }

    const card = document.createElement('div');
    card.className = 'admin-player-card';
    card.innerHTML = `
      <div class="admin-player-name">${pid}</div>
      <div class="admin-player-state ${stateCls}">${stateLabel}</div>
      ${ans ? `<div style="font-size:.75rem;color:var(--c-sub);margin-top:4px;">${ans.elapsedSec?.toFixed(1) ?? ''}초</div>` : ''}
    `;
    wrap.appendChild(card);
  });
}
