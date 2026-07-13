// =============================================
// setting.js — 세팅 뷰 초기화 및 이벤트
// =============================================

import { parseXlsx } from './data.js';

export function initSettingView({ onCreateRoom, onJoinStudent, onJoinBoard, onJoinAdmin }) {
  const createCodeInput  = document.getElementById('room-code-input');
  const joinCodeInput    = document.getElementById('join-code-input');
  const xlsxInput      = document.getElementById('xlsx-file-input');
  const xlsxStatus     = document.getElementById('xlsx-status');
  const btnCreate      = document.getElementById('btn-create-room');
  const btnStudent     = document.getElementById('btn-join-student');
  const btnBoard       = document.getElementById('btn-join-board');
  const btnAdmin       = document.getElementById('btn-join-admin');

  let parsedQuestions = null;

  // 방 코드 입력: 영문+숫자 4자리, 자동 대문자
  [createCodeInput, joinCodeInput].forEach(inp => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    });
  });

  // xlsx 파일 업로드 → SheetJS 파싱
  xlsxInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.XLSX) {
      setXlsxStatus('❌ SheetJS 라이브러리를 불러오지 못했습니다.', 'error');
      return;
    }

    setXlsxStatus('⏳ 파싱 중...', 'info');
    try {
      parsedQuestions = await parseXlsx(file);
      if (!parsedQuestions.length) throw new Error('문제가 0개입니다. 헤더 행을 포함했는지 확인하세요.');
      setXlsxStatus(`✅ ${parsedQuestions.length}문제 로드 완료`, 'success');
    } catch (err) {
      setXlsxStatus('❌ ' + err.message, 'error');
      parsedQuestions = null;
    }
  });

  // 방 만들기 (관리자)
  btnCreate.addEventListener('click', async () => {
    const code = createCodeInput.value.trim();

    if (code.length !== 4) { showMsg('방 코드는 4자리로 입력해주세요.', 'error'); return; }
    if (!parsedQuestions)  { showMsg('먼저 엑셀 파일을 업로드해주세요.', 'error'); return; }

    btnCreate.disabled = true;
    showMsg('방을 만드는 중...', 'info');
    try {
      await onCreateRoom(code, parsedQuestions);
    } catch (err) {
      console.error('[방 만들기 오류]', err);
      showMsg('오류: ' + err.message, 'error');
      btnCreate.disabled = false;
    }
  });

  // 학생 참여
  btnStudent.addEventListener('click', () => {
    const code = joinCodeInput.value.trim();
    if (code.length !== 4) { showMsg('방 코드 4자리를 입력해주세요.', 'error'); return; }
    onJoinStudent(code);
  });

  // 상황판
  btnBoard.addEventListener('click', () => {
    const code = joinCodeInput.value.trim();
    if (code.length !== 4) { showMsg('방 코드 4자리를 입력해주세요.', 'error'); return; }
    if (!checkPassword())  { showMsg('비밀번호가 틀렸습니다.', 'error'); return; }
    onJoinBoard(code);
  });

  // 관리자 재참여
  btnAdmin.addEventListener('click', () => {
    const code = joinCodeInput.value.trim();
    if (code.length !== 4) { showMsg('방 코드 4자리를 입력해주세요.', 'error'); return; }
    if (!checkPassword())  { showMsg('비밀번호가 틀렸습니다.', 'error'); return; }
    onJoinAdmin(code);
  });
}

function checkPassword() {
  const pw = prompt('비밀번호를 입력하세요:');
  return pw === '0257';
}

function setXlsxStatus(msg, type) {
  const el = document.getElementById('xlsx-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'success' ? 'var(--c-green)'
                 : type === 'error'   ? 'var(--c-red)'
                 : 'var(--c-sub)';
}

function showMsg(msg, type = 'info') {
  const el = document.getElementById('setting-message');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'setting-message ' + (type === 'error' ? 'error' : '');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}
