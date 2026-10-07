// Soft, "Nintendo-y" sound effects made with the Web Audio API (no sound files needed).
// Voices: music-box bells, marimba plucks and bubbly bloops, run through a little reverb.
import { save } from './state.js';

let ctx = null;
let master = null;
let reverbIn = null;

function impulse(c, seconds = 1.6, decay = 3.2) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7000;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(tone).connect(comp).connect(ctx.destination);
    // Reverb send gives everything a soft, roomy sparkle.
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    reverbIn = ctx.createGain();
    reverbIn.connect(verb).connect(wet).connect(comp);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// For games that make their own music (the rhythm game): the shared context plus the
// main output and reverb inputs. Returns null if Web Audio isn't available.
export function audioGraph() {
  const c = ac();
  return c ? { ctx: c, out: master, verb: reverbIn } : null;
}

// iPhone only allows audio after the first touch, so we wake it up then.
export function unlockAudio() {
  const c = ac();
  if (!c) return;
  const s = c.createBufferSource();
  s.buffer = c.createBuffer(1, 1, 22050);
  s.connect(c.destination);
  s.start(0);
}

function out(node, wet = true) {
  node.connect(master);
  if (wet) node.connect(reverbIn);
}

function env(c, t, vol, attack, decay) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function osc(c, type, freq, t, dur, gainNode) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.connect(gainNode);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

// Music-box / glockenspiel bell
function bell(freq, { delay = 0, vol = 0.12, dur = 0.9 } = {}) {
  const c = ac();
  if (!c || !save.settings.sound) return;
  const t = c.currentTime + delay;
  [
    [1, 1, dur],
    [2, 0.28, dur * 0.5],
    [3.01, 0.12, dur * 0.3],
    [4.2, 0.06, dur * 0.18],
  ].forEach(([mult, g, d]) => {
    const e = env(c, t, vol * g, 0.004, d);
    out(e);
    osc(c, 'sine', freq * mult, t, d, e);
  });
}

// Soft marimba / kalimba pluck
function pluck(freq, { delay = 0, vol = 0.16, dur = 0.35 } = {}) {
  const c = ac();
  if (!c || !save.settings.sound) return;
  const t = c.currentTime + delay;
  const body = env(c, t, vol, 0.003, dur);
  out(body);
  osc(c, 'sine', freq, t, dur, body);
  const tri = env(c, t, vol * 0.25, 0.003, dur * 0.6);
  out(tri);
  osc(c, 'triangle', freq * 2, t, dur * 0.6, tri);
  const click = env(c, t, vol * 0.18, 0.001, 0.04);
  out(click, false);
  osc(c, 'sine', freq * 4, t, 0.04, click);
}

// Bubbly "bloop": a sine that glides between two pitches
function bloop(from, to, { delay = 0, vol = 0.14, dur = 0.12 } = {}) {
  const c = ac();
  if (!c || !save.settings.sound) return;
  const t = c.currentTime + delay;
  const e = env(c, t, vol, 0.005, dur);
  out(e);
  const o = osc(c, 'sine', from, t, dur, e);
  o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
}

// Tiny soft UI tick
function tick(freq = 1800, vol = 0.05, delay = 0) {
  const c = ac();
  if (!c || !save.settings.sound) return;
  const t = c.currentTime + delay;
  const e = env(c, t, vol, 0.001, 0.03);
  out(e, false);
  osc(c, 'sine', freq, t, 0.03, e);
}

// C major pentatonic, from C4 upward. Everything picks notes from here so it always sounds nice.
const PENTA = [];
for (let oct = 0; oct < 4; oct++) [0, 2, 4, 7, 9].forEach((n) => PENTA.push(261.63 * 2 ** (oct + n / 12)));
const note = (i) => PENTA[Math.max(0, Math.min(PENTA.length - 1, i))];

// Merges in quick succession climb up the scale, like a combo.
let combo = 0;
let comboAt = 0;

export const sfx = {
  tap: () => tick(1800, 0.05),
  press: () => tick(1400, 0.035),
  pick: () => bloop(380, 620, { vol: 0.09, dur: 0.09 }),
  drop: () => bloop(560, 340, { vol: 0.09, dur: 0.1 }),
  pop() {
    bloop(420 + Math.random() * 80, 900, { vol: 0.12, dur: 0.1 });
    bell(note(10 + Math.floor(Math.random() * 3)), { vol: 0.04, dur: 0.3, delay: 0.03 });
  },
  merge(level = 1) {
    const now = performance.now();
    combo = now - comboAt < 2000 ? Math.min(combo + 1, 8) : 0;
    comboAt = now;
    const base = 5 + level + combo;
    pluck(note(base), { vol: 0.16 });
    pluck(note(base + 2), { vol: 0.13, delay: 0.06 });
    bell(note(base + 5), { vol: 0.06, delay: 0.1, dur: 0.6 });
    if (level >= 5) bell(note(base + 7), { vol: 0.05, delay: 0.18, dur: 0.8 });
  },
  coin() {
    bell(1975.5, { vol: 0.07, dur: 0.25 });
    bell(2637, { vol: 0.07, dur: 0.6, delay: 0.07 });
  },
  ready() {
    [10, 12, 15].forEach((n, i) => bell(note(n), { vol: 0.07, delay: i * 0.07, dur: 0.7 }));
  },
  serve() {
    [5, 7, 10].forEach((n, i) => pluck(note(n), { vol: 0.13, delay: i * 0.05 }));
    bell(1975.5, { vol: 0.07, dur: 0.25, delay: 0.15 });
    bell(2637, { vol: 0.07, dur: 0.7, delay: 0.22 });
  },
  discover() {
    [10, 12, 13, 15].forEach((n, i) => bell(note(n), { vol: 0.08, delay: i * 0.09, dur: 1 }));
  },
  levelup() {
    [5, 7, 8, 10].forEach((n, i) => pluck(note(n), { vol: 0.15, delay: i * 0.1 }));
    [10, 12, 15].forEach((n) => bell(note(n), { vol: 0.06, delay: 0.42, dur: 1.4 }));
  },
  error() {
    pluck(note(4), { vol: 0.12, dur: 0.2 });
    pluck(note(2), { vol: 0.12, dur: 0.3, delay: 0.1 });
  },
  open: () => bloop(300, 520, { vol: 0.08, dur: 0.12 }),
  close: () => bloop(520, 300, { vol: 0.08, dur: 0.12 }),
  // Aquarium
  bubble: () => bloop(500 + Math.random() * 400, 1100 + Math.random() * 300, { vol: 0.05, dur: 0.08 }),
  sprinkle() {
    for (let i = 0; i < 3; i++) tick(2400 + Math.random() * 1200, 0.03, i * 0.04);
  },
  nom: () => bloop(700, 380, { vol: 0.1, dur: 0.08 }),
  pet() {
    bell(note(12), { vol: 0.06, dur: 0.5 });
    bell(note(14), { vol: 0.06, dur: 0.7, delay: 0.08 });
  },
  squeak: () => bloop(1300 + Math.random() * 300, 1700, { vol: 0.025, dur: 0.06 }),
  visitor() {
    bell(note(12), { vol: 0.08, dur: 0.8 });
    bell(note(9), { vol: 0.08, dur: 1.1, delay: 0.25 });
  },
};
