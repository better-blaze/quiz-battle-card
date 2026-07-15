// =============================================
// tutorial.js — 게임 안내 페이지
// 카드 등급 색상은 하드코딩하지 않고 config.js의 CARD_CONFIG.colors를 그대로 사용한다.
// =============================================

import { CARD_CONFIG } from './config.js';

document.querySelectorAll('.tutorial-swatch').forEach(el => {
  const color = CARD_CONFIG.colors[el.dataset.tier];
  if (color) el.style.background = color;
});
