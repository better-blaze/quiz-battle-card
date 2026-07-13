// =============================================
// config.js — Firebase 설정 및 게임 상수
// =============================================

export const firebaseConfig = {
  apiKey: "AIzaSyDy_XyGdPZvWYz-RMly2t9lawJR2DBdsBc",
  authDomain: "quiz-battle-card.firebaseapp.com",
  databaseURL: "https://quiz-battle-card-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quiz-battle-card",
  storageBucket: "quiz-battle-card.firebasestorage.app",
  messagingSenderId: "416382245902",
  appId: "1:416382245902:web:bd73d1ac3e8ffd48bfb05f"
};

// 게임 상수
export const GAME = {
  COUNTDOWN_SECONDS: 5,   // 문제 시작 전 카운트다운 (초)
};

// 엑셀 컬럼 인덱스
export const Q_COL = {
  NUM:       0,  // 문제번호
  TYPE:      1,  // 유형 (객관식/단답형/선잇기/복수정답/순서)
  CONTENT:   2,  // 문제내용
  IMAGE:     3,  // 이미지URL
  ANSWER:    4,  // 정답
  OPT_START: 5   // 보기 시작 (객관식·복수정답·순서)
};

// Firebase 게임 단계
export const PHASE = {
  IDLE:      'idle',       // 대기 (다음 문제 준비)
  COUNTDOWN: 'countdown',  // 5초 카운트다운 중
  ANSWERING: 'answering',  // 정답 입력 중
  CARDING:   'carding',    // 정답자 카드 선택 단계
  ENDED:     'ended'       // 게임 종료
};

// 카드 배분 설정 — 점수 범위·확률을 바꿀 때 이 객체만 수정하면 됨
export const CARD_CONFIG = {
  normalCount: 21,   // 일반카드 장수
  riskCount:   7,    // 고위험카드 장수 (2배카드 포함)

  // 일반카드: 점수별 가중치(등장 확률). 가중치 합 대비 비율로 뽑음
  normal: [
    { score: 5,  weight: 3 },
    { score: 6,  weight: 3 },
    { score: 7,  weight: 2 },
    { score: 8,  weight: 2 },
    { score: 9,  weight: 1 },
    { score: 10, weight: 1 },
  ],

  // 고위험카드: 점수별 가중치. score: "double" 은 '다음카드 2배' 특수 카드
  risk: [
    { score: -20,      weight: 1 },
    { score: -10,      weight: 2 },
    { score: 0,        weight: 1 },
    { score: 10,       weight: 2 },
    { score: 20,       weight: 1 },
    { score: 'double', weight: 1, max: 1 },  // 세트당 최대 1장
  ],
};
