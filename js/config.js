// =============================================
// config.js — Firebase 설정 및 게임 상수
// =============================================

export const firebaseConfig = {
  apiKey:            "AIzaSyD6VKKUh_evt0kveIaCNIxRRTtIUDoWL48",
  authDomain:        "quiz-battle-royale-5f7a2.firebaseapp.com",
  databaseURL:       "https://quiz-battle-royale-5f7a2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "quiz-battle-royale-5f7a2",
  storageBucket:     "quiz-battle-royale-5f7a2.firebasestorage.app",
  messagingSenderId: "692757063593",
  appId:             "1:692757063593:web:02253e7c4b417db98a06b8"
};

// 게임 상수
export const GAME = {
  COUNTDOWN_SECONDS: 5,   // 문제 시작 전 카운트다운 (초)
  PLAYER_IDS: ['P1','P2','P3','P4','P5','P6']
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
  ENDED:     'ended'       // 게임 종료
};
