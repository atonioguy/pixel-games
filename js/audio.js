// Little chiptune sound effects made with the Web Audio API (no sound files needed).
import { save } from './state.js';

let ctx = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// iPhone only allows audio after the first touch, so we wake it up then.
export function unlockAudio() {
  const c = ac();
  if (!c) return;
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
}

function tone(freq, dur, { type = 'square', vol = 0.06, slide = 0, delay = 0 } = {}) {
  if (!save.settings.sound) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const NOTES = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5, 1174.66, 1318.51];

export const sfx = {
  tap: () => tone(660, 0.05, { type: 'triangle', vol: 0.05 }),
  pop: () => tone(420, 0.09, { type: 'square', vol: 0.04, slide: 1.8 }),
  merge(level = 1) {
    const base = NOTES[Math.min(level, NOTES.length - 2)];
    tone(base, 0.08, { type: 'square', vol: 0.05 });
    tone(base * 1.5, 0.14, { type: 'square', vol: 0.05, delay: 0.07 });
  },
  coin() {
    tone(988, 0.06, { type: 'square', vol: 0.04 });
    tone(1319, 0.18, { type: 'square', vol: 0.04, delay: 0.06 });
  },
  error: () => tone(160, 0.18, { type: 'sawtooth', vol: 0.04, slide: 0.7 }),
  discover() {
    [0, 2, 4, 7].forEach((n, i) => tone(NOTES[n], 0.1, { type: 'triangle', vol: 0.07, delay: i * 0.07 }));
  },
  levelup() {
    [0, 2, 4, 2, 4, 7].forEach((n, i) => tone(NOTES[n], 0.12, { type: 'square', vol: 0.045, delay: i * 0.09 }));
  },
};
