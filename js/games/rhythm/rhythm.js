// Beat Battle: a cozy rhythm battle. The opponent sings a phrase, then it's your turn:
// tap the arrows as they reach the line. Hold long notes. Keep your health up to win.
import { save } from '../../state.js';
import { el, icon, toast, flyCoins, burst, floatText, sheet, center } from '../../ui.js';
import { sfx, audioGraph } from '../../audio.js';
import { haptic } from '../../haptics.js';
import { SPRITES } from '../../sprites.js';
import { spriteCanvas } from '../../pixel.js';
import { SONGS, buildSong, playEvent, lead, missSound, click } from './music.js';

const LANES = 4;
const HW = 96; // highway width in pixels (each lane 24)
const LANE_W = HW / LANES;
const SW = 96; // stage size
const SH = 54;
const WINDOWS = { sick: 0.05, good: 0.095, bad: 0.14 };
const POINTS = { sick: 350, good: 200, bad: 60 };
const HEALTH = { sick: 2.4, good: 1.6, bad: 0.4, miss: -6 };
const SPEED = { easy: 85, normal: 105, hard: 125 }; // pixels per second
const DIFFS = ['easy', 'normal', 'hard'];
const DIFF_COIN = { easy: 0.6, normal: 1, hard: 1.5 };

// Lane colours (pastel take on the classic purple / blue / green / pink)
const LANE_COLORS = [
  ['#d7c6f2', '#9a7fd1'],
  ['#cdeaf7', '#5ea6cf'],
  ['#c9efdc', '#6fae6a'],
  ['#fad0d8', '#e07a93'],
];

// Arrow art (points left); rotated & recoloured for each lane.
const ARROW = [
  '................',
  '.......X........',
  '......XX........',
  '.....XhX........',
  '....XhXX........',
  '...XhXXXXXXXXXX.',
  '..XhXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXXX.',
  '...XXXXXXXXXXXX.',
  '....XXXX........',
  '.....XXX........',
  '......XX........',
  '.......X........',
  '................',
];
const ROT = [0, 3, 1, 2]; // quarter turns clockwise: left, down, up, right

function arrowCanvas(lane, style) {
  const key = `arrow:${lane}:${style}`;
  if (arrowCache.has(key)) return arrowCache.get(key);
  let rows = ARROW.map((r) => r.split(''));
  for (let q = 0; q < ROT[lane]; q++) rows = rows[0].map((_, x) => rows.map((row) => row[x]).reverse());
  const [light, dark] = LANE_COLORS[lane];
  const fill = style === 'note' ? dark : style === 'lit' ? light : '#e9dede';
  const shine = style === 'idle' ? '#f8f2f2' : '#ffffff';
  const cv = document.createElement('canvas');
  cv.width = cv.height = 16;
  const g = cv.getContext('2d');
  const filled = (x, y) => rows[y]?.[x] && rows[y][x] !== '.';
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (filled(x, y)) {
        g.fillStyle = rows[y][x] === 'h' ? shine : fill;
        g.fillRect(x, y, 1, 1);
      } else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        g.fillStyle = style === 'idle' ? '#b8a8a8' : '#6b4a4a';
        g.fillRect(x, y, 1, 1);
      }
    }
  arrowCache.set(key, cv);
  return cv;
}
const arrowCache = new Map();
const sprite = (name, flip) => spriteCanvas(name, SPRITES[name], flip);

function rankOf(acc) {
  if (acc >= 0.97) return 'S';
  if (acc >= 0.9) return 'A';
  if (acc >= 0.8) return 'B';
  if (acc >= 0.65) return 'C';
  return 'D';
}

// ---------- Screen ----------

export function mount(root, { headerSlot }) {
  const s = save.game('rhythm', () => ({ best: {}, cleared: {}, diff: 'normal' }));
  const offsetMs = () => save.settings.rhythmOffset || 0;
  let cleanupPlay = null;

  const pauseBtn = el('button', { class: 'icon-btn', 'aria-label': 'Pause', style: 'display:none' }, '❚❚');
  headerSlot.append(pauseBtn);

  const view = el('div', { class: 'rhythm' });
  root.append(view);

  // ---- Song select ----
  function showSelect() {
    cleanupPlay?.();
    cleanupPlay = null;
    pauseBtn.style.display = 'none';
    const diffRow = el(
      'div',
      { class: 'diff-row' },
      DIFFS.map((d) =>
        el(
          'button',
          {
            class: 'px-btn small diff' + (s.diff === d ? '' : ' ghost'),
            onclick: () => {
              s.diff = d;
              sfx.tap();
              save.persist();
              showSelect();
            },
          },
          d[0].toUpperCase() + d.slice(1),
        ),
      ),
    );
    const cards = SONGS.map((song, i) => {
      const locked = i > 0 && !s.cleared[SONGS[i - 1].id];
      const best = s.best[`${song.id}:${s.diff}`];
      return el(
        'button',
        {
          class: 'song-card px-box' + (locked ? ' locked' : ''),
          onclick: () => {
            if (locked) {
              sfx.error();
              toast(`Beat "${SONGS[i - 1].name}" to unlock`, 'lock');
              return;
            }
            sfx.tap();
            play(song);
          },
        },
        el('div', { class: 'song-face', style: `background:${song.shirt}` }, icon(locked ? 'lock' : song.opp, 44)),
        el(
          'div',
          { class: 'card-text' },
          el('div', { class: 'card-name' }, song.name),
          el('div', { class: 'card-desc' }, locked ? 'Locked' : `vs ${song.oppName} · ${song.bpm} BPM`),
        ),
        el(
          'div',
          { class: 'song-best' },
          best ? el('span', { class: 'rank r-' + best.rank }, best.rank) : '—',
          best ? el('small', {}, best.score.toLocaleString()) : null,
        ),
      );
    });
    view.replaceChildren(
      el(
        'div',
        { class: 'rh-select' },
        el(
          'div',
          { class: 'sign px-box rh-sign' },
          el('div', { class: 'sign-title' }, 'Beat Battle'),
          el('div', { class: 'sign-sub' }, 'copy the tune · tap the arrows ♪'),
        ),
        diffRow,
        el('div', { class: 'game-list' }, cards),
        el(
          'div',
          { class: 'rh-foot' },
          el('button', { class: 'px-btn ghost small', onclick: calibrate }, 'Tap timing'),
          el('div', { class: 'version' }, `timing offset: ${offsetMs()} ms`),
        ),
      ),
    );
  }

  // ---- Calibration: tap along with a metronome ----
  function calibrate() {
    const g = audioGraph();
    if (!g) return toast('Sound is not available here');
    const { ctx, out } = g;
    ctx.resume();
    sfx.open();
    const beats = 16;
    const spb = 0.5;
    let start = 0;
    const taps = [];
    const status = el('div', { class: 'calib-status' }, 'Tap the big button on every click');
    const big = el('button', { class: 'px-btn calib-btn' }, 'TAP');
    const lat = () => ctx.outputLatency || ctx.baseLatency || 0;
    const ui = sheet(
      'Tap timing',
      () => [
        el(
          'p',
          { class: 'backup-note' },
          'Listen to the clicks and tap along. This lines up the arrows with your phone and headphones.',
        ),
        status,
        big,
        el(
          'div',
          { class: 'diff-row' },
          el('button', { class: 'px-btn ghost small', onclick: () => nudge(-10) }, '−10 ms'),
          el('button', { class: 'px-btn ghost small', onclick: () => nudge(10) }, '+10 ms'),
          el('button', { class: 'px-btn ghost small', onclick: () => nudge(-offsetMs()) }, 'Reset'),
        ),
      ],
      () => {
        bus.disconnect();
        showSelect();
      },
    );
    const bus = ctx.createGain();
    bus.connect(out);
    function nudge(d) {
      save.setSetting('rhythmOffset', offsetMs() + d);
      status.textContent = `Offset: ${offsetMs()} ms`;
    }
    function begin() {
      start = ctx.currentTime + 0.6;
      taps.length = 0;
      for (let i = 0; i < beats; i++) click(ctx, bus, start + i * spb, i % 4 === 0);
      status.textContent = 'Tap on each click…';
    }
    big.addEventListener('pointerdown', () => {
      if (!start || ctx.currentTime > start + beats * spb + 0.5) {
        begin();
        return;
      }
      const heard = ctx.currentTime - lat() - start;
      const nearest = Math.round(heard / spb) * spb;
      if (nearest < spb * 2) return; // ignore the first two clicks while you find the beat
      taps.push(heard - nearest);
      haptic(1);
      big.animate([{ transform: 'scale(0.94)' }, { transform: 'none' }], { duration: 120 });
      if (taps.length >= 8) {
        const sorted = [...taps].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];
        save.setSetting('rhythmOffset', Math.round(med * 1000));
        status.textContent = `Done! Offset set to ${offsetMs()} ms`;
        sfx.discover();
        start = 0;
      } else status.textContent = `Keep going… ${8 - taps.length}`;
    });
    return ui;
  }

  // ---- Playing a song ----
  function play(song) {
    cleanupPlay?.();
    cleanupPlay = null;
    const g = audioGraph();
    if (!g) return toast('Sound is not available here');
    const { ctx, out } = g;
    ctx.resume();
    const diff = s.diff;
    const built = buildSong(song, diff);
    const chart = built.chart.map((n) => ({ ...n, done: false, judged: null, holding: false, held: 0 }));
    const oppNotes = built.oppNotes.map((n) => ({ ...n, shown: false }));
    const speed = SPEED[diff];
    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(out);
    const lat = () => ctx.outputLatency || ctx.baseLatency || 0;

    // State
    let startAt = ctx.currentTime + 0.4;
    let evIdx = 0;
    let health = 50;
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    const counts = { sick: 0, good: 0, bad: 0, miss: 0 };
    let finished = false;
    let paused = false;
    let raf = 0;
    const laneDown = [false, false, false, false];
    const laneFlash = [0, 0, 0, 0];
    const touches = new Map(); // pointerId -> lane
    const voices = new Map(); // note -> voice (holds)
    let youPose = { lane: -1, until: 0, miss: 0 };
    let oppPose = { lane: -1, until: 0 };
    const now = () => ctx.currentTime - startAt - lat() - offsetMs() / 1000;
    if (location.search.includes('debug')) window.__rh = { chart, now }; // for automated play-testing

    // DOM
    const stage = el('canvas', { class: 'rh-stage' });
    const sctx = stage.getContext('2d');
    const hpFill = el('div', { class: 'hp-fill' });
    const hpYou = icon('cust_bunny', 26, 'hp-icon you');
    const hpOpp = icon(song.opp, 26, 'hp-icon opp');
    const hpBar = el('div', { class: 'hp-bar' }, hpFill, hpOpp, hpYou);
    const scoreEl = el('span', {}, '0');
    const comboEl = el('div', { class: 'rh-combo' });
    const accEl = el('span', {}, '100%');
    const turnEl = el('div', { class: 'rh-turn' }, 'Get ready!');
    const hud = el('div', { class: 'rh-hud' }, el('div', {}, 'Score ', scoreEl), turnEl, el('div', {}, 'Acc ', accEl));
    const hw = el('canvas', { class: 'rh-highway' });
    const hctx = hw.getContext('2d');
    const hwWrap = el('div', { class: 'rh-hw-wrap' }, hw, comboEl);
    view.replaceChildren(
      el('div', { class: 'rh-play' }, el('div', { class: 'rh-stage-wrap' }, stage), hpBar, hud, hwWrap),
    );
    pauseBtn.style.display = '';

    // Canvas sizing: integer pixel scale for crisp pixel art
    let k = 3;
    let HH = 160;
    function layout() {
      const dpr = window.devicePixelRatio || 1;
      const r = hwWrap.getBoundingClientRect();
      k = Math.max(1, Math.floor((Math.min(r.width, 420) * dpr) / HW));
      HH = Math.max(80, Math.floor((r.height * dpr) / k));
      hw.width = HW * k;
      hw.height = HH * k;
      hw.style.width = (HW * k) / dpr + 'px';
      hw.style.height = (HH * k) / dpr + 'px';
      stage.width = SW * k;
      stage.height = SH * k;
      stage.style.width = (SW * k) / dpr + 'px';
      stage.style.height = (SH * k) / dpr + 'px';
    }
    const ro = new ResizeObserver(layout);
    ro.observe(hwWrap);
    layout();
    const hitY = () => HH - 22;

    // Audio scheduler: queue events a little ahead of time
    const sched = setInterval(() => {
      if (paused || finished) return;
      const horizon = ctx.currentTime - startAt + 0.2;
      while (evIdx < built.events.length && built.events[evIdx].t < horizon) {
        const ev = built.events[evIdx++];
        playEvent(ctx, bus, ev, startAt + ev.t);
      }
    }, 25);

    // ---- Judging ----
    function judge(lane) {
      const t = now();
      let best = null;
      for (const n of chart) {
        if (n.done || n.lane !== lane) continue;
        const d = Math.abs(n.t - t);
        if (d <= WINDOWS.bad && (!best || d < Math.abs(best.t - t))) best = n;
        if (n.t - t > WINDOWS.bad) break;
      }
      if (!best) return false;
      const d = Math.abs(best.t - t);
      const j = d <= WINDOWS.sick ? 'sick' : d <= WINDOWS.good ? 'good' : 'bad';
      best.done = true;
      best.judged = j;
      counts[j]++;
      score += POINTS[j];
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      health = Math.min(100, health + HEALTH[j]);
      laneFlash[lane] = 1;
      youPose = { lane, until: t + 0.3, miss: 0 };
      const v = lead(ctx, bus, best.midi, ctx.currentTime, best.hold ? best.hold + 0.1 : best.dur, 'you');
      if (best.hold) {
        best.holding = true;
        voices.set(best, v);
      }
      popup(j, lane);
      if (j === 'sick') haptic(1);
      if (combo > 0 && combo % 25 === 0) {
        sfx.discover();
        comboFlash();
      }
      return true;
    }

    function miss(n, lane) {
      counts.miss++;
      combo = 0;
      health += HEALTH.miss;
      youPose = { lane, until: now() + 0.35, miss: 1 };
      missSound(ctx, bus, ctx.currentTime);
      popup('miss', lane);
      if (n) n.judged = 'miss';
      if (health <= 0) fail();
    }

    function popup(j, lane) {
      const r = hw.getBoundingClientRect();
      const x = r.left + ((lane + 0.5) * LANE_W * r.width) / HW;
      const y = r.top + (hitY() / HH) * r.height - 34;
      const colors = { sick: '#e07a93', good: '#5ea6cf', bad: '#9b7b7b', miss: '#b8a8a8' };
      floatText(x, y, { sick: 'Sick!', good: 'Good', bad: 'Bad', miss: 'Miss' }[j], { color: colors[j] });
      if (j === 'sick') burst(x, y + 34, { count: 6, spread: 26, stars: 0, size: 4, colors: LANE_COLORS[lane] });
    }

    function comboFlash() {
      comboEl.classList.remove('pop');
      void comboEl.offsetWidth;
      comboEl.classList.add('pop');
    }

    function releaseLane(lane) {
      laneDown[lane] = false;
      for (const n of chart) {
        if (n.holding && n.lane === lane) {
          n.holding = false;
          const v = voices.get(n);
          v?.stop(ctx.currentTime);
          voices.delete(n);
        }
      }
    }

    // ---- Input ----
    function laneAt(e) {
      const r = hw.getBoundingClientRect();
      return Math.max(0, Math.min(LANES - 1, Math.floor(((e.clientX - r.left) / r.width) * LANES)));
    }
    const onDown = (e) => {
      if (paused || finished) return;
      e.preventDefault();
      const lane = laneAt(e);
      touches.set(e.pointerId, lane);
      laneDown[lane] = true;
      try {
        hw.setPointerCapture(e.pointerId);
      } catch {}
      if (!judge(lane)) {
        // tapping with nothing there: a soft "ghost tap", no penalty
        laneFlash[lane] = 0.5;
      }
    };
    const onUp = (e) => {
      const lane = touches.get(e.pointerId);
      touches.delete(e.pointerId);
      if (lane !== undefined && ![...touches.values()].includes(lane)) releaseLane(lane);
    };
    hw.addEventListener('pointerdown', onDown);
    hw.addEventListener('pointerup', onUp);
    hw.addEventListener('pointercancel', onUp);
    const KEYS = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3, d: 0, f: 1, j: 2, k: 3 };
    const onKey = (e) => {
      const lane = KEYS[e.key];
      if (lane === undefined || e.repeat || paused || finished) return;
      if (e.type === 'keydown') {
        laneDown[lane] = true;
        judge(lane);
      } else releaseLane(lane);
    };
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKey);

    // ---- Pause ----
    function setPaused(p) {
      if (finished || p === paused) return;
      paused = p;
      if (p) {
        ctx.suspend();
        overlay('Paused', 'Take a breather!', [
          ['Resume', () => setPaused(false)],
          ['Quit', () => showSelect()],
        ]);
      } else {
        closeOverlay();
        ctx.resume();
      }
    }
    pauseBtn.onclick = () => setPaused(!paused);
    const onVis = () => document.visibilityState === 'hidden' && setPaused(true);
    document.addEventListener('visibilitychange', onVis);

    let overlayEl = null;
    function overlay(title, text, buttons, extra = null) {
      closeOverlay();
      overlayEl = el(
        'div',
        { class: 'rh-overlay' },
        el(
          'div',
          { class: 'dialog px-box' },
          el('h2', {}, title),
          extra,
          text ? el('p', {}, text) : null,
          el(
            'div',
            { class: 'dialog-btns' },
            buttons.map(([label, fn], i) =>
              el('button', { class: 'px-btn' + (i ? ' ghost' : ''), onclick: fn }, label),
            ),
          ),
        ),
      );
      view.querySelector('.rh-play')?.append(overlayEl);
    }
    function closeOverlay() {
      overlayEl?.remove();
      overlayEl = null;
    }

    // ---- End states ----
    function stopAudio() {
      try {
        bus.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        setTimeout(() => bus.disconnect(), 300);
      } catch {}
    }

    function fail() {
      if (finished) return;
      finished = true;
      pauseBtn.style.display = 'none';
      stopAudio();
      sfx.error();
      haptic(3);
      overlay(`${song.oppName} wins this round!`, 'You ran out of breath. Try again?', [
        ['Retry', () => play(song)],
        ['Songs', () => showSelect()],
      ]);
    }

    function finish() {
      if (finished) return;
      finished = true;
      pauseBtn.style.display = 'none';
      const total = chart.length;
      const acc = total ? (counts.sick + counts.good * 0.75 + counts.bad * 0.35) / total : 0;
      const rank = rankOf(acc);
      const key = `${song.id}:${diff}`;
      const prev = s.best[key];
      const firstClear = !s.cleared[song.id];
      let coins = Math.round(total * acc * 0.35 * DIFF_COIN[diff]);
      if (firstClear) coins += 30;
      s.cleared[song.id] = true;
      if (!prev || score > prev.score) s.best[key] = { score, rank, acc: Math.round(acc * 1000) / 10 };
      save.addCoins(coins);
      save.persist();
      setTimeout(stopAudio, 1500);
      sfx.levelup();
      haptic(3);
      const big = el('div', { class: 'rank big r-' + rank }, rank);
      overlay(
        rank === 'S' ? 'Perfect harmony!' : rank === 'D' ? 'You made it!' : 'You win!',
        null,
        [
          ['Songs', () => showSelect()],
          ['Retry', () => play(song)],
        ],
        el(
          'div',
          { class: 'rh-results' },
          big,
          el('div', {}, `Score ${score.toLocaleString()}${!prev || score > prev.score ? ' · New best!' : ''}`),
          el('div', {}, `Accuracy ${(acc * 100).toFixed(1)}% · Max combo ${maxCombo}`),
          el(
            'div',
            { class: 'rh-counts' },
            `Sick ${counts.sick} · Good ${counts.good} · Bad ${counts.bad} · Miss ${counts.miss}`,
          ),
          el('div', { class: 'rh-coins' }, icon('coin', 18), ` +${coins}${firstClear ? ' (first clear!)' : ''}`),
        ),
      );
      const [x, y] = center(view);
      burst(x, y - 60, { count: 26, spread: 150, stars: 6, size: 6 });
      flyCoins({ left: x - 20, top: y - 80, width: 40, height: 40 }, Math.min(8, 2 + Math.ceil(coins / 10)));
    }

    // ---- Per-frame update & drawing ----
    function update() {
      const t = now();
      // Misses: notes that scrolled past the window
      for (const n of chart) {
        if (!n.done && n.t < t - WINDOWS.bad) {
          n.done = true;
          miss(n, n.lane);
        }
        // Holds: score while held, finish at the end
        if (n.holding) {
          if (t >= n.t + n.hold) {
            n.holding = false;
            score += 100;
            voices.delete(n);
          } else {
            score += 2;
          }
        }
      }
      // Opponent singing animation
      for (const n of oppNotes) {
        if (!n.shown && n.t <= t) {
          n.shown = true;
          oppPose = { lane: n.lane, until: t + Math.max(0.25, n.hold) };
        }
      }
      for (let i = 0; i < LANES; i++) laneFlash[i] = Math.max(0, laneFlash[i] - 0.08);
      // Whose turn?
      const nextYou = chart.find((n) => !n.done);
      const nextOpp = oppNotes.find((n) => !n.shown);
      const turn =
        t < 0 ? 'Get ready!' : nextYou && (!nextOpp || nextYou.t < nextOpp.t) ? 'Your turn!' : `${song.oppName}'s turn`;
      if (turnEl.textContent !== turn) turnEl.textContent = turn;
      scoreEl.textContent = score.toLocaleString();
      const judged = counts.sick + counts.good + counts.bad + counts.miss;
      accEl.textContent = judged
        ? Math.round(((counts.sick + counts.good * 0.75 + counts.bad * 0.35) / judged) * 100) + '%'
        : '100%';
      comboEl.textContent = combo >= 5 ? `${combo} combo` : '';
      hpFill.style.width = Math.max(0, Math.min(100, health)) + '%';
      hpYou.style.left = `calc(${Math.max(0, Math.min(100, health))}% - 13px)`;
      if (!finished && t > built.length - 2) finish();
    }

    function drawHighway() {
      const g = hctx;
      g.setTransform(k, 0, 0, k, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#fff4f6';
      g.fillRect(0, 0, HW, HH);
      for (let i = 0; i < LANES; i++) {
        g.fillStyle = i % 2 ? '#fdeef1' : '#fbe4e9';
        g.fillRect(i * LANE_W, 0, LANE_W, HH);
        if (laneDown[i] || laneFlash[i] > 0) {
          g.fillStyle = LANE_COLORS[i][0];
          g.globalAlpha = laneDown[i] ? 0.55 : laneFlash[i] * 0.6;
          g.fillRect(i * LANE_W, 0, LANE_W, HH);
          g.globalAlpha = 1;
        }
      }
      // beat lines
      const t = now();
      const spb = built.spb;
      g.fillStyle = 'rgba(107,74,74,0.08)';
      for (let b = Math.ceil(t / spb); b * spb < t + HH / speed; b++) {
        const y = Math.round(hitY() - (b * spb - t) * speed + 8);
        g.fillRect(0, y, HW, b % 4 ? 1 : 2);
      }
      // receptors
      for (let i = 0; i < LANES; i++) {
        const pop = laneFlash[i] > 0.6 ? 1 : 0;
        g.drawImage(
          arrowCanvas(i, laneDown[i] ? 'lit' : 'idle'),
          i * LANE_W + 4 - pop,
          hitY() - pop,
          16 + pop * 2,
          16 + pop * 2,
        );
      }
      // the opponent's notes, as faint ghosts: a preview of what you'll copy next
      g.globalAlpha = 0.22;
      for (const n of oppNotes) {
        const y = hitY() - (n.t - t) * speed;
        if (y < -16 || y > hitY() + 4) continue;
        g.drawImage(arrowCanvas(n.lane, 'note'), n.lane * LANE_W + 4, Math.round(y));
      }
      g.globalAlpha = 1;
      // notes (and hold tails)
      for (const n of chart) {
        if (n.done && !n.holding) continue;
        const y = hitY() - (n.t - t) * speed;
        if (n.hold) {
          const endY = hitY() - (n.t + n.hold - t) * speed;
          const top = Math.max(-4, endY + 8);
          const bottom = n.holding ? hitY() + 8 : y + 8;
          if (bottom > top) {
            g.fillStyle = LANE_COLORS[n.lane][1];
            g.globalAlpha = n.holding ? 0.9 : 0.6;
            g.fillRect(n.lane * LANE_W + 9, top, 6, bottom - top);
            g.globalAlpha = 1;
          }
        }
        if (n.done) continue;
        if (y < -16 || y > HH) continue;
        g.drawImage(arrowCanvas(n.lane, 'note'), n.lane * LANE_W + 4, Math.round(y));
      }
    }

    function drawChar(g, spriteName, shirt, x, y, pose, t, beatPhase, flip) {
      const singing = pose.until > t;
      const dir = singing
        ? [
            [-1, 0],
            [0, 1],
            [0, -1],
            [1, 0],
          ][pose.lane] || [0, 0]
        : [0, 0];
      const bop = beatPhase < 0.15 ? 1 : 0;
      const shake = pose.miss && singing ? (Math.floor(t * 30) % 2 ? 1 : -1) : 0;
      const ox = x + dir[0] * 2 + shake;
      const oy = y + dir[1] * 2 + bop;
      // body
      g.fillStyle = '#6b4a4a';
      g.fillRect(ox - 5, oy + 12, 10, 8);
      g.fillStyle = pose.miss && singing ? '#b8a8a8' : shirt;
      g.fillRect(ox - 4, oy + 13, 8, 6);
      // mic
      g.fillStyle = '#6b4a4a';
      g.fillRect(ox + (flip ? -8 : 6), oy + 8, 3, 6);
      g.fillStyle = '#b8a8a8';
      g.fillRect(ox + (flip ? -8 : 6), oy + 6, 3, 3);
      g.drawImage(sprite(spriteName, flip), ox - 8, oy - 4);
      if (singing && !pose.miss) {
        // music note puff
        g.fillStyle = '#9a7fd1';
        const nx = ox + (flip ? -14 : 11);
        g.fillRect(nx, oy - 6, 1, 5);
        g.fillRect(nx - 2, oy - 2, 3, 2);
      }
    }

    function drawStage() {
      const g = sctx;
      g.setTransform(k, 0, 0, k, 0, 0);
      g.imageSmoothingEnabled = false;
      const t = now();
      const beat = t / built.spb;
      const phase = beat - Math.floor(beat);
      // sky
      const bands = ['#cdb8ee', '#d7c6f2', '#e3d6f7', '#f1def0', '#fad0d8'];
      bands.forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect(0, i * 7, SW, 7);
      });
      // string lights that blink on the beat
      for (let i = 0; i < 12; i++) {
        const x = 4 + i * 8;
        const y = 3 + Math.round(Math.sin(i * 0.9) * 2);
        const on = (Math.floor(beat) + i) % 2 === 0;
        g.fillStyle = on ? ['#ffe08a', '#f19bb0', '#aee0d1'][i % 3] : '#b8a8a8';
        g.fillRect(x, y, 2, 2);
      }
      // stage floor
      g.fillStyle = '#c47f4f';
      g.fillRect(0, 40, SW, 14);
      g.fillStyle = '#e7ae6e';
      g.fillRect(0, 40, SW, 2);
      g.fillStyle = 'rgba(107,74,74,0.25)';
      for (let x = 6; x < SW; x += 16) g.fillRect(x, 42, 1, 12);
      // speakers pump on the beat
      const pump = phase < 0.12 ? 1 : 0;
      for (const sx of [41, 48]) {
        g.fillStyle = '#6b4a4a';
        g.fillRect(sx - pump, 26 - pump, 7 + pump * 2, 14 + pump);
        g.fillStyle = '#9b7b7b';
        g.fillRect(sx + 2, 29, 3, 3);
        g.fillRect(sx + 1, 34, 5, 5);
      }
      drawChar(g, song.opp, song.shirt, 20, 20, oppPose, t, phase, false);
      drawChar(g, 'cust_bunny', '#f19bb0', 76, 20, youPose, t, phase, true);
      // opponent's mini arrows (light up as they sing)
      for (let i = 0; i < LANES; i++) {
        const lit = oppPose.until > t && oppPose.lane === i;
        g.globalAlpha = lit ? 1 : 0.35;
        g.drawImage(arrowCanvas(i, lit ? 'note' : 'idle'), 2 + i * 9, 44, 8, 8);
      }
      g.globalAlpha = 1;
    }

    function loop() {
      if (!paused) update();
      drawStage();
      drawHighway();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    cleanupPlay = () => {
      finished = true;
      cancelAnimationFrame(raf);
      clearInterval(sched);
      ro.disconnect();
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      document.removeEventListener('visibilitychange', onVis);
      stopAudio();
      if (ctx.state === 'suspended') ctx.resume();
    };
  }

  showSelect();
  return () => {
    cleanupPlay?.();
    document.querySelectorAll('.sheet-shade').forEach((n) => n.remove());
    save.flush();
  };
}
