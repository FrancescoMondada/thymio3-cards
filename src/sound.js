// Small sound effects made with WebAudio (no files). The robot has its own sounds; these are
// for the tablet: they tell a child that a card was taken, dropped or removed.
let ctx = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = Boolean(on); }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(c, freq, start, dur, { type = 'sine', gain = 0.12 } = {}) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.02);
}

// Each card has its own pitch, so that a sequence can be heard as well as seen.
const NOTE = { F: 523, B: 392, L: 659, R: 784 };

const SOUNDS = {
  pick: (c, code) => tone(c, NOTE[code] || 523, 0, 0.12, { type: 'triangle' }),
  drop: (c, code) => { tone(c, NOTE[code] || 523, 0, 0.09, { type: 'triangle' }); tone(c, (NOTE[code] || 523) * 1.5, 0.07, 0.12, { type: 'triangle' }); },
  remove: (c) => { tone(c, 330, 0, 0.1, { type: 'sine' }); tone(c, 220, 0.08, 0.14, { type: 'sine' }); },
  clear: (c) => { tone(c, 392, 0, 0.1); tone(c, 294, 0.09, 0.1); tone(c, 196, 0.18, 0.2); },
  full: (c) => { tone(c, 180, 0, 0.12, { type: 'square', gain: 0.06 }); tone(c, 150, 0.12, 0.16, { type: 'square', gain: 0.06 }); },
  go: (c) => { tone(c, 392, 0, 0.1, { type: 'triangle' }); tone(c, 523, 0.1, 0.1, { type: 'triangle' }); tone(c, 784, 0.2, 0.2, { type: 'triangle' }); },
  stop: (c) => tone(c, 262, 0, 0.18, { type: 'triangle' }),
  done: (c) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.11, 0.2, { type: 'triangle' })); },
  oops: (c) => { tone(c, 262, 0, 0.12, { type: 'sine' }); tone(c, 247, 0.12, 0.2, { type: 'sine' }); },
};

export function play(kind, code) {
  if (!enabled) return;
  const c = audio();
  if (!c || !SOUNDS[kind]) return;
  try { SOUNDS[kind](c, code); } catch { /* sound is a nicety */ }
}
