// =============================================
// sound.js — Web Audio API 효과음 (외부 파일 불필요)
// =============================================

let audioCtx = null;
let _muted = false;

function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

export function setMuted(v) { _muted = v; }
export function isMuted()   { return _muted; }

// freq: 주파수(Hz), type: 파형, dur: 지속시간(초), vol: 볼륨
function beep(freq, type = 'sine', dur = 0.2, vol = 0.3) {
  if (_muted) return;
  try {
    const c = ctx();
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + dur);
  } catch(e) {}
}

// 카운트다운 틱
export function playTick() { beep(660, 'square', 0.08, 0.18); }

// 마지막 틱 (0초)
export function playLastTick() { beep(880, 'square', 0.12, 0.25); }

// 정답
export function playCorrect() {
  beep(523, 'sine', 0.12, 0.3);
  setTimeout(() => beep(659, 'sine', 0.12, 0.3), 130);
  setTimeout(() => beep(784, 'sine', 0.25, 0.35), 260);
}

// 오답
export function playWrong() {
  beep(250, 'sawtooth', 0.15, 0.3);
  setTimeout(() => beep(200, 'sawtooth', 0.25, 0.3), 150);
}

// 카운트다운 시작 알림
export function playCountdownStart() {
  beep(440, 'sine', 0.15, 0.25);
  setTimeout(() => beep(550, 'sine', 0.15, 0.25), 200);
}

// 카드 뒤집기
export function playCardFlip() {
  beep(300, 'triangle', 0.05, 0.25);
  setTimeout(() => beep(500, 'sine', 0.10, 0.20), 55);
  setTimeout(() => beep(720, 'sine', 0.08, 0.15), 110);
}

// 시상식 축포
export function playCeremony() {
  if (_muted) return;
  const notes = [523, 659, 784, 1047, 784, 1047, 1319];
  notes.forEach((f, i) => setTimeout(() => beep(f, 'sine', 0.2, 0.4), i * 120));
  // 두 번째 버스트
  setTimeout(() => {
    [784, 1047, 1319, 1047, 1319].forEach((f, i) =>
      setTimeout(() => beep(f, 'triangle', 0.2, 0.35), i * 100));
  }, 1200);
}
