// =============================================
// quiz.js — 유형별 정답 판정 로직
// =============================================

// 단답형: 공백 제거 후 비교, 파이프(|)로 복수 정답 허용
export function checkShortAnswer(input, answerStr) {
  const normalize = s => String(s).replace(/\s+/g, '').toLowerCase();
  const answers = String(answerStr).split('|').map(a => normalize(a));
  return answers.includes(normalize(input));
}

// 객관식: 입력된 난수 번호가 정답 보기에 배정된 번호와 일치하는지 확인
export function checkMultipleChoice(inputNum, correctNum) {
  return String(inputNum).trim() === String(correctNum).trim();
}

// 선잇기: 제출된 pairs 배열이 정답 pairs와 모두 일치하는지 확인
// submittedPairs: [{left:'A', right:'1'}, ...]
// correctPairs:   [{left:'A', right:'1'}, ...]
export function checkMatching(submittedPairs, correctPairs) {
  if (!submittedPairs || submittedPairs.length !== correctPairs.length) return false;
  return correctPairs.every(cp => {
    const found = submittedPairs.find(sp => sp.left === cp.left);
    return found && found.right === cp.right;
  });
}

// 복수정답: 선택된 인덱스 집합이 정답 인덱스 집합과 일치하는지 확인
// selectedIndices: [0, 2]  correctIndices: [0, 2]
export function checkMultiAnswer(selectedIndices, correctIndices) {
  if (selectedIndices.length !== correctIndices.length) return false;
  const s = [...selectedIndices].sort((a,b) => a-b);
  const c = [...correctIndices].sort((a,b) => a-b);
  return s.every((v, i) => v === c[i]);
}

// 순서: 선택한 순서 배열이 정답 순서와 정확히 일치하는지 확인
// selectedOrder: [2,0,3,1]  correctOrder: [2,0,3,1]
export function checkOrder(selectedOrder, correctOrder) {
  if (selectedOrder.length !== correctOrder.length) return false;
  return selectedOrder.every((v, i) => v === correctOrder[i]);
}

// 선잇기 정답 파싱: "1:one | 2:two | 3:three" → [{left:'1', right:'one'}, ...]
export function parseMatchPairs(answerStr) {
  return String(answerStr).split('|').map(seg => {
    const [l, r] = seg.split(':').map(s => s.trim());
    return { left: l, right: r };
  }).filter(p => p.left && p.right);
}

// 복수정답·순서 정답 파싱: "1,3" → [0,2] (1-based → 0-based 인덱스)
export function parseIndexAnswer(answerStr) {
  return String(answerStr).split(',').map(s => parseInt(s.trim()) - 1).filter(n => !isNaN(n));
}
