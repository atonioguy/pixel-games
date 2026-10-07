// Fishy Tank: a cozy aquarium. Feed your fish, wipe the glass, pet them, decorate the tank,
// and new fish come to visit depending on your decorations (you can adopt them).
// Time keeps passing while the app is closed.
import { save } from '../../state.js';
import { el, icon, toast, confirmBox, flyCoins, burst, floatText, center, sheet } from '../../ui.js';
import { sfx } from '../../audio.js';
import { haptic } from '../../haptics.js';
import { SPRITES } from '../../sprites.js';
import { spriteCanvas } from '../../pixel.js';
import {
  SPECIES,
  SPECIES_BY_ID,
  RARITY,
  DECOR,
  DECOR_BY_ID,
  DECOR_SLOTS,
  TANK_SIZES,
  HUNGER_PER_HOUR,
  DIRT_PER_HOUR,
  LOVE_DECAY_PER_HOUR,
  FLAKE_FOOD,
  FLAKE_DIRT,
  MAX_SPOTS,
  VISIT_CHECK_MIN,
  VISIT_CHANCE,
  MAX_VISITORS,
  VISIT_STAY_MIN,
  COIN_BUBBLE,
  MAX_BUBBLES,
  NAMES,
} from './data.js';

// Tank size in "pixels" (drawn scaled up to fit the phone)
const W = 128;
const H = 144;
const SAND = 126; // y where the sand starts
const SLOT_X = [14, 39, 64, 89, 114];
const HOUR = 3600 * 1000;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sprite = (name, flip) => spriteCanvas(name, SPRITES[name], flip);
const stars = (n) => '★'.repeat(n) + '☆'.repeat(4 - n);

let uid = 0;
const newId = () => Date.now().toString(36) + (uid++).toString(36);

// ---------- State ----------

function freshName(s) {
  const used = new Set(s.residents.map((r) => r.name));
  const free = NAMES.filter((n) => !used.has(n));
  return pick(free.length ? free : NAMES);
}

function newState() {
  const now = Date.now();
  const s = {
    residents: [],
    visitors: [],
    seen: { goldfish: true },
    adopted: { goldfish: 2 },
    owned: ['seaweed'],
    placed: ['seaweed', null, null, null, null],
    tank: 0,
    dirt: 0.2,
    bank: COIN_BUBBLE * 2,
    lastTick: now,
    nextVisit: now + 12 * 1000, // first visitor shows up quickly
    firstVisit: true,
  };
  s.residents.push({ id: newId(), sp: 'goldfish', name: 'Mochi', hunger: 60, love: 20 });
  s.residents.push({ id: newId(), sp: 'goldfish', name: 'Bubbles', hunger: 55, love: 20 });
  return s;
}

const capacity = (s) => TANK_SIZES[s.tank].cap;
const placedIds = (s) => s.placed.filter(Boolean);

function happiness(s, f) {
  const placed = placedIds(s);
  const decor = Math.min(100, placed.length * 25);
  const likes = placed.includes(SPECIES_BY_ID[f.sp].likes) ? 10 : 0;
  return clamp(0.4 * f.hunger + 0.3 * (1 - s.dirt) * 100 + 0.15 * decor + 0.15 * f.love + likes, 0, 100);
}

function rollVisitor(s, at) {
  const placed = placedIds(s);
  const visiting = new Set(s.visitors.map((v) => v.sp));
  let pool = SPECIES.filter((sp) => !visiting.has(sp.id));
  if (s.firstVisit) pool = pool.filter((sp) => sp.id === 'guppy' || sp.id === 'tetra');
  const weights = pool.map((sp) => {
    const liked = placed.includes(sp.likes);
    if (sp.rarity >= 3 && !liked) return 0;
    return RARITY[sp.rarity].weight * (liked ? 4 : 1);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let r = Math.random() * total;
  const sp = pool[weights.findIndex((w) => (r -= w) < 0)] || pool[0];
  s.firstVisit = false;
  return { id: newId(), sp: sp.id, until: at + rand(...VISIT_STAY_MIN) * 60000, greeted: false };
}

// Advance the tank's clock to `now` (also covers time the app was closed). Returns events.
function simulate(s, now) {
  const events = [];
  let t = Math.max(s.lastTick, now - 3 * 24 * HOUR);
  while (t < now) {
    const step = Math.min(now - t, 10 * 60000);
    const h = step / HOUR;
    for (const f of s.residents) {
      f.hunger = Math.max(0, f.hunger - HUNGER_PER_HOUR * h);
      f.love = Math.max(0, f.love - LOVE_DECAY_PER_HOUR * h);
      const income = RARITY[SPECIES_BY_ID[f.sp].rarity].income;
      s.bank = Math.min(MAX_BUBBLES * COIN_BUBBLE, s.bank + ((income * happiness(s, f)) / 100) * h);
    }
    s.dirt = Math.min(1, s.dirt + DIRT_PER_HOUR * h);
    t += step;
    for (const v of s.visitors.filter((v) => v.until <= t)) events.push({ type: 'leave', v });
    s.visitors = s.visitors.filter((v) => v.until > t);
    while (s.nextVisit <= t) {
      if (s.visitors.length < MAX_VISITORS && (s.firstVisit || Math.random() < VISIT_CHANCE)) {
        const v = rollVisitor(s, s.nextVisit);
        if (v && v.until > now) {
          s.visitors.push(v);
          events.push({ type: 'visit', v });
        }
      }
      s.nextVisit += VISIT_CHECK_MIN * 60000;
    }
  }
  s.lastTick = now;
  return events;
}

function validState(s) {
  return s && Array.isArray(s.residents) && Array.isArray(s.placed) && s.placed.length === DECOR_SLOTS;
}

// ---------- The game screen ----------

export function mount(root, { headerSlot }) {
  let s = save.game('aquarium', newState);
  if (!validState(s)) {
    save.resetGame('aquarium');
    s = save.game('aquarium', newState);
  }
  const startEvents = simulate(s, Date.now());

  let mode = 'look'; // look | feed | clean
  let selectedId = null;
  let raf = 0;
  let k = 3; // device pixels per tank pixel
  let pointer = null; // {x, y, down}

  // --- DOM ---
  const fishNum = el('span', { class: 'pill-num' });
  headerSlot.append(el('div', { class: 'pill' }, icon('f_goldfish', 22), fishNum));

  const meter = (iconName, cls) => {
    const fill = el('div', { class: 'meter-fill ' + cls });
    return { fill, node: el('div', { class: 'meter' }, icon(iconName, 20), el('div', { class: 'meter-track' }, fill)) };
  };
  const mFood = meter('fishfood', 'food');
  const mClean = meter('sparkle', 'clean');
  const mHappy = meter('heart', 'happy');

  const canvas = el('canvas', { class: 'tank-canvas' });
  const ctx = canvas.getContext('2d');
  const tankWrap = el('div', { class: 'tank-wrap' }, el('div', { class: 'tank-frame' }, canvas));

  const toolBtn = (iconName, label, onclick) =>
    el('button', { class: 'tool px-btn ghost', onclick }, icon(iconName, 28), el('span', {}, label));
  const feedBtn = toolBtn('fishfood', 'Feed', () => setMode(mode === 'feed' ? 'look' : 'feed'));
  const cleanBtn = toolBtn('sponge', 'Clean', () => setMode(mode === 'clean' ? 'look' : 'clean'));
  const decorBtn = toolBtn('decor', 'Decor', () => openDecor());
  const dexBtn = toolBtn('book', 'Fishdex', () => openDex());
  const info = el('div', { class: 'info aq-info px-box' });

  root.append(
    el(
      'div',
      { class: 'aquarium' },
      el('div', { class: 'meters' }, mFood.node, mClean.node, mHappy.node),
      tankWrap,
      el('div', { class: 'tools' }, feedBtn, cleanBtn, decorBtn, dexBtn),
      info,
    ),
  );

  // --- Runtime world (not saved) ---
  let swimmers = [];
  let flakes = [];
  let bubbles = [];
  let hearts = [];
  let spots = [];
  let pops = []; // coin bubbles being collected
  let time = 0;

  function zoneY(zone) {
    if (zone === 'top') return [14, 56];
    if (zone === 'bottom') return [SAND - 16, SAND - 8];
    return [18, SAND - 22];
  }

  function newTarget(f) {
    const [y0, y1] = zoneY(f.spec.zone);
    f.tx = rand(12, W - 12);
    f.ty = rand(y0, y1);
    f.wait = rand(60, 260);
  }

  function makeSwimmer(ref, visitor, fromEdge = false) {
    const spec = SPECIES_BY_ID[ref.sp];
    const [y0, y1] = zoneY(spec.zone);
    const f = {
      ref,
      visitor,
      spec,
      x: fromEdge ? (Math.random() < 0.5 ? -10 : W + 10) : rand(14, W - 14),
      y: rand(y0, y1),
      vx: 0,
      vy: 0,
      face: 1,
      phase: rand(0, 6.28),
      wiggle: 0,
      petAt: 0,
    };
    newTarget(f);
    if (fromEdge) f.tx = rand(30, W - 30);
    return f;
  }

  function syncSwimmers() {
    const refs = [...s.residents.map((r) => [r, false]), ...s.visitors.map((v) => [v, true])];
    const ids = new Set(refs.map(([r]) => r.id));
    swimmers = swimmers.filter((f) => ids.has(f.ref.id));
    for (const [r, vis] of refs) {
      const f = swimmers.find((x) => x.ref.id === r.id);
      if (f) {
        f.ref = r;
        f.visitor = vis;
      } else swimmers.push(makeSwimmer(r, vis, vis));
    }
  }

  function syncSpots() {
    const target = Math.round(s.dirt * MAX_SPOTS);
    while (spots.length < target) {
      spots.push({ x: rand(4, W - 6), y: rand(6, H - 6), r: Math.random() < 0.3 ? 2 : 1, c: Math.random() < 0.5 });
    }
    if (spots.length > target) spots.length = target;
  }

  // --- Background (drawn once) ---
  let bg = null;
  function buildBackground() {
    bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    const g = bg.getContext('2d');
    const bands = ['#dcf3f6', '#d0eef3', '#c4e8ef', '#b8e2ea', '#acdce6', '#a1d6e2', '#97d0de'];
    const bh = Math.ceil(SAND / bands.length);
    bands.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(0, i * bh, W, bh);
      // dithered edge between bands
      if (i > 0) {
        g.fillStyle = bands[i - 1];
        for (let x = i % 2; x < W; x += 2) g.fillRect(x, i * bh, 1, 1);
      }
    });
    // Sand
    g.fillStyle = '#f3e2bf';
    g.fillRect(0, SAND, W, H - SAND);
    g.fillStyle = '#fbefd9';
    g.fillRect(0, SAND, W, 1);
    const pebbles = ['#e6cc9c', '#e6cc9c', '#f8efd6', '#f19bb0', '#aee0d1', '#d7c6f2'];
    for (let i = 0; i < 70; i++) {
      g.fillStyle = pick(pebbles);
      g.fillRect(Math.floor(rand(0, W)), Math.floor(rand(SAND + 2, H)), Math.random() < 0.3 ? 2 : 1, 1);
    }
  }

  // Slanted light rays, drawn into a wide strip that slowly drifts.
  const rays = document.createElement('canvas');
  rays.width = W + 64;
  rays.height = SAND;
  {
    const g = rays.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.13)';
    for (let x = 0; x < rays.width; x += 32) {
      for (let y = 0; y < SAND; y++) g.fillRect(x + Math.floor(y / 3), y, 7, 1);
    }
  }

  // --- Layout ---
  function layout() {
    const r = tankWrap.getBoundingClientRect();
    const frame = 12;
    const cssScale = Math.min((r.width - frame) / W, (r.height - frame) / H);
    const dpr = window.devicePixelRatio || 1;
    k = Math.max(1, Math.floor(cssScale * dpr));
    canvas.width = W * k;
    canvas.height = H * k;
    canvas.style.width = (W * k) / dpr + 'px';
    canvas.style.height = (H * k) / dpr + 'px';
    ctx.imageSmoothingEnabled = false;
  }
  const ro = new ResizeObserver(layout);
  ro.observe(tankWrap);

  // --- Coordinates ---
  function toTank(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  }
  function toScreen(x, y) {
    const r = canvas.getBoundingClientRect();
    return [r.left + (x / W) * r.width, r.top + (y / H) * r.height];
  }

  // --- Simulation step (every frame) ---
  function update() {
    time++;
    // Fish
    for (const f of swimmers) {
      f.phase += 0.05;
      if (f.wiggle > 0) f.wiggle--;
      const sad = !f.visitor && happiness(s, f.ref) < 40;
      let speed = f.spec.speed * (sad ? 0.6 : 1);
      // Hungry fish chase food
      let chasing = null;
      if (!f.visitor && f.ref.hunger < 95 && flakes.length) {
        let best = 70;
        for (const fl of flakes) {
          const d = Math.hypot(fl.x - f.x, fl.y - f.y);
          if (d < best) {
            best = d;
            chasing = fl;
          }
        }
      }
      if (chasing) {
        f.tx = chasing.x;
        f.ty = chasing.y;
        speed *= 2.2;
        if (Math.hypot(chasing.x - f.x, chasing.y - f.y) < 5) {
          flakes.splice(flakes.indexOf(chasing), 1);
          f.ref.hunger = Math.min(100, f.ref.hunger + FLAKE_FOOD);
          f.wiggle = 14;
          if (time % 3 === 0 || Math.random() < 0.4) sfx.nom();
          bubbles.push({ x: f.x + f.face * 6, y: f.y - 2, r: 1, vy: 0.4 });
        }
      }
      if (f.spec.zone === 'drift') {
        // Jellyfish: gentle pulses upward, then sink.
        if (f.phase % 4 < 0.06) f.vy = -0.55;
        f.vy = Math.min(f.vy + 0.008, 0.18);
        f.vx = Math.sin(f.phase * 0.3) * 0.12;
        if (chasing) f.vx += Math.sign(f.tx - f.x) * 0.15;
      } else {
        const dx = f.tx - f.x;
        const dy = f.ty - f.y;
        const d = Math.hypot(dx, dy);
        if (d < 3 && !chasing) {
          f.vx *= 0.9;
          f.vy *= 0.9;
          if (--f.wait <= 0) newTarget(f);
        } else {
          f.vx += ((dx / d) * speed - f.vx) * 0.04;
          f.vy += ((dy / d) * speed * 0.6 - f.vy) * 0.04;
        }
      }
      f.x += f.vx;
      f.y += f.vy;
      const [y0, y1] = zoneY(f.spec.zone);
      f.y = clamp(f.y, Math.min(y0, 12), Math.max(y1, SAND - 8));
      if (f.x > -8 && f.x < W + 8) f.x = clamp(f.x, 8, W - 8);
      if (f.vx > 0.04) f.face = 1;
      else if (f.vx < -0.04) f.face = -1;
    }
    // Food flakes sink, then dirty the tank if nobody eats them.
    for (const fl of flakes) {
      if (fl.settled) {
        fl.settled++;
      } else {
        fl.y += 0.22;
        fl.x += Math.sin(time * 0.05 + fl.seed) * 0.12;
        if (fl.y >= SAND - 1) {
          fl.y = SAND - 1;
          fl.settled = 1;
        }
      }
    }
    const rotten = flakes.filter((fl) => fl.settled > 360);
    if (rotten.length) {
      flakes = flakes.filter((fl) => fl.settled <= 360);
      s.dirt = Math.min(1, s.dirt + FLAKE_DIRT * rotten.length);
      syncSpots();
    }
    // Ambient bubbles
    if (time % 40 === 0) {
      const slot = Math.floor(rand(0, DECOR_SLOTS));
      const fromDecor = s.placed[slot] && Math.random() < 0.6;
      bubbles.push({
        x: fromDecor ? SLOT_X[slot] + rand(-3, 3) : rand(4, W - 4),
        y: SAND - 4,
        r: Math.random() < 0.3 ? 2 : 1,
        vy: rand(0.25, 0.5),
      });
    }
    for (const b of bubbles) {
      b.y -= b.vy;
      b.x += Math.sin((b.y + b.x) * 0.15) * 0.15;
    }
    bubbles = bubbles.filter((b) => b.y > 3);
    for (const h of hearts) {
      h.y -= 0.35;
      h.life--;
    }
    hearts = hearts.filter((h) => h.life > 0);
  }

  // --- Drawing ---
  function px(x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function drawHeart(x, y, c = '#f19bb0') {
    x = Math.round(x);
    y = Math.round(y);
    px(x, y, 2, 1, c);
    px(x + 3, y, 2, 1, c);
    px(x - 1, y + 1, 7, 2, c);
    px(x, y + 3, 5, 1, c);
    px(x + 1, y + 4, 3, 1, c);
    px(x + 2, y + 5, 1, 1, c);
  }

  function coinBubbles() {
    const n = Math.min(MAX_BUBBLES, Math.floor(s.bank / COIN_BUBBLE));
    const list = [];
    for (let i = 0; i < n; i++) {
      list.push({ i, x: 12 + ((i * 37) % 104), y: 12 + (i % 3) * 7 + Math.sin(time * 0.03 + i) * 1.5 });
    }
    return list;
  }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (!bg) buildBackground();
    ctx.drawImage(bg, 0, 0);
    ctx.drawImage(rays, -((time * 0.1) % 32) - 32, 0);

    // Decorations
    s.placed.forEach((id, i) => {
      if (!id) return;
      ctx.drawImage(sprite(DECOR_BY_ID[id].sprite), SLOT_X[i] - 8, SAND - 13);
    });

    // Food
    for (const fl of flakes) px(fl.x, fl.y, 2, 2, fl.c);

    // Fish
    for (const f of swimmers) {
      const bob = f.spec.zone === 'drift' ? 0 : Math.sin(f.phase) * 0.8;
      const hop = f.wiggle > 0 ? -Math.abs(Math.sin(f.wiggle * 0.45)) * 2 : 0;
      ctx.drawImage(sprite(f.spec.sprite, f.face < 0), Math.round(f.x - 8), Math.round(f.y - 8 + bob + hop));
      if (f.visitor && time % 90 < 60) {
        // little sparkle over visitors
        const sx = Math.round(f.x + 4);
        const sy = Math.round(f.y - 13 + bob);
        px(sx, sy - 1, 1, 3, '#ffe08a');
        px(sx - 1, sy, 3, 1, '#ffe08a');
      }
      if (f.ref.id === selectedId) {
        const ay = Math.round(f.y - 15 + Math.sin(time * 0.15) * 1.5);
        px(f.x - 2, ay, 5, 1, '#6b4a4a');
        px(f.x - 1, ay + 1, 3, 1, '#6b4a4a');
        px(f.x, ay + 2, 1, 1, '#6b4a4a');
      } else if (!f.visitor && time % 240 < 80) {
        const hp = happiness(s, f.ref);
        if (hp < 40) {
          // sad little sweat drop
          px(f.x + 5, f.y - 11, 1, 1, '#86bfe0');
          px(f.x + 4, f.y - 10, 3, 2, '#86bfe0');
        }
      }
    }

    // Bubbles
    for (const b of bubbles) {
      if (b.r === 1) {
        px(b.x, b.y, 1, 1, 'rgba(255,255,255,0.85)');
      } else {
        px(b.x - 1, b.y, 1, 1, 'rgba(255,255,255,0.8)');
        px(b.x + 1, b.y, 1, 1, 'rgba(255,255,255,0.8)');
        px(b.x, b.y - 1, 1, 1, 'rgba(255,255,255,0.8)');
        px(b.x, b.y + 1, 1, 1, 'rgba(255,255,255,0.8)');
      }
    }

    // Coin bubbles
    for (const cb of coinBubbles()) {
      if (pops.includes(cb.i)) continue;
      const x = Math.round(cb.x);
      const y = Math.round(cb.y);
      px(x - 2, y - 4, 5, 1, '#ffffff');
      px(x - 2, y + 4, 5, 1, '#ffffff');
      px(x - 4, y - 2, 1, 5, '#ffffff');
      px(x + 4, y - 2, 1, 5, '#ffffff');
      px(x - 3, y - 3, 1, 1, '#ffffff');
      px(x + 3, y - 3, 1, 1, '#ffffff');
      px(x - 3, y + 3, 1, 1, '#ffffff');
      px(x + 3, y + 3, 1, 1, '#ffffff');
      px(x - 1, y - 2, 3, 5, '#f5b94a');
      px(x - 2, y - 1, 5, 3, '#f5b94a');
      px(x - 1, y - 1, 2, 2, '#ffe08a');
    }

    for (const h of hearts) drawHeart(h.x, h.y);

    // Glass: murk + dirt spots + a highlight stripe
    if (s.dirt > 0.05) {
      ctx.fillStyle = `rgba(120,150,90,${s.dirt * 0.16})`;
      ctx.fillRect(0, 0, W, H);
    }
    for (const sp of spots) {
      const c = sp.c ? 'rgba(111,150,90,0.75)' : 'rgba(150,140,90,0.7)';
      px(sp.x, sp.y, sp.r + 1, sp.r, c);
      if (sp.r > 1) px(sp.x + 1, sp.y - 1, 1, 1, c);
    }
    px(3, 4, 2, H - 30, 'rgba(255,255,255,0.25)');
    px(6, 4, 1, H - 50, 'rgba(255,255,255,0.18)');

    // Sponge follows your finger while cleaning
    if (mode === 'clean' && pointer) {
      ctx.drawImage(sprite('sponge'), Math.round(pointer.x - 8), Math.round(pointer.y - 8));
    }
  }

  function loop() {
    update();
    draw();
    raf = requestAnimationFrame(loop);
  }

  // --- UI rendering ---
  function renderHeader() {
    fishNum.textContent = `${s.residents.length}/${capacity(s)}`;
  }

  function renderMeters() {
    const n = s.residents.length || 1;
    const food = s.residents.reduce((a, f) => a + f.hunger, 0) / n;
    const happy = s.residents.reduce((a, f) => a + happiness(s, f), 0) / n;
    mFood.fill.style.width = food + '%';
    mClean.fill.style.width = (1 - s.dirt) * 100 + '%';
    mHappy.fill.style.width = happy + '%';
    mFood.fill.classList.toggle('low', food < 30);
    mClean.fill.classList.toggle('low', s.dirt > 0.7);
    mHappy.fill.classList.toggle('low', happy < 40);
  }

  function heartsRow(value) {
    const full = Math.round(value / 20);
    return el(
      'div',
      { class: 'hearts' },
      Array.from({ length: 5 }, (_, i) => icon('heart', 16, i < full ? '' : 'empty')),
    );
  }

  const timeLeft = (ms) => {
    const m = Math.max(1, Math.round(ms / 60000));
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  };

  function renderInfo() {
    if (mode === 'feed') {
      info.replaceChildren(
        el('div', { class: 'info-icon' }, icon('fishfood', 40)),
        el(
          'div',
          { class: 'info-text' },
          el('div', { class: 'info-name' }, 'Feeding time!'),
          el('div', { class: 'info-sub' }, 'Tap the water to sprinkle food. Too much makes the tank dirty.'),
        ),
        el('button', { class: 'px-btn', onclick: () => setMode('look') }, 'Done'),
      );
      return;
    }
    if (mode === 'clean') {
      info.replaceChildren(
        el('div', { class: 'info-icon' }, icon('sponge', 40)),
        el(
          'div',
          { class: 'info-text' },
          el('div', { class: 'info-name' }, 'Scrub scrub!'),
          el('div', { class: 'info-sub' }, 'Rub the glass with your finger to wipe away the gunk.'),
        ),
        el('button', { class: 'px-btn', onclick: () => setMode('look') }, 'Done'),
      );
      return;
    }
    const f = swimmers.find((x) => x.ref.id === selectedId);
    if (!f) {
      selectedId = null;
      const v = s.visitors.length;
      info.replaceChildren(
        el(
          'div',
          { class: 'info-hint' },
          v
            ? `${v === 1 ? 'A visitor is' : 'Visitors are'} here! Tap the sparkly fish to say hi.`
            : 'Tap a fish to pet it. Feed and clean to keep everyone happy. Pop coin bubbles!',
        ),
      );
      return;
    }
    const sp = f.spec;
    const rarity = RARITY[sp.rarity];
    if (f.visitor) {
      const v = f.ref;
      const price = rarity.adopt;
      const full = s.residents.length >= capacity(s);
      info.replaceChildren(
        el('div', { class: 'info-icon' }, icon(sp.sprite, 40)),
        el(
          'div',
          { class: 'info-text' },
          el('div', { class: 'info-name' }, sp.name),
          el(
            'div',
            { class: 'info-sub' },
            `${stars(sp.rarity)} ${rarity.name} visitor · leaves in ${timeLeft(v.until - Date.now())}`,
          ),
        ),
        el(
          'div',
          { class: 'info-btns' },
          v.greeted ? null : el('button', { class: 'px-btn pink small', onclick: () => greet(f) }, 'Say hi!'),
          el(
            'button',
            { class: 'px-btn small', disabled: full ? '' : null, onclick: () => adopt(f) },
            full ? 'Tank full' : el('span', { class: 'btn-row' }, 'Adopt ', icon('coin', 14), String(price)),
          ),
        ),
      );
      return;
    }
    const r = f.ref;
    info.replaceChildren(
      el('div', { class: 'info-icon' }, icon(sp.sprite, 40)),
      el(
        'div',
        { class: 'info-text' },
        el('div', { class: 'info-name' }, r.name),
        el('div', { class: 'info-sub' }, `${sp.name} · ${stars(sp.rarity)}`),
        el('div', { class: 'stat-row' }, el('span', {}, 'Happy'), heartsRow(happiness(s, r))),
        el('div', { class: 'stat-row' }, el('span', {}, 'Full'), heartsRow(r.hunger)),
      ),
      el(
        'div',
        { class: 'info-btns' },
        el('button', { class: 'px-btn pink small', onclick: () => pet(f) }, 'Pet ♡'),
        el('button', { class: 'px-btn ghost small', onclick: () => release(f) }, 'Let go'),
      ),
    );
  }

  function setMode(m) {
    mode = m;
    feedBtn.classList.toggle('active', m === 'feed');
    cleanBtn.classList.toggle('active', m === 'clean');
    canvas.classList.toggle('cleaning', m === 'clean');
    if (m !== 'look') selectedId = null;
    sfx.tap();
    renderInfo();
  }

  // --- Actions ---
  function pet(f) {
    const now = performance.now();
    if (now - f.petAt < 350) return;
    f.petAt = now;
    if (!f.visitor) f.ref.love = Math.min(100, f.ref.love + 8);
    f.wiggle = 16;
    for (let i = 0; i < 2; i++) hearts.push({ x: f.x - 3 + rand(-4, 4), y: f.y - 12 - i * 4, life: 50 });
    sfx.pet();
    haptic(1);
    renderInfo();
    renderMeters();
    save.persist();
  }

  function discoverSpecies(sp) {
    if (s.seen[sp.id]) return;
    s.seen[sp.id] = true;
    const bonus = sp.rarity * 10;
    save.addCoins(bonus);
    setTimeout(() => sfx.discover(), 200);
    toast(`New fish: ${sp.name}! +${bonus}`, sp.sprite);
  }

  function greet(f) {
    const v = f.ref;
    if (v.greeted) return;
    v.greeted = true;
    const gift = RARITY[f.spec.rarity].gift + Math.floor(rand(0, 5));
    save.addCoins(gift);
    pet(f);
    sfx.coin();
    haptic(2);
    const [x, y] = toScreen(f.x, f.y);
    floatText(x, y - 20, `+${gift}`, { iconName: 'coin' });
    flyCoins({ left: x - 10, top: y - 10, width: 20, height: 20 }, 4);
    toast(`${f.spec.name} left you a gift!`, f.spec.sprite);
    renderInfo();
    save.persist();
  }

  async function adopt(f) {
    const v = f.ref;
    const sp = f.spec;
    const price = RARITY[sp.rarity].adopt;
    if (s.residents.length >= capacity(s)) {
      toast('Your tank is full! Upgrade it in Decor.', 'decor');
      return;
    }
    if (save.coins < price) {
      sfx.error();
      haptic(2);
      toast(`You need ${price} coins`, 'coin');
      return;
    }
    const ok = await confirmBox(
      `Adopt this ${sp.name}?`,
      `It will live in your tank and earn you coins.`,
      `Adopt (${price})`,
      'Not yet',
    );
    if (!ok || !s.visitors.includes(v)) return;
    if (!save.spend(price)) return;
    s.visitors = s.visitors.filter((x) => x !== v);
    const resident = { id: v.id, sp: sp.id, name: freshName(s), hunger: 70, love: 40 };
    s.residents.push(resident);
    s.adopted[sp.id] = (s.adopted[sp.id] || 0) + 1;
    syncSwimmers();
    selectedId = resident.id;
    sfx.levelup();
    haptic(3);
    const [x, y] = toScreen(f.x, f.y);
    burst(x, y, { count: 18, spread: 70, stars: 4 });
    toast(`Welcome home, ${resident.name}!`, sp.sprite);
    renderAll();
    save.persist();
  }

  async function release(f) {
    const ok = await confirmBox(`Let ${f.ref.name} go?`, `${f.ref.name} will swim back to the sea.`, 'Let go', 'Keep');
    if (!ok) return;
    s.residents = s.residents.filter((r) => r !== f.ref);
    const [x, y] = toScreen(f.x, f.y);
    burst(x, y, { count: 10, spread: 40, stars: 1, colors: ['#ffffff', '#cdeaf7', '#aee0d1'] });
    sfx.close();
    selectedId = null;
    syncSwimmers();
    renderAll();
    save.persist();
  }

  function sprinkle(x, y) {
    for (let i = 0; i < 4; i++) {
      flakes.push({
        x: clamp(x + rand(-5, 5), 4, W - 4),
        y: Math.min(y, 20) + rand(-3, 3),
        seed: rand(0, 6),
        settled: 0,
        c: pick(['#e7ae6e', '#f39a5b', '#c47f4f', '#e8606f']),
      });
    }
    sfx.sprinkle();
    haptic(1);
  }

  let lastSqueak = 0;
  function wipe(x, y) {
    const before = spots.length;
    spots = spots.filter((sp) => Math.hypot(sp.x - x, sp.y - y) > 9);
    if (spots.length === before) return;
    s.dirt = spots.length / MAX_SPOTS;
    const now = performance.now();
    if (now - lastSqueak > 90) {
      sfx.squeak();
      haptic(1);
      lastSqueak = now;
    }
    if (Math.random() < 0.5) bubbles.push({ x, y, r: 2, vy: 0.3 });
    renderMeters();
    if (!spots.length) {
      s.dirt = 0;
      const [sx, sy] = center(canvas);
      burst(sx, sy, { count: 20, spread: 120, stars: 5, colors: ['#ffffff', '#cdeaf7', '#aee0d1', '#ffe08a'] });
      sfx.discover();
      haptic(3);
      toast('Sparkling clean!', 'sparkle');
      setMode('look');
    }
    save.persist();
  }

  function collectCoins() {
    const list = coinBubbles();
    if (!list.length || pops.length) return;
    const total = list.length * COIN_BUBBLE;
    list.forEach((cb, n) => {
      setTimeout(() => {
        pops.push(cb.i);
        sfx.bubble();
        haptic(1);
        const [x, y] = toScreen(cb.x, cb.y);
        burst(x, y, { count: 6, spread: 24, stars: 0, size: 4, colors: ['#ffffff', '#ffe08a', '#cdeaf7'] });
      }, n * 70);
    });
    setTimeout(
      () => {
        s.bank -= total;
        pops = [];
        save.addCoins(total);
        sfx.coin();
        const [x, y] = toScreen(W / 2, 20);
        floatText(x, y, `+${total}`, { iconName: 'coin' });
        flyCoins(canvas.getBoundingClientRect(), Math.min(8, list.length + 2));
        save.persist();
      },
      list.length * 70 + 60,
    );
  }

  // --- Input on the tank ---
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = toTank(e);
    pointer = { x, y, down: true };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    if (mode === 'clean') {
      wipe(x, y);
      return;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = toTank(e);
    if (!pointer) pointer = { x, y, down: false };
    pointer.x = x;
    pointer.y = y;
    if (mode === 'clean' && pointer.down) wipe(x, y);
  });

  canvas.addEventListener('pointerup', (e) => {
    const [x, y] = toTank(e);
    const wasDown = pointer?.down;
    pointer = mode === 'clean' ? { x, y, down: false } : null;
    if (!wasDown || mode === 'clean') return;
    if (mode === 'feed') {
      sprinkle(x, y);
      return;
    }
    // Coin bubbles first (they're on top)
    if (coinBubbles().some((cb) => Math.hypot(cb.x - x, cb.y - y) < 8)) {
      collectCoins();
      return;
    }
    // Nearest fish under the finger
    let best = null;
    let bestD = 11;
    for (const f of swimmers) {
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    if (best) {
      selectedId = best.ref.id;
      if (best.visitor) {
        discoverSpecies(best.spec);
        best.wiggle = 10;
        sfx.tap();
        haptic(1);
        renderInfo();
      } else pet(best);
      return;
    }
    selectedId = null;
    bubbles.push({ x, y, r: 2, vy: 0.4 }, { x: x + 2, y: y + 2, r: 1, vy: 0.5 });
    sfx.bubble();
    renderInfo();
  });

  canvas.addEventListener('pointercancel', () => (pointer = null));
  canvas.addEventListener('pointerleave', () => {
    if (pointer && !pointer.down) pointer = null;
  });

  // --- Sheets ---
  function openDecor() {
    sfx.open();
    sheet(
      'Decor',
      (refresh) => {
        const used = placedIds(s).length;
        const next = TANK_SIZES[s.tank + 1];
        const rows = [
          el(
            'div',
            { class: 'shop-row tank-row' },
            el('div', { class: 'shop-icon' }, icon('f_goldfish', 36)),
            el(
              'div',
              { class: 'shop-text' },
              el('div', { class: 'shop-name' }, `Tank holds ${capacity(s)} fish`),
              el('div', { class: 'shop-sub' }, next ? `Upgrade to fit ${next.cap}` : 'Biggest tank!'),
            ),
            next
              ? el(
                  'button',
                  {
                    class: 'px-btn small',
                    onclick: () => {
                      if (!save.spend(next.price)) {
                        sfx.error();
                        toast(`You need ${next.price} coins`, 'coin');
                        return;
                      }
                      s.tank++;
                      sfx.levelup();
                      haptic(3);
                      renderAll();
                      refresh();
                      save.persist();
                    },
                  },
                  el('span', { class: 'btn-row' }, icon('coin', 14), String(next.price)),
                )
              : null,
          ),
          el(
            'div',
            { class: 'shop-note' },
            `${used}/${DECOR_SLOTS} spots used · fish visit when they see things they like`,
          ),
        ];
        for (const d of DECOR) {
          const owned = s.owned.includes(d.id);
          const slot = s.placed.indexOf(d.id);
          const fans = SPECIES.filter((sp) => sp.likes === d.id);
          let btn;
          if (!owned) {
            btn = el(
              'button',
              {
                class: 'px-btn small',
                onclick: () => {
                  if (!save.spend(d.price)) {
                    sfx.error();
                    haptic(2);
                    toast(`You need ${d.price} coins`, 'coin');
                    return;
                  }
                  s.owned.push(d.id);
                  const free = s.placed.indexOf(null);
                  if (free >= 0) s.placed[free] = d.id;
                  sfx.coin();
                  haptic(2);
                  renderAll();
                  refresh();
                  save.persist();
                },
              },
              el('span', { class: 'btn-row' }, icon('coin', 14), String(d.price)),
            );
          } else if (slot >= 0) {
            btn = el(
              'button',
              {
                class: 'px-btn ghost small',
                onclick: () => {
                  s.placed[slot] = null;
                  sfx.close();
                  renderAll();
                  refresh();
                  save.persist();
                },
              },
              'Remove',
            );
          } else {
            btn = el(
              'button',
              {
                class: 'px-btn pink small',
                onclick: () => {
                  const free = s.placed.indexOf(null);
                  if (free < 0) {
                    sfx.error();
                    toast('No space left! Remove something first.');
                    return;
                  }
                  s.placed[free] = d.id;
                  sfx.pop();
                  haptic(1);
                  renderAll();
                  refresh();
                  save.persist();
                },
              },
              'Place',
            );
          }
          rows.push(
            el(
              'div',
              { class: 'shop-row' + (slot >= 0 ? ' placed' : '') },
              el('div', { class: 'shop-icon' }, icon(d.sprite, 40)),
              el(
                'div',
                { class: 'shop-text' },
                el('div', { class: 'shop-name' }, d.name),
                el(
                  'div',
                  { class: 'shop-sub fans' },
                  'Liked by ',
                  fans.map((sp) => icon(sp.sprite, 20, s.seen[sp.id] ? '' : 'silhouette')),
                ),
              ),
              btn,
            ),
          );
        }
        return rows;
      },
      () => sfx.close(),
    );
  }

  function openDex() {
    sfx.open();
    sheet(
      'Fishdex',
      () => {
        const seen = SPECIES.filter((sp) => s.seen[sp.id]).length;
        return [
          el('div', { class: 'shop-note' }, `${seen}/${SPECIES.length} fish discovered`),
          el(
            'div',
            { class: 'dex' },
            SPECIES.map((sp) => {
              const known = s.seen[sp.id];
              const home = s.residents.filter((r) => r.sp === sp.id).length;
              return el(
                'div',
                { class: 'dex-card' + (known ? '' : ' unknown') },
                icon(sp.sprite, 48, known ? '' : 'silhouette'),
                el('div', { class: 'dex-name' }, known ? sp.name : '???'),
                el('div', { class: 'dex-stars' }, stars(sp.rarity)),
                el(
                  'div',
                  { class: 'dex-likes' },
                  known
                    ? ['Likes ', icon(DECOR_BY_ID[sp.likes].sprite, 16)]
                    : sp.rarity >= 3
                      ? 'Rare: needs a special decoration'
                      : 'Not seen yet',
                ),
                home ? el('div', { class: 'dex-home' }, `${home} in tank`) : null,
              );
            }),
          ),
        ];
      },
      () => sfx.close(),
    );
  }

  // --- Events from the clock (visitors) ---
  function handleEvents(events, quiet = false) {
    let arrived = 0;
    for (const ev of events) {
      if (ev.type === 'visit') arrived++;
      if (ev.type === 'leave' && ev.v.id === selectedId) selectedId = null;
    }
    syncSwimmers();
    if (arrived && !quiet) {
      const v = events.filter((e) => e.type === 'visit').pop().v;
      sfx.visitor();
      haptic(2);
      toast(`A ${SPECIES_BY_ID[v.sp].name} came to visit!`, SPECIES_BY_ID[v.sp].sprite);
    }
    if (events.length) renderAll();
  }

  function renderAll() {
    renderHeader();
    renderMeters();
    renderInfo();
  }

  const clock = setInterval(() => {
    handleEvents(simulate(s, Date.now()));
    syncSpots();
    renderMeters();
    if (selectedId) renderInfo();
    save.persist();
  }, 4000);

  const onVisible = () => {
    if (document.visibilityState === 'visible') handleEvents(simulate(s, Date.now()));
  };
  document.addEventListener('visibilitychange', onVisible);

  // --- Start ---
  layout();
  syncSpots();
  syncSwimmers();
  handleEvents(startEvents, true);
  if (s.visitors.length && startEvents.some((e) => e.type === 'visit')) {
    setTimeout(() => toast(`You have ${s.visitors.length === 1 ? 'a visitor' : 'visitors'}!`, 'sparkle'), 400);
  }
  renderAll();
  save.persist();
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(clock);
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisible);
    document.querySelectorAll('.sheet-shade').forEach((n) => n.remove());
    save.flush();
  };
}
