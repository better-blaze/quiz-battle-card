// =============================================
// data.js — .xlsx 파싱 (FileReader + SheetJS CDN)
// SheetJS는 index.html에서 <script src="..."> CDN으로 불러옴
// window.XLSX 로 접근
// =============================================

import { Q_COL } from './config.js';
import { parseMatchPairs, parseIndexAnswer } from './quiz.js';

// .xlsx File 객체를 받아 문제 배열을 반환하는 Promise
export function parseXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        // SheetJS로 엑셀 바이트 → 워크시트 변환
        const wb   = window.XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        // 2차원 배열로 변환 (빈 셀은 '' 처리)
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // 첫 행은 헤더이므로 건너뜀
        const questions = rows.slice(1)
          .filter(r => String(r[Q_COL.NUM] || '').trim() !== '')
          .map(r => buildQuestion(r));

        resolve(questions);
      } catch (err) {
        reject(new Error('엑셀 파싱 오류: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsArrayBuffer(file);
  });
}

// 행 배열 하나를 문제 객체로 변환
function buildQuestion(r) {
  const type      = String(r[Q_COL.TYPE]    || '').trim();
  const answerRaw = String(r[Q_COL.ANSWER]  || '').trim();

  // 보기 파싱 (5번 컬럼 이후, 빈 셀 제외)
  const choices = [];
  for (let i = Q_COL.OPT_START; i < r.length; i++) {
    const c = String(r[i] || '').trim();
    if (c) choices.push(c);
  }

  const q = {
    num:       String(r[Q_COL.NUM]     || '').trim(),
    type,
    content:   String(r[Q_COL.CONTENT] || '').trim(),
    imageUrl:  String(r[Q_COL.IMAGE]   || '').trim(),
    rawAnswer: answerRaw,
    choices                   // 객관식·복수정답·순서에서 사용
  };

  // 유형별 정답 추가 파싱
  switch (type) {
    case '단답형':
      // "정답1|정답2" 형태 → 배열
      q.answers = answerRaw.split('|').map(a => a.trim());
      break;
    case '선잇기':
      // "A:1 | B:2 | C:3" → [{left:'A', right:'1'}, ...]
      q.matchPairs = parseMatchPairs(answerRaw);
      break;
    case '복수정답':
      // "1,3" → [0, 2] (0-based 인덱스)
      q.correctIndices = parseIndexAnswer(answerRaw);
      break;
    case '순서':
      // "2,4,1,3" → [1,3,0,2] (0-based 인덱스, 눌러야 하는 순서)
      q.correctOrder = parseIndexAnswer(answerRaw);
      break;
    case '객관식':
      // rawAnswer = 정답 보기 텍스트 (choices 배열에서 찾아 인덱스 파악)
      q.correctChoiceText = answerRaw;
      q.correctChoiceIdx  = choices.indexOf(answerRaw); // -1이면 텍스트 직접 비교
      break;
  }

  return q;
}
