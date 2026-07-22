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

// 카드 배분 설정 — 점수 범위·확률·장수를 바꿀 때 이 객체만 수정하면 됨 (spec §2-1-3)
// 등급: normal(일반,노랑) / risk(위험,주황) / highRisk(고위험,빨강) / ultra(초고위험,검정)
export const CARD_CONFIG = {
  // 등급별 장수 (평상시). ultra 모드에서는 highRisk가 1장 줄고 ultra가 1장 추가됨
  counts: {
    normal:   19,  // 노란색
    risk:     5,   // 주황색
    highRisk: 4,   // 빨간색 (초고위험 모드에서는 3장으로 줄고 ultra 1장 추가)
  },

  // 등급별 색상 (UI에서 참조)
  colors: {
    normal:   '#FFD700',  // 노란색
    risk:     '#FF8C00',  // 주황색
    highRisk: '#DC143C',  // 빨간색
    ultra:    '#1A1A1A',  // 검정색
  },

  // 등급별 점수 풀과 가중치. score: "double"/"explosion" 은 문자열 특수 카드
  tiers: {
    normal: [
      { score: 5, weight: 1 },
      { score: 6, weight: 1 },
      { score: 7, weight: 1 },
      { score: 8, weight: 1 },
      { score: 4, weight: 1 },
    ],
    risk: [
      { score: 0,  weight: 1 },
      { score: 1,  weight: 1 },
      { score: 2,  weight: 1 },
      { score: 3,  weight: 1 },
      { score: 9,  weight: 1 },
      { score: 10, weight: 1 },
      { score: 11, weight: 1 },
    ],
    highRisk: [
      { score: -20,      weight: 1 },
      { score: -15,      weight: 1 },
      { score: -13,      weight: 1 },
      { score: -10,       weight: 1 },
      { score: 15,        weight: 1 },
      { score: 10,       weight: 1 },
      { score: 20,       weight: 1 },
      { score: 'double', weight: 2, max: 1 },  // 세트당 최대 1장
    ],
    ultra: [
      { score: -40,        weight: 1 },
      { score: -35,        weight: 1 },
      { score: -30,        weight: 1 },
      { score: -25,        weight: 1 },
      { score: -20,        weight: 1 },
      { score: 25,         weight: 1 },
      { score: 30,         weight: 1 },
      { score: 40,         weight: 1 },
      { score: 'explosion', weight: 10 },  // 대폭발: explosionEnabled가 false면 제외
    ],
  },

  explosionEnabled: true,  // 관리자가 대폭발 포함 여부를 켜고 끔
};

// 카드 type → 색상 등급 매핑. double/explosion은 각각 highRisk/ultra 풀에서 뽑힌
// 특수 카드이므로(spec §2-1-3), 뒷면 색은 원래 등급(빨강/검정)을 그대로 따른다.
const CARD_TYPE_TIER = {
  normal:    'normal',
  risk:      'risk',
  highRisk:  'highRisk',
  double:    'highRisk',
  ultra:     'ultra',
  explosion: 'ultra',
};

// 카드 뒷면 색상 조회 (spec §1-2) — 색상값은 항상 CARD_CONFIG.colors에서만 가져온다.
export function getCardBackColor(type) {
  return CARD_CONFIG.colors[CARD_TYPE_TIER[type]] || CARD_CONFIG.colors.normal;
}

// 등급 배경 위에서 읽기 쉬운 글자색 (밝은 노랑/주황엔 어두운 글자, 어두운 빨강/검정엔 흰 글자)
const CARD_TIER_TEXT = {
  normal:   '#1A1A1A',
  risk:     '#1A1A1A',
  highRisk: '#FFFFFF',
  ultra:    '#FFFFFF',
};
export function getCardTextColor(type) {
  return CARD_TIER_TEXT[CARD_TYPE_TIER[type]] || '#FFFFFF';
}
