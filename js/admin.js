// =============================================
// admin.js — 관리자 뷰 초기화 및 UI 업데이트
// =============================================

// 방향키 단축키 핸들러 (재진입 시 중복 등록 방지용으로 참조 보관)
let _adminKeydownHandler = null;

export function initAdminView({ roomCode, onStartCountdown, onNextQuestion, onSkipQuestion, onEndGame, onFlipAllCards }) {
  const roomBadge = document.getElementById('admin-room-badge');
  if (roomBadge) roomBadge.textContent = `방: ${roomCode}`;

  document.getElementById('btn-start-countdown')?.addEventListener('click', onStartCountdown);
  document.getElementById('btn-next-question')  ?.addEventListener('click', onNextQuestion);
  document.getElementById('btn-skip-question')  ?.addEventListener('click', onSkipQuestion);
  document.getElementById('btn-end-game')        ?.addEventListener('click', () => {
    if (confirm('게임을 끝내시겠습니까?')) onEndGame();
  });
  document.getElementById('btn-flip-all-cards') ?.addEventListener('click', onFlipAllCards);

  // ── 방향키 단축키: ↑ = 5초 카운트다운, ↓ = 다음 문제 ──
  // 관리자 뷰가 화면에 떠 있을 때만 동작하도록 매번 확인
  if (_adminKeydownHandler) document.removeEventListener('keydown', _adminKeydownHandler);
  _adminKeydownHandler = (e) => {
    if (!document.getElementById('view-admin')?.classList.contains('active')) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const btn = document.getElementById('btn-start-countdown');
      if (btn && !btn.disabled) onStartCountdown();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onNextQuestion();
    }
  };
  document.addEventListener('keydown', _adminKeydownHandler);
}

// 카드 모두 뒤집기 버튼 활성/비활성
export function setFlipAllEnabled(enabled) {
  const btn = document.getElementById('btn-flip-all-cards');
  if (btn) btn.disabled = !enabled;
}

// 문제 미리보기 업데이트
export function updateQuestionPreview(q, qIndex, total) {
  const indexEl   = document.getElementById('admin-q-index');
  const previewEl = document.getElementById('admin-q-preview');
  if (indexEl)   indexEl.textContent   = `문제 ${qIndex + 1} / ${total}  [${q.type}]`;
  if (previewEl) previewEl.textContent = q.content + (q.imageUrl ? ' 🖼' : '');
}

// 게임 종료 시 최종 순위 표시
export function showFinalRankings(rankings) {
  const wrap = document.getElementById('admin-player-status');
  if (!wrap) return;
  const medals = ['🥇', '🥈', '🥉'];
  wrap.innerHTML = `
    <div class="admin-final-header">🏆 최종 순위</div>
    ${rankings.map((r, i) => {
      const sign     = r.totalScore > 0 ? '+' : '';
      const scoreCls = r.totalScore > 0 ? 'pos' : r.totalScore < 0 ? 'neg' : 'zero';
      return `
        <div class="rank-item">
          <span class="rank-medal">${medals[i] ?? (i + 1)}</span>
          <span class="rank-nick">${r.nickname}</span>
          <span class="rank-score ${scoreCls}">${sign}${r.totalScore}점</span>
        </div>`;
    }).join('')}`;
}

// 카운트다운 버튼 활성/비활성
export function setCountdownEnabled(enabled) {
  const btn = document.getElementById('btn-start-countdown');
  if (!btn) return;
  btn.disabled = !enabled;
}

// 관리자용 카드 구성 표시 (초기 렌더)
export function renderAdminCards(deck) {
  const container = document.getElementById('admin-card-preview');
  const list      = document.getElementById('admin-card-list');
  if (!container || !list) return;

  list.innerHTML = deck.map(card => {
    const scoreStr = card.type === 'double' ? '×2'
                   : card.score >  0        ? `+${card.score}`
                   :                          `${card.score}`;
    const bgCls   = card.type === 'double' ? 'card-double'
                  : card.type === 'risk'   ? 'card-risk'
                  : card.score >  0        ? 'card-plus'
                  : card.score <  0        ? 'card-minus'
                  :                          'card-zero';
    const taker   = card.takenBy && card.takenBy !== '—' ? card.takenBy
                  : card.takenBy === '—'                  ? '—'
                  :                                         '';
    return `
      <div class="acp-card ${bgCls}${card.takenBy ? ' acp-taken' : ''}" data-idx="${card.index}">
        <div class="acp-num">${card.index + 1}</div>
        <div class="acp-score">${scoreStr}</div>
        ${taker ? `<div class="acp-taker">${taker}</div>` : ''}
      </div>`;
  }).join('');

  container.classList.remove('hidden');
}

// 실시간 업데이트 (뒤집힌 카드만 반영)
export function updateAdminCards(deck) {
  deck.forEach(card => {
    if (!card.takenBy) return;
    const el = document.querySelector(`#admin-card-list .acp-card[data-idx="${card.index}"]`);
    if (!el || el.classList.contains('acp-taken')) return;
    el.classList.add('acp-taken');
    if (!el.querySelector('.acp-taker')) {
      const takerEl = document.createElement('div');
      takerEl.className   = 'acp-taker';
      takerEl.textContent = card.takenBy === '—' ? '—' : card.takenBy;
      el.appendChild(takerEl);
    }
  });
}

// 카드 프리뷰 초기화
export function clearAdminCards() {
  const container = document.getElementById('admin-card-preview');
  if (container) container.classList.add('hidden');
  const list = document.getElementById('admin-card-list');
  if (list) list.innerHTML = '';
}

// 플레이어 상태 카드 업데이트
// players: { nick: {connected}, ... }
// answers: { nick: {correct, submittedAt}, ... }
export function updatePlayerStatus(players, answers) {
  const wrap = document.getElementById('admin-player-status');
  if (!wrap) return;

  const entries   = Object.entries(players);
  const total     = entries.length;
  const connected = entries.filter(([, p]) => p.connected).length;

  let html = `<div class="admin-player-count">👥 접속 중 <strong>${connected}</strong>명 / 전체 <strong>${total}</strong>명</div>`;

  entries.forEach(([pid, p]) => {
    const ans = answers[pid];

    let stateLabel = '미접속';
    let stateCls   = '';
    if (p.connected && !ans) { stateLabel = '대기 중';  stateCls = 'connected'; }
    if (ans && ans.correct)  { stateLabel = '정답 ✅';  stateCls = 'correct'; }
    if (ans && !ans.correct) { stateLabel = '오답 ❌';  stateCls = 'wrong'; }

    html += `
      <div class="admin-player-card">
        <div class="admin-player-name">${pid}</div>
        <div class="admin-player-state ${stateCls}">${stateLabel}</div>
        ${ans ? `<div style="font-size:.75rem;color:var(--c-sub);margin-top:4px;">${ans.elapsedSec?.toFixed(1) ?? ''}초</div>` : ''}
      </div>`;
  });

  wrap.innerHTML = html;
}
