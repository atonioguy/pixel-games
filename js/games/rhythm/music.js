// Beat Battle music: original chiptune songs generated from a few parameters, plus the
// synth voices that play them. Every song is "call and response": the opponent sings a
// 4-bar phrase, then the player copies it. Charts come from the same notes as the music,
// so the arrows always line up with what you hear.

export const SONGS = [
  {
    id: 'sugar',
    name: 'Sugar Rush',
    bpm: 100,
    root: 60, // C
    scale: 'major',
    prog: [0, 4, 5, 3], // I V vi IV
    seed: 11,
    density: 1,
    grid: 0.5,
    opp: 'cust_frog',
    oppName: 'Pip',
    shirt: '#aee0d1',
  },
  {
    id: 'pixel',
    name: 'Pixel Pop',
    bpm: 120,
    root: 62, // D
    scale: 'major',
    prog: [0, 5, 3, 4], // I vi IV V
    seed: 27,
    density: 1.05,
    grid: 0.5,
    opp: 'cust_cat',
    oppName: 'Mochi',
    shirt: '#f19bb0',
  },
  {
    id: 'mochi',
    name: 'Midnight Mochi',
    bpm: 136,
    root: 57, // A minor
    scale: 'minor',
    prog: [0, 5, 2, 6], // i VI III VII
    seed: 5,
    density: 0.95,
    grid: 0.25,
    opp: 'cust_bear',
    oppName: 'Honey',
    shirt: '#d7c6f2',
  },
];

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

// Seeded random numbers so a song is identical every time.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Scale degree index -> MIDI note (degree 0 = root, 7 = root an octave up)
function midiOf(song, deg) {
  const sc = SCALES[song.scale];
  const oct = Math.floor(deg / 7);
  return song.root + oct * 12 + sc[((deg % 7) + 7) % 7];
}

const INTRO_BARS = 2;
const PHRASE_BARS = 4;
// Section plan: who sings each 4-bar phrase, and which phrase it is
const PLAN = [
  ['opp', 0],
  ['you', 0],
  ['opp', 1],
  ['you', 1],
  ['opp', 2],
  ['you', 2],
  ['opp', 3],
  ['you', 3],
];

function makePhrase(song, r, g) {
  const notes = [];
  let deg = 7;
  for (let b = 0; b < PHRASE_BARS * 4 - 1; b += g) {
    const onBeat = b % 1 === 0;
    const onHalf = b % 2 === 0;
    let p = onHalf ? 0.9 : onBeat ? 0.7 : b % 0.5 === 0 ? 0.42 : 0.28;
    p *= song.density;
    if (r() > p) continue;
    const chord = song.prog[Math.floor(b / 4) % song.prog.length];
    if (onBeat) {
      // land on a chord tone near where the melody is
      const tones = [];
      for (let o = 0; o <= 14; o += 7) for (const t of [0, 2, 4]) tones.push(chord + t + o);
      tones.sort((a, c) => Math.abs(a - deg) - Math.abs(c - deg));
      deg = tones[r() < 0.7 ? 0 : 1];
    } else {
      deg += [-1, 1, -1, 1, -2, 2, 0][Math.floor(r() * 7)];
    }
    deg = Math.max(4, Math.min(13, deg));
    notes.push({ b, deg });
  }
  // End the phrase on a long chord tone on the last bar's downbeat
  const lastChord = song.prog[(PHRASE_BARS - 1) % song.prog.length];
  const endB = PHRASE_BARS * 4 - 2;
  if (!notes.length || notes[notes.length - 1].b < endB) notes.push({ b: endB, deg: lastChord + 7 });
  // durations: until the next note, capped
  for (let i = 0; i < notes.length; i++) {
    const next = i + 1 < notes.length ? notes[i + 1].b : PHRASE_BARS * 4;
    notes[i].len = Math.min(2, next - notes[i].b);
  }
  return notes;
}

// Builds the whole song: timed events for the synth, and the player's chart.
export function buildSong(song, difficulty) {
  const r = rng(song.seed);
  // Hard is a busier remix with 16th notes; easy/normal share the same melody.
  const grid = difficulty === 'hard' ? 0.25 : song.grid;
  const phrases = [0, 1, 2, 3].map(() => makePhrase(song, r, grid));
  const spb = 60 / song.bpm; // seconds per beat
  const bars = INTRO_BARS + PLAN.length * PHRASE_BARS;
  const events = []; // { t, kind, ... } in seconds from song start
  const chart = []; // player notes
  const oppNotes = []; // opponent notes (for animation)

  // Drums, bass, and a soft arpeggio
  for (let bar = 0; bar < bars + 1; bar++) {
    const chord = song.prog[bar % song.prog.length];
    const t0 = bar * 4 * spb;
    const intro = bar < INTRO_BARS;
    const outro = bar === bars;
    for (let s = 0; s < 4; s += 0.5) events.push({ t: t0 + s * spb, kind: 'hat', v: s % 1 ? 0.5 : 0.8 });
    if (grid < 0.5 && !intro) for (let s = 0.25; s < 4; s += 0.5) events.push({ t: t0 + s * spb, kind: 'hat', v: 0.3 });
    if (intro) {
      // count-in beeps
      for (let s = 0; s < 4; s++)
        if (bar === 1 || s === 0) events.push({ t: t0 + s * spb, kind: 'count', hi: bar === 1 && s === 3 });
      continue;
    }
    events.push({ t: t0, kind: 'kick' }, { t: t0 + 2 * spb, kind: 'kick' });
    if (bar % 2) events.push({ t: t0 + 2.5 * spb, kind: 'kick' });
    events.push({ t: t0 + spb, kind: 'snare' }, { t: t0 + 3 * spb, kind: 'snare' });
    if (outro) break;
    const root = midiOf(song, chord) - 24;
    for (let s = 0; s < 4; s += 0.5)
      events.push({ t: t0 + s * spb, kind: 'bass', midi: s % 1 ? root + 12 : root, dur: spb * 0.45 });
    const arp = [0, 2, 4, 7].map((d) => midiOf(song, chord + d));
    for (let s = 0; s < 4; s += 0.5)
      events.push({ t: t0 + s * spb, kind: 'arp', midi: arp[(s * 2) % 4] + 12, dur: spb * 0.4 });
  }

  // Melody: opponent phrases are played by the music; the player's are the chart.
  PLAN.forEach(([who, idx], n) => {
    const startBeat = (INTRO_BARS + n * PHRASE_BARS) * 4;
    for (const note of phrases[idx]) {
      if (difficulty === 'easy' && note.b % 1 !== 0) continue;
      if (difficulty === 'normal' && note.b % 0.5 !== 0) continue;
      const t = (startBeat + note.b) * spb;
      const midi = midiOf(song, note.deg);
      const lane = ((note.deg % 4) + 4) % 4;
      const holdMin = difficulty === 'hard' ? 1 : 1.5;
      const hold = note.len >= holdMin && difficulty !== 'easy' ? (note.len - 0.25) * spb : 0;
      const dur = Math.max(0.12, note.len * spb * 0.9);
      if (who === 'opp') {
        events.push({ t, kind: 'lead', midi, dur });
        oppNotes.push({ t, lane, hold });
      } else {
        chart.push({ t, lane, hold, midi, dur });
      }
    }
  });
  events.sort((a, b) => a.t - b.t);
  return { events, chart, oppNotes, spb, length: (bars + 1) * 4 * spb };
}

// ---------- Synth voices ----------

const freq = (m) => 440 * 2 ** ((m - 69) / 12);
let noiseBuf = null;
function noise(ctx) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function envGain(ctx, t, vol, a, d, dest) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(dest);
  return g;
}

// Plays one event at absolute AudioContext time `t` into `bus`.
export function playEvent(ctx, bus, ev, t) {
  switch (ev.kind) {
    case 'kick': {
      const g = envGain(ctx, t, 0.5, 0.002, 0.18, bus);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.2);
      break;
    }
    case 'snare': {
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      const g = envGain(ctx, t, 0.22, 0.002, 0.14, bus);
      src.connect(f).connect(g);
      src.start(t);
      src.stop(t + 0.16);
      const tg = envGain(ctx, t, 0.12, 0.002, 0.08, bus);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 190;
      o.connect(tg);
      o.start(t);
      o.stop(t + 0.1);
      break;
    }
    case 'hat': {
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = envGain(ctx, t, 0.06 * (ev.v || 1), 0.001, 0.04, bus);
      src.connect(f).connect(g);
      src.start(t);
      src.stop(t + 0.06);
      break;
    }
    case 'count':
      tone(ctx, bus, ev.hi ? 1046.5 : 784, t, 0.12, 'triangle', 0.18);
      break;
    case 'bass':
      tone(ctx, bus, freq(ev.midi), t, ev.dur, 'triangle', 0.32);
      break;
    case 'arp':
      tone(ctx, bus, freq(ev.midi), t, ev.dur, 'sine', 0.05);
      break;
    case 'lead':
      lead(ctx, bus, ev.midi, t, ev.dur, 'opp');
      break;
  }
}

function tone(ctx, bus, f, t, dur, type, vol) {
  const g = envGain(ctx, t, vol, 0.005, dur, bus);
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// The singing voice: a chiptune square with a little vibrato. The opponent is an octave
// lower and softer; the player's voice is brighter.
export function lead(ctx, bus, midi, t, dur, who = 'you') {
  const g = ctx.createGain();
  const vol = who === 'opp' ? 0.07 : 0.09;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(bus);
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = freq(midi + (who === 'opp' ? 0 : 12));
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  lfo.frequency.value = 6;
  lg.gain.value = 4;
  lfo.connect(lg).connect(o.frequency);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = who === 'opp' ? 2200 : 3200;
  o.connect(f).connect(g);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.05);
  lfo.stop(t + dur + 0.05);
  return {
    stop: (at) => {
      try {
        g.gain.cancelScheduledValues(at);
        g.gain.setValueAtTime(vol, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      } catch {}
    },
  };
}

export function missSound(ctx, bus, t) {
  const g = envGain(ctx, t, 0.15, 0.002, 0.15, bus);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 600;
  o.connect(f).connect(g);
  o.start(t);
  o.stop(t + 0.2);
}

export function click(ctx, bus, t, hi = false) {
  tone(ctx, bus, hi ? 1568 : 1046.5, t, 0.05, 'square', 0.12);
}
