// Pixel Town: make little residents, and watch them live. They wander between the park,
// café, shop and beach (on a real day/night clock), chat, make friends, argue, fall in love,
// and ask you for help. Time passes while the app is closed.
import { save } from '../../state.js';
import { el, icon, toast, confirmBox, burst, floatText, sheet } from '../../ui.js';
import { sfx } from '../../audio.js';
import { haptic } from '../../haptics.js';
import { SPRITES } from '../../sprites.js';
import { spriteCanvas } from '../../pixel.js';
import {
  SKINS,
  HAIR_COLORS,
  CLOTHES_COLORS,
  PANTS_COLORS,
  HAIRS,
  EYES,
  MOUTHS,
  OUTFITS,
  avatarCanvas,
  avatarURL,
  randomLook,
} from './avatar.js';
import {
  MAX_RESIDENTS,
  TICK_MS,
  MAX_CATCHUP_TICKS,
  PERSONALITIES,
  PERSONALITY_IDS,
  compatibility,
  FOODS,
  FOOD_BY_ID,
  PLACES,
  CROSSROAD,
  TOPICS,
  SILLY,
  relationLabel,
  BORED_ACTIVITIES,
  xpForLevel,
} from './data.js';

const W = 128;
const H = 144;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sprite = (name) => spriteCanvas(name, SPRITES[name]);
const NAMES = [
  'Mochi',
  'Pip',
  'Juniper',
  'Bean',
  'Coco',
  'Taro',
  'Lulu',
  'Fig',
  'Sunny',
  'Nori',
  'Peach',
  'Maple',
  'Biscuit',
  'Clover',
  'Remy',
  'Kiki',
  'Otto',
  'Poppy',
];

export const isNight = (t) => {
  const h = new Date(t).getHours();
  return h >= 22 || h < 7;
};
const isEvening = (t) => {
  const h = new Date(t).getHours();
  return h >= 18 && h < 22;
};
const relKey = (a, b) => [a, b].sort().join('|');

// ---------- Town simulation (pure-ish: works on the save object) ----------

function newState() {
  return { residents: [], rel: {}, news: [], unread: 0, inventory: {}, lastTick: Date.now(), nextId: 1 };
}

function getRel(s, a, b) {
  const k = relKey(a.id, b.id);
  if (!s.rel[k]) s.rel[k] = { a: 0, status: null };
  return s.rel[k];
}

function addNews(s, text, ids, iconName, t = Date.now()) {
  s.news.unshift({ t, text, ids, icon: iconName });
  if (s.news.length > 40) s.news.length = 40;
  s.unread = Math.min(99, (s.unread || 0) + 1);
}

function makeRequest(s, r) {
  const others = s.residents.filter((o) => o !== r);
  const roll = Math.random();
  if (r.hunger < 45 || roll < 0.3) return { type: 'hungry', food: Math.random() < 0.5 ? r.food : pick(FOODS).id };
  if (roll < 0.5) return { type: 'bored' };
  if (roll < 0.7 && others.length >= 2) {
    const strangers = others.filter((o) => getRel(s, r, o).a < 10);
    if (strangers.length) return { type: 'lonely' };
  }
  if (roll < 0.85) return { type: 'outfit' };
  return { type: 'bored' };
}

function interact(s, a, b, place, t, events) {
  const rel = getRel(s, a, b);
  const comp = compatibility(a.personality, b.personality);
  const where = PLACES[place]?.name || 'town';
  let delta;
  let text;
  let iconName;
  const couple = rel.status === 'dating' || rel.status === 'married';
  const pArgue = 0.045 + (rel.a < 0 ? 0.12 : 0) + (comp < 0 ? 0.06 : 0) - (rel.a > 50 ? 0.04 : 0) - (couple ? 0.04 : 0);
  if (couple && Math.random() < 0.5) {
    delta = 5;
    text = `${a.name} and ${b.name} went on a date at ${where} 💕`;
    iconName = 'heart';
  } else if (Math.random() < pArgue) {
    delta = -8;
    text = `${a.name} and ${b.name} argued about ${pick(SILLY)}.`;
    iconName = 'angry';
    const upset = Math.random() < 0.5 ? a : b;
    const other = upset === a ? b : a;
    if (!upset.request && Math.random() < 0.5) upset.request = { type: 'fight', with: other.id };
  } else if (place === 'cafe' && Math.random() < 0.5) {
    const food = pick(FOODS);
    delta = 6;
    text = `${a.name} treated ${b.name} to ${food.name.toLowerCase()} at the café.`;
    iconName = 'food';
  } else if ((place === 'park' || place === 'beach') && Math.random() < 0.5) {
    delta = 5;
    text = `${a.name} and ${b.name} played ${pick(['tag', 'catch', 'hide and seek', 'leapfrog'])} at ${where}!`;
    iconName = 'note';
  } else if (Math.random() < 0.3) {
    delta = 4;
    text = `${a.name} complimented ${b.name}'s outfit.`;
    iconName = 'sparkle';
  } else {
    delta = 3 + Math.floor(Math.random() * 3);
    text = `${a.name} and ${b.name} chatted about ${pick(TOPICS)} at ${where}.`;
    iconName = 'chat';
  }
  delta += Math.round(comp * 20);
  rel.a = clamp(rel.a + delta, -100, 100);
  rel.met = true;
  if (delta > 0) {
    a.happy = Math.min(100, a.happy + 2);
    b.happy = Math.min(100, b.happy + 2);
  } else {
    a.happy = Math.max(0, a.happy - 3);
    b.happy = Math.max(0, b.happy - 3);
  }
  addNews(s, text, [a.id, b.id], iconName === 'chat' ? 'heart' : iconName, t);
  events.push({ kind: 'talk', ids: [a.id, b.id], icon: iconName });

  // Romance: residents ask you for advice
  if (!rel.status && rel.a >= 65 && Math.random() < 0.3 && !a.request && !a.partner && !b.partner) {
    a.request = { type: 'confess', with: b.id };
  } else if (rel.status === 'dating' && rel.a >= 90 && Math.random() < 0.15 && !a.request) {
    a.request = { type: 'propose', with: b.id };
  }
}

// One "minute" in town. Returns events for animations (talking bubbles, etc).
function tick(s, t) {
  const night = isNight(t);
  const events = [];
  for (const r of s.residents) {
    r.hunger = Math.max(0, r.hunger - 1.2);
    if (r.hunger < 25) r.happy = Math.max(0, r.happy - 2);
    r.visit = null;
    if (night) {
      r.place = 'home';
      continue;
    }
    if (r.hunger < 20 && Math.random() < 0.6) {
      r.place = 'cafe';
      r.hunger = Math.min(100, r.hunger + 35);
      continue;
    }
    const P = PERSONALITIES[r.personality];
    if (Math.random() < 0.28) {
      r.place = 'home';
      // sometimes pop round to a good friend's place
      const friends = s.residents.filter((o) => o !== r && getRel(s, r, o).a > 40);
      if (friends.length && Math.random() < 0.25) r.visit = pick(friends).id;
    } else {
      r.place = pick(
        P.likes
          .filter((p) => p !== 'home')
          .concat(['park', 'cafe', 'beach', 'shop'])
          .slice(0, 5),
      );
    }
  }
  if (!night) {
    // People in the same place may interact
    const groups = {};
    for (const r of s.residents) {
      const key = r.visit ? 'visit:' + r.visit : r.place === 'home' ? null : r.place;
      if (key) (groups[key] ||= []).push(r);
    }
    for (const r of s.residents) {
      if (r.place === 'home' && !r.visit) {
        const guests = s.residents.filter((o) => o.visit === r.id);
        if (guests.length) groups['visit:' + r.id].push(r);
      }
    }
    for (const [key, members] of Object.entries(groups)) {
      if (members.length < 2) continue;
      const place = key.startsWith('visit:') ? 'home' : key;
      const pairs = Math.min(2, Math.floor(members.length / 2));
      const shuffled = [...members].sort(() => Math.random() - 0.5);
      for (let i = 0; i < pairs; i++) {
        const [a, b] = [shuffled[i * 2], shuffled[i * 2 + 1]];
        const social = (PERSONALITIES[a.personality].social + PERSONALITIES[b.personality].social) / 2;
        if (Math.random() < 0.35 + social * 0.5) interact(s, a, b, place, t, events);
      }
    }
    for (const r of s.residents) {
      if (!r.request && Math.random() < 0.022) r.request = makeRequest(s, r);
    }
  }
  return events;
}

function catchUp(s, now) {
  let n = Math.floor((now - s.lastTick) / TICK_MS);
  if (n <= 0) return 0;
  n = Math.min(n, MAX_CATCHUP_TICKS);
  const before = s.news.length ? s.news[0].t : 0;
  for (let i = n; i >= 1; i--) tick(s, now - i * TICK_MS);
  s.lastTick = now;
  return s.news.filter((x) => x.t > before).length;
}

function validState(s) {
  return s && Array.isArray(s.residents) && typeof s.rel === 'object';
}

// ---------- Screen ----------

export function mount(root, { headerSlot }) {
  let s = save.game('town', newState);
  if (!validState(s)) {
    save.resetGame('town');
    s = save.game('town', newState);
  }
  const awayNews = s.residents.length ? catchUp(s, Date.now()) : 0;
  s.lastTick = Math.max(s.lastTick, Date.now() - TICK_MS);

  let cleanupView = null;
  const clockPill = el('div', { class: 'pill' }, el('span', { class: 'pill-num' }));
  headerSlot.append(clockPill);
  const view = el('div', { class: 'town' });
  root.append(view);

  const byId = (id) => s.residents.find((r) => r.id === id);

  function updateClock() {
    const d = new Date();
    const night = isNight(d);
    clockPill.querySelector('.pill-num').textContent =
      `${night ? '☾' : '☀'} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  updateClock();

  // ======================= TOWN MAP =======================
  function showTown() {
    cleanupView?.();
    let raf = 0;
    let k = 3;
    let time = 0;
    let selected = null;
    const walkers = new Map(); // resident id -> {x,y,path,frame,inside}
    const bubbles = []; // {id, icon, life}

    const canvas = el('canvas', { class: 'tank-canvas town-canvas' });
    const ctx = canvas.getContext('2d');
    const wrap = el('div', { class: 'tank-wrap' }, el('div', { class: 'tank-frame town-frame' }, canvas));
    const newsBadge = el('span', { class: 'badge-count' });
    const tools = el(
      'div',
      { class: 'tools' },
      el(
        'button',
        { class: 'tool px-btn ghost', onclick: () => newResident() },
        icon('heart', 28),
        el('span', {}, 'New'),
      ),
      el(
        'button',
        { class: 'tool px-btn ghost', onclick: () => openPeople() },
        icon('house', 28),
        el('span', {}, 'People'),
      ),
      el(
        'button',
        { class: 'tool px-btn ghost', onclick: () => openNews() },
        icon('book', 28),
        el('span', {}, 'News'),
        newsBadge,
      ),
      el(
        'button',
        { class: 'tool px-btn ghost', onclick: () => openShop() },
        icon('c_register', 28),
        el('span', {}, 'Shop'),
      ),
    );
    const info = el('div', { class: 'info aq-info px-box' });
    view.replaceChildren(el('div', { class: 'aquarium town-main' }, wrap, tools, info));

    function renderBadge() {
      newsBadge.textContent = s.unread ? String(s.unread) : '';
      newsBadge.style.display = s.unread ? '' : 'none';
    }

    // --- Background map ---
    let bg = null;
    function buildBg() {
      bg = document.createElement('canvas');
      bg.width = W;
      bg.height = H;
      const g = bg.getContext('2d');
      const r = (x, y, w, h, c) => {
        g.fillStyle = c;
        g.fillRect(x, y, w, h);
      };
      r(0, 0, W, H, '#b3de95');
      for (let i = 0; i < 160; i++) {
        const x = Math.floor(Math.random() * W);
        const y = Math.floor(Math.random() * H);
        r(x, y, 1, 1, pick(['#9fd082', '#9fd082', '#c7e8ae', '#fad0d8', '#ffe08a', '#ffffff']));
      }
      // roads
      r(0, 64, W, 10, '#efd3a8');
      r(58, 0, 12, 124, '#efd3a8');
      r(0, 64, W, 1, '#e0bf8c');
      r(0, 73, W, 1, '#e0bf8c');
      r(58, 0, 1, 64, '#e0bf8c');
      r(69, 0, 1, 64, '#e0bf8c');
      r(58, 74, 1, 50, '#e0bf8c');
      r(69, 74, 1, 50, '#e0bf8c');
      // Apartments
      r(3, 1, 50, 62, '#6b4a4a');
      r(4, 6, 48, 56, '#fbefd9');
      r(4, 2, 48, 5, '#f19bb0');
      for (let x = 6; x < 52; x += 4) r(x, 2, 2, 5, '#fad0d8');
      r(23, 52, 10, 10, '#6b4a4a');
      r(24, 53, 8, 9, '#c47f4f');
      r(30, 57, 1, 1, '#ffe08a');
      // Café
      r(73, 17, 50, 33, '#6b4a4a');
      r(74, 24, 48, 25, '#aee0d1');
      for (let x = 74; x < 122; x += 6) {
        r(x, 18, 3, 7, '#f19bb0');
        r(x + 3, 18, 3, 7, '#fffaf3');
      }
      r(78, 29, 14, 10, '#6b4a4a');
      r(79, 30, 12, 8, '#d3ecf7');
      r(104, 29, 14, 10, '#6b4a4a');
      r(105, 30, 12, 8, '#d3ecf7');
      r(94, 38, 8, 11, '#6b4a4a');
      r(95, 39, 6, 10, '#c47f4f');
      r(86, 10, 24, 8, '#6b4a4a');
      r(87, 11, 22, 6, '#fffaf3');
      g.drawImage(sprite('cafecup'), 90, 3);
      // Park
      r(4, 78, 50, 42, '#a7d68a');
      r(22, 92, 18, 12, '#6b4a4a');
      r(23, 93, 16, 10, '#86bfe0');
      r(29, 89, 4, 6, '#d3ecf7');
      for (const [tx, ty] of [
        [8, 80],
        [40, 106],
      ]) {
        r(tx + 4, ty + 10, 3, 6, '#8f5a3c');
        r(tx, ty, 11, 11, '#6b4a4a');
        r(tx + 1, ty + 1, 9, 9, '#6fae6a');
        r(tx + 2, ty + 2, 3, 2, '#9fd082');
      }
      r(6, 110, 14, 3, '#8f5a3c');
      r(7, 113, 1, 3, '#8f5a3c');
      r(18, 113, 1, 3, '#8f5a3c');
      // Shop
      r(75, 84, 46, 26, '#6b4a4a');
      r(76, 90, 44, 19, '#d7c6f2');
      for (let x = 76; x < 120; x += 6) {
        r(x, 85, 3, 6, '#aee0d1');
        r(x + 3, 85, 3, 6, '#fffaf3');
      }
      r(80, 94, 12, 8, '#6b4a4a');
      r(81, 95, 10, 6, '#fffaf3');
      g.drawImage(sprite('cherry'), 79, 90);
      r(95, 98, 8, 11, '#6b4a4a');
      r(96, 99, 6, 10, '#c47f4f');
      // Beach
      r(0, 124, W, 20, '#f3e2bf');
      r(0, 124, W, 1, '#e6cc9c');
      for (let i = 0; i < 30; i++)
        r(Math.floor(Math.random() * W), 126 + Math.floor(Math.random() * 10), 1, 1, '#e6cc9c');
      r(0, 138, W, 6, '#86bfe0');
      // umbrella
      r(104, 126, 1, 10, '#8f5a3c');
      r(98, 124, 13, 3, '#f19bb0');
      r(100, 123, 9, 1, '#f19bb0');
    }

    // --- Layout ---
    function layout() {
      const r = wrap.getBoundingClientRect();
      const cssScale = Math.min((r.width - 12) / W, (r.height - 12) / H);
      const dpr = window.devicePixelRatio || 1;
      const nk = Math.max(1, Math.floor(cssScale * dpr));
      if (nk === k && canvas.width === W * k) return;
      k = nk;
      canvas.width = W * k;
      canvas.height = H * k;
      canvas.style.width = (W * k) / dpr + 'px';
      canvas.style.height = (H * k) / dpr + 'px';
      ctx.imageSmoothingEnabled = false;
    }
    const ro = new ResizeObserver(layout);
    ro.observe(wrap);

    // --- Walkers ---
    const SPREAD = [
      [0, 0],
      [-14, 3],
      [14, 3],
      [-7, 9],
      [7, 9],
      [-20, 9],
      [20, 9],
      [0, 14],
    ];
    function targetFor(r) {
      if (r.place === 'home') return { ...PLACES.home, inside: true };
      const here = s.residents.filter((o) => o.place === r.place && !(o.place === 'home'));
      const i = Math.max(0, here.indexOf(r));
      const [dx, dy] = SPREAD[i % SPREAD.length];
      return { x: PLACES[r.place].x + dx, y: PLACES[r.place].y + dy, inside: false };
    }
    function syncWalkers(instant = false) {
      for (const r of s.residents) {
        const tgt = targetFor(r);
        let w = walkers.get(r.id);
        if (!w || instant) {
          w = { x: tgt.x, y: tgt.y, path: [], frame: 0, inside: tgt.inside };
          walkers.set(r.id, w);
          continue;
        }
        const last = w.path.length ? w.path[w.path.length - 1] : { x: w.x, y: w.y };
        if (Math.hypot(last.x - tgt.x, last.y - tgt.y) < 1) continue;
        if (w.inside) {
          w.inside = false;
          w.x = PLACES.home.x;
          w.y = PLACES.home.y;
        }
        const far = Math.abs(w.x - tgt.x) > 20 || Math.abs(w.y - tgt.y) > 20;
        w.path = far ? [{ ...CROSSROAD }, tgt] : [tgt];
        w.goingIn = tgt.inside;
      }
      for (const id of [...walkers.keys()]) if (!byId(id)) walkers.delete(id);
    }

    function updateWalkers() {
      for (const [, w] of walkers) {
        if (!w.path.length) continue;
        const p = w.path[0];
        const dx = p.x - w.x;
        const dy = p.y - w.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.6) {
          w.path.shift();
          if (!w.path.length && w.goingIn) w.inside = true;
          continue;
        }
        w.x += (dx / d) * Math.min(0.45, d);
        w.y += (dy / d) * Math.min(0.45, d);
        w.frame += 0.12;
      }
    }

    // --- Drawing ---
    const px = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };
    function drawIcon(kind, x, y) {
      x = Math.round(x);
      y = Math.round(y);
      px(x - 5, y - 5, 11, 10, '#6b4a4a');
      px(x - 4, y - 4, 9, 8, '#fffaf3');
      px(x, y + 5, 1, 2, '#6b4a4a');
      const c =
        {
          heart: '#f19bb0',
          note: '#9a7fd1',
          angry: '#e8606f',
          food: '#f39a5b',
          sparkle: '#f5b94a',
          chat: '#86bfe0',
          alert: '#f5b94a',
        }[kind] || '#f19bb0';
      if (kind === 'heart') {
        px(x - 2, y - 2, 2, 1, c);
        px(x + 1, y - 2, 2, 1, c);
        px(x - 3, y - 1, 7, 2, c);
        px(x - 2, y + 1, 5, 1, c);
        px(x - 1, y + 2, 3, 1, c);
      } else if (kind === 'angry') {
        px(x - 2, y - 2, 1, 2, c);
        px(x + 2, y - 2, 1, 2, c);
        px(x - 2, y + 1, 1, 2, c);
        px(x + 2, y + 1, 1, 2, c);
        px(x - 1, y, 3, 1, c);
      } else if (kind === 'note') {
        px(x, y - 3, 1, 5, c);
        px(x - 2, y + 1, 3, 2, c);
        px(x + 1, y - 3, 2, 1, c);
      } else if (kind === 'alert') {
        px(x, y - 3, 1, 4, '#e8606f');
        px(x, y + 2, 1, 1, '#e8606f');
      } else if (kind === 'chat') {
        px(x - 2, y, 1, 1, c);
        px(x, y, 1, 1, c);
        px(x + 2, y, 1, 1, c);
      } else {
        px(x - 1, y - 1, 3, 3, c);
      }
    }

    function windowPos(i) {
      return [8 + (i % 2) * 24, 10 + Math.floor(i / 2) * 11];
    }

    function draw() {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (!bg) buildBg();
      ctx.drawImage(bg, 0, 0);
      const now = Date.now();
      const night = isNight(now);
      // waves
      for (let x = (time >> 3) % 8; x < W; x += 8) px(x, 138 + ((x >> 3) % 2), 4, 1, '#d3ecf7');

      // apartment windows: faces of residents who are home
      for (let i = 0; i < MAX_RESIDENTS; i++) {
        const [wx, wy] = windowPos(i);
        const r = s.residents[i];
        const w = r && walkers.get(r.id);
        const home = r && w?.inside;
        px(wx - 1, wy - 1, 18, 10, '#6b4a4a');
        px(wx, wy, 16, 8, home && night ? '#ffe08a' : home ? '#fffaf3' : '#d3ecf7');
        if (home) {
          const expr = night
            ? { eyes: 'closed', mouth: 'tiny' }
            : r.happy < 30
              ? { eyes: 'sad', mouth: 'frown' }
              : null;
          ctx.drawImage(avatarCanvas(r.look, { expr }), 0, 3, 16, 8, wx, wy, 16, 8);
          if (night && time % 120 < 80) {
            px(wx + 13, wy - 4, 3, 1, '#9a7fd1');
            px(wx + 15, wy - 3, 1, 1, '#9a7fd1');
            px(wx + 13, wy - 2, 3, 1, '#9a7fd1');
          }
        }
        px(wx + 7, wy, 1, 8, '#6b4a4a');
      }

      // residents outside, back to front
      const outside = s.residents
        .map((r) => [r, walkers.get(r.id)])
        .filter(([, w]) => w && !w.inside)
        .sort((a, b) => a[1].y - b[1].y);
      for (const [r, w] of outside) {
        const walking = w.path.length > 0;
        const frame = walking ? 1 + (Math.floor(w.frame) % 2) : 0;
        const expr = r.happy < 30 ? { eyes: 'sad', mouth: 'frown' } : null;
        const bob = walking && frame === 1 ? -1 : 0;
        ctx.drawImage(avatarCanvas(r.look, { frame, expr }), Math.round(w.x - 8), Math.round(w.y - 20 + bob));
        if (r.id === selected) {
          const ay = Math.round(w.y - 26 + Math.sin(time * 0.15) * 1.5);
          px(w.x - 2, ay, 5, 1, '#6b4a4a');
          px(w.x - 1, ay + 1, 3, 1, '#6b4a4a');
          px(w.x, ay + 2, 1, 1, '#6b4a4a');
        } else if (r.request) {
          drawIcon('alert', w.x + 6, w.y - 24 + Math.round(Math.sin(time * 0.1)));
        }
      }
      // interaction bubbles
      for (const b of bubbles) {
        const w = walkers.get(b.id);
        if (!w) continue;
        const [bx, by] = w.inside
          ? (() => {
              const i = s.residents.findIndex((r) => r.id === b.id);
              const [wx, wy] = windowPos(i);
              return [wx + 8, wy - 2];
            })()
          : [w.x, w.y - 26];
        drawIcon(b.icon, bx, by - (60 - b.life) * 0.1);
      }
      // time of day tint
      if (night) {
        ctx.fillStyle = 'rgba(46, 40, 96, 0.38)';
        ctx.fillRect(0, 0, W, H);
        // lit windows glow through the night
        for (let i = 0; i < s.residents.length; i++) {
          const r = s.residents[i];
          if (!walkers.get(r.id)?.inside) continue;
          const [wx, wy] = windowPos(i);
          ctx.fillStyle = 'rgba(255, 224, 138, 0.35)';
          ctx.fillRect(wx, wy, 16, 8);
        }
        for (const [x, y] of [
          [88, 31],
          [110, 31],
        ])
          px(x - 6, y - 1, 12, 8, 'rgba(255,224,138,0.3)');
      } else if (isEvening(now)) {
        ctx.fillStyle = 'rgba(243, 154, 91, 0.12)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    function loop() {
      time++;
      updateWalkers();
      for (const b of bubbles) b.life--;
      for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].life <= 0) bubbles.splice(i, 1);
      draw();
      raf = requestAnimationFrame(loop);
    }

    // --- Info panel ---
    function renderInfo() {
      const r = byId(selected);
      if (!r) {
        selected = null;
        const n = s.residents.length;
        const reqs = s.residents.filter((x) => x.request).length;
        const d = new Date();
        const part = isNight(d) ? 'Night' : isEvening(d) ? 'Evening' : d.getHours() < 12 ? 'Morning' : 'Afternoon';
        info.replaceChildren(
          el(
            'div',
            { class: 'info-hint' },
            n === 0
              ? 'Welcome to Pixel Town! Tap New to make your first resident.'
              : `${part} in Pixel Town · ${n} resident${n > 1 ? 's' : ''}. ` +
                  (reqs
                    ? `${reqs} need${reqs > 1 ? '' : 's'} your help (look for the !).`
                    : n < 2
                      ? 'Add a second resident so they can meet!'
                      : 'Tap someone to say hi!'),
          ),
        );
        return;
      }
      const req = r.request;
      const btns = [];
      let sub = `${PERSONALITIES[r.personality].name} · Lv ${r.level}`;
      let sub2 = moodText(r);
      if (req) {
        sub = requestText(r);
        sub2 = 'Tap Help to see what they need';
        btns.push(el('button', { class: 'px-btn small', onclick: () => handleRequest(r) }, 'Help'));
      } else {
        btns.push(el('button', { class: 'px-btn small', onclick: () => talk(r) }, 'Talk'));
      }
      btns.push(el('button', { class: 'px-btn ghost small', onclick: () => openResident(r) }, 'More'));
      info.replaceChildren(
        el(
          'div',
          { class: 'info-icon' },
          el('img', { class: 'px-icon', src: avatarURL(r.look, 3), width: 40, height: 50, alt: '' }),
        ),
        el(
          'div',
          { class: 'info-text' },
          el('div', { class: 'info-name' }, r.name),
          el('div', { class: 'info-sub' }, sub),
          el('div', { class: 'info-sub' }, sub2),
        ),
        el('div', { class: 'info-btns' }, btns),
      );
    }

    // --- Input ---
    const toMap = (e) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
    };
    canvas.addEventListener('pointerup', (e) => {
      const [x, y] = toMap(e);
      // residents outside
      let hit = null;
      let best = 14;
      for (const r of s.residents) {
        const w = walkers.get(r.id);
        if (!w || w.inside) continue;
        const d = Math.hypot(w.x - x, w.y - 10 - y);
        if (d < best) {
          best = d;
          hit = r;
        }
      }
      // apartment windows
      if (!hit) {
        for (let i = 0; i < s.residents.length; i++) {
          const [wx, wy] = windowPos(i);
          if (x >= wx - 2 && x <= wx + 18 && y >= wy - 2 && y <= wy + 10) hit = s.residents[i];
        }
      }
      if (hit) {
        selected = hit.id;
        sfx.tap();
        haptic(1);
        bubbles.push({ id: hit.id, icon: 'heart', life: 50 });
        renderInfo();
        return;
      }
      selected = null;
      // buildings
      if (x > 74 && x < 122 && y > 84 && y < 110) openShop();
      else if (x > 3 && x < 53 && y < 63) openPeople();
      else if (x > 73 && x < 123 && y > 10 && y < 50) toast('The café: residents grab snacks and chat here', 'cafecup');
      renderInfo();
    });

    // --- Clock ---
    function runTick() {
      const events = tick(s, Date.now());
      s.lastTick = Date.now();
      for (const ev of events) for (const id of ev.ids) bubbles.push({ id, icon: ev.icon, life: 90 });
      if (events.length) sfx.pop();
      syncWalkers();
      renderInfo();
      renderBadge();
      save.persist();
    }
    const tickTimer = setInterval(() => {
      updateClock();
      if (Date.now() - s.lastTick >= TICK_MS) runTick();
    }, 5000);
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const n = catchUp(s, Date.now());
      if (n) toast(`${n} things happened while you were away. Check the News!`, 'book');
      syncWalkers(true);
      renderInfo();
      renderBadge();
    };
    document.addEventListener('visibilitychange', onVis);

    // First visit: residents spread out right away so the town isn't empty
    if (s.residents.length && s.residents.every((r) => r.place === 'home') && !isNight(Date.now())) {
      runTick();
    }
    layout();
    syncWalkers(true);
    renderInfo();
    renderBadge();
    raf = requestAnimationFrame(loop);
    townApi = {
      renderInfo,
      syncWalkers,
      select: (id) => ((selected = id), renderInfo()),
      bubble: (id, ic) => bubbles.push({ id, icon: ic, life: 70 }),
    };

    cleanupView = () => {
      cancelAnimationFrame(raf);
      clearInterval(tickTimer);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      townApi = null;
    };
  }
  let townApi = null;
  const refreshTown = () => {
    townApi?.syncWalkers();
    townApi?.renderInfo();
  };

  // ======================= RESIDENT LOGIC =======================
  function moodText(r) {
    if (r.hunger < 25) return 'Feeling hungry…';
    if (r.happy >= 80) return 'Super happy!';
    if (r.happy >= 50) return 'Doing well';
    if (r.happy >= 30) return 'A bit bored';
    return 'Feeling down';
  }

  function requestText(r) {
    const q = r.request;
    switch (q.type) {
      case 'hungry':
        return `Is hungry for ${FOOD_BY_ID[q.food].name.toLowerCase()}!`;
      case 'bored':
        return 'Is bored. Play with them!';
      case 'lonely':
        return 'Wants to meet someone new';
      case 'outfit':
        return 'Wants a new outfit';
      case 'fight':
        return `Had a fight with ${byId(q.with)?.name || 'someone'}`;
      case 'confess':
        return `Has a crush on ${byId(q.with)?.name || 'someone'}! 💕`;
      case 'propose':
        return `Wants to propose to ${byId(q.with)?.name || 'someone'}!`;
      default:
        return 'Needs something';
    }
  }

  function reward(r, amount = 20) {
    r.happy = Math.min(100, r.happy + amount);
    r.xp += amount;
    let leveled = false;
    while (r.xp >= xpForLevel(r.level)) {
      r.xp -= xpForLevel(r.level);
      r.level++;
      leveled = true;
    }
    if (leveled) {
      save.addCoins(15);
      sfx.levelup();
      haptic(3);
      toast(`${r.name} reached level ${r.level}! +15 coins`, 'star');
      addNews(s, `${r.name} reached level ${r.level}!`, [r.id], 'sparkle');
    } else {
      sfx.discover();
      haptic(2);
    }
    const [x, y] = [innerWidth / 2, innerHeight / 2];
    burst(x, y, { count: 14, spread: 80, stars: 3 });
  }

  function resolve(r, amount) {
    r.request = null;
    reward(r, amount);
    townApi?.bubble(r.id, 'heart');
    refreshTown();
    save.persist();
  }

  function talk(r) {
    const P = PERSONALITIES[r.personality];
    let line = pick(P.lines);
    if (r.hunger < 25) line = "I'm sooo hungry...";
    else if (r.happy < 30) line = pick(["I've been feeling a bit down.", 'Could use a friend right now...', 'Sigh...']);
    const best = topFriends(r)[0];
    if (best && Math.random() < 0.3)
      line = best.rel.status ? `I love spending time with ${best.o.name} 💕` : `${best.o.name} is my best buddy!`;
    sfx.pet();
    haptic(1);
    toast(`${r.name}: “${line}”`, null);
    const now = Date.now();
    if (!r.lastTalk || now - r.lastTalk > 5 * 60000) {
      r.lastTalk = now;
      r.happy = Math.min(100, r.happy + 3);
      r.xp += 3;
    }
    townApi?.bubble(r.id, 'chat');
    save.persist();
  }

  function topFriends(r) {
    return s.residents
      .filter((o) => o !== r)
      .map((o) => ({ o, rel: getRel(s, r, o) }))
      .sort((a, b) => b.rel.a - a.rel.a + (b.rel.status ? 200 : 0) - (a.rel.status ? 200 : 0));
  }

  function feed(r, foodId) {
    if (!s.inventory[foodId]) return;
    s.inventory[foodId]--;
    if (!s.inventory[foodId]) delete s.inventory[foodId];
    r.hunger = Math.min(100, r.hunger + 40);
    const fav = foodId === r.food;
    const wanted = r.request?.type === 'hungry' && r.request.food === foodId;
    toast(
      `${r.name}: “${fav ? 'My favourite!! Thank you!' : wanted ? 'Exactly what I wanted!' : 'Yum, thanks!'}”`,
      FOOD_BY_ID[foodId].sprite,
    );
    if (r.request?.type === 'hungry') resolve(r, wanted ? 25 : 12);
    else reward(r, fav ? 15 : 6);
    townApi?.bubble(r.id, 'food');
    refreshTown();
    save.persist();
  }

  function handleRequest(r) {
    const q = r.request;
    if (!q) return;
    sfx.open();
    if (q.type === 'hungry') return openFeed(r);
    if (q.type === 'outfit') return showEditor(r, 'Clothes');
    const ui = sheet(
      r.name,
      () => {
        const head = el(
          'div',
          { class: 'req-head' },
          el('img', { class: 'px-icon', src: avatarURL(r.look, 4), width: 64, height: 80, alt: '' }),
          el('div', { class: 'req-text' }, requestText(r)),
        );
        const opts = [];
        if (q.type === 'bored') {
          for (const a of BORED_ACTIVITIES)
            opts.push(
              el(
                'button',
                {
                  class: 'px-btn',
                  onclick: () => {
                    ui.close();
                    toast(`${r.name}: “${pick(a.replies)}”`, null);
                    resolve(r, 20);
                  },
                },
                a.label,
              ),
            );
        } else if (q.type === 'lonely') {
          const others = s.residents.filter((o) => o !== r);
          opts.push(el('p', { class: 'backup-note' }, 'Who should they meet?'));
          for (const o of others)
            opts.push(
              el(
                'button',
                {
                  class: 'px-btn ghost person-btn',
                  onclick: () => {
                    ui.close();
                    const rel = getRel(s, r, o);
                    rel.a = clamp(rel.a + 15, -100, 100);
                    rel.met = true;
                    addNews(s, `${r.name} met ${o.name} and they hit it off!`, [r.id, o.id], 'heart');
                    toast(`${r.name} and ${o.name} became friends!`, 'heart');
                    resolve(r, 20);
                  },
                },
                el('img', { class: 'px-icon', src: avatarURL(o.look, 2), width: 24, height: 30, alt: '' }),
                o.name,
                el('small', {}, relationLabel(getRel(s, r, o))),
              ),
            );
        } else if (q.type === 'fight') {
          const o = byId(q.with);
          opts.push(
            el(
              'button',
              {
                class: 'px-btn',
                onclick: () => {
                  ui.close();
                  if (o) {
                    const rel = getRel(s, r, o);
                    rel.a = clamp(rel.a + 14, -100, 100);
                    addNews(s, `${r.name} and ${o.name} made up. Phew!`, [r.id, o.id], 'heart');
                  }
                  toast(`${r.name}: “You're right. I'll say sorry.”`, null);
                  resolve(r, 18);
                },
              },
              'Help them make up',
            ),
            el(
              'button',
              {
                class: 'px-btn ghost',
                onclick: () => {
                  ui.close();
                  toast(`${r.name}: “Hmph. Fine.”`, null);
                  r.request = null;
                  refreshTown();
                  save.persist();
                },
              },
              'Let it go',
            ),
          );
        } else if (q.type === 'confess' || q.type === 'propose') {
          const o = byId(q.with);
          const propose = q.type === 'propose';
          opts.push(
            el(
              'p',
              { class: 'backup-note' },
              propose ? `Should ${r.name} propose to ${o?.name}?` : `Should ${r.name} tell ${o?.name} how they feel?`,
            ),
            el(
              'button',
              {
                class: 'px-btn pink',
                onclick: () => {
                  ui.close();
                  romance(r, o, propose);
                },
              },
              propose ? 'Pop the question! 💍' : 'Go for it! 💕',
            ),
            el(
              'button',
              {
                class: 'px-btn ghost',
                onclick: () => {
                  ui.close();
                  toast(`${r.name}: “You're right… maybe another day.”`, null);
                  r.request = null;
                  refreshTown();
                  save.persist();
                },
              },
              'Maybe wait',
            ),
          );
        }
        return [head, el('div', { class: 'req-opts' }, opts)];
      },
      () => sfx.close(),
    );
  }

  function romance(r, o, propose) {
    if (!o) {
      r.request = null;
      return;
    }
    const rel = getRel(s, r, o);
    const chance = propose ? 0.8 : clamp((rel.a - 40) / 55, 0.3, 0.92);
    const ok = Math.random() < chance;
    if (ok) {
      rel.status = propose ? 'married' : 'dating';
      r.partner = o.id;
      o.partner = r.id;
      addNews(
        s,
        propose
          ? `${r.name} and ${o.name} got married! 💍🎉`
          : `${r.name} confessed to ${o.name}... and they said yes! 💕`,
        [r.id, o.id],
        'heart',
      );
      sfx.levelup();
      haptic(3);
      confirmBox(
        propose ? 'Just married! 💍' : 'They said yes! 💕',
        propose ? `${r.name} and ${o.name} are now married!` : `${r.name} and ${o.name} are now dating!`,
        'Aww!',
        null,
      );
      o.happy = Math.min(100, o.happy + 25);
      resolve(r, 30);
      burst(innerWidth / 2, innerHeight / 2, {
        count: 30,
        spread: 160,
        stars: 6,
        colors: ['#f19bb0', '#fad0d8', '#ffffff', '#ffe08a'],
      });
    } else {
      rel.a = clamp(rel.a - 15, -100, 100);
      r.happy = Math.max(0, r.happy - 20);
      r.request = null;
      addNews(s, `${r.name} confessed to ${o.name}, but ${o.name} just wants to be friends.`, [r.id, o.id], 'sparkle');
      sfx.error();
      confirmBox(
        'Oh no…',
        `${o.name} just wants to be friends. ${r.name} will be okay with some cheering up.`,
        'Okay',
        null,
      );
      refreshTown();
      save.persist();
    }
  }

  // ======================= SHEETS =======================
  function openFeed(r) {
    sheet(
      `Feed ${r.name}`,
      (refresh, close) => {
        const items = Object.keys(s.inventory).filter((id) => s.inventory[id] > 0);
        const want = r.request?.type === 'hungry' ? r.request.food : null;
        const rows = [];
        if (want)
          rows.push(
            el(
              'div',
              { class: 'shop-note' },
              `${r.name} wants ${FOOD_BY_ID[want].name}. Favourite: ${FOOD_BY_ID[r.food].name}.`,
            ),
          );
        else rows.push(el('div', { class: 'shop-note' }, `Favourite food: ${FOOD_BY_ID[r.food].name}`));
        if (!items.length) {
          rows.push(
            el('div', { class: 'shop-note' }, 'Your fridge is empty! Buy food in the Shop.'),
            el('button', { class: 'px-btn', onclick: () => (close(), openShop()) }, 'Go to the Shop'),
          );
          return rows;
        }
        for (const id of items) {
          const f = FOOD_BY_ID[id];
          rows.push(
            el(
              'div',
              { class: 'shop-row' + (id === want ? ' placed' : '') },
              el('div', { class: 'shop-icon recipe-icon' }, icon(f.sprite, 40)),
              el(
                'div',
                { class: 'shop-text' },
                el('div', { class: 'shop-name' }, `${f.name} ×${s.inventory[id]}`),
                el(
                  'div',
                  { class: 'shop-sub' },
                  id === r.food ? 'Their favourite!' : id === want ? 'What they want!' : '',
                ),
              ),
              el(
                'button',
                {
                  class: 'px-btn small',
                  onclick: () => {
                    close();
                    feed(r, id);
                  },
                },
                'Give',
              ),
            ),
          );
        }
        return rows;
      },
      () => sfx.close(),
    );
  }

  function openShop() {
    sfx.open();
    sheet(
      'Food shop',
      (refresh) => [
        el('div', { class: 'shop-note' }, 'Buy treats to feed your residents. Everyone has a favourite!'),
        ...FOODS.map((f) =>
          el(
            'div',
            { class: 'shop-row' },
            el('div', { class: 'shop-icon recipe-icon' }, icon(f.sprite, 40)),
            el(
              'div',
              { class: 'shop-text' },
              el('div', { class: 'shop-name' }, f.name),
              el('div', { class: 'shop-sub' }, s.inventory[f.id] ? `In fridge: ${s.inventory[f.id]}` : ''),
            ),
            el(
              'button',
              {
                class: 'px-btn small',
                onclick: () => {
                  if (!save.spend(f.price)) {
                    sfx.error();
                    toast(`You need ${f.price} coins`, 'coin');
                    return;
                  }
                  s.inventory[f.id] = (s.inventory[f.id] || 0) + 1;
                  sfx.coin();
                  haptic(1);
                  refresh();
                  save.persist();
                },
              },
              el('span', { class: 'btn-row' }, icon('coin', 14), String(f.price)),
            ),
          ),
        ),
      ],
      () => sfx.close(),
    );
  }

  function openPeople() {
    sfx.open();
    const ui = sheet(
      'Residents',
      () => {
        if (!s.residents.length)
          return [
            el('div', { class: 'shop-note' }, 'Nobody lives here yet!'),
            el('button', { class: 'px-btn', onclick: () => (ui.close(), newResident()) }, 'Make a resident'),
          ];
        return [
          el('div', { class: 'shop-note' }, `${s.residents.length}/${MAX_RESIDENTS} rooms filled`),
          ...s.residents.map((r) =>
            el(
              'button',
              { class: 'shop-row person-row', onclick: () => (ui.close(), openResident(r)) },
              el(
                'div',
                { class: 'shop-icon' },
                el('img', { class: 'px-icon', src: avatarURL(r.look, 2), width: 32, height: 40, alt: '' }),
              ),
              el(
                'div',
                { class: 'shop-text' },
                el(
                  'div',
                  { class: 'shop-name' },
                  `${r.name} `,
                  r.request ? el('span', { class: 'alert-dot' }, '!') : null,
                ),
                el(
                  'div',
                  { class: 'shop-sub' },
                  `Lv ${r.level} · ${PERSONALITIES[r.personality].name} · ${r.place === 'home' ? (r.visit ? `visiting ${byId(r.visit)?.name}` : 'at home') : `at ${PLACES[r.place].name}`}`,
                ),
              ),
              el('div', { class: 'mini-bar' }, el('i', { style: `width:${r.happy}%` })),
            ),
          ),
        ];
      },
      () => sfx.close(),
    );
  }

  function openResident(r) {
    sfx.open();
    const ui = sheet(
      r.name,
      (refresh) => {
        const friends = topFriends(r).slice(0, 6);
        return [
          el(
            'div',
            { class: 'res-head' },
            el(
              'div',
              { class: 'res-avatar' },
              el('img', { class: 'px-icon', src: avatarURL(r.look, 5), width: 80, height: 100, alt: '' }),
            ),
            el(
              'div',
              { class: 'res-stats' },
              el('div', {}, `Level ${r.level} · ${PERSONALITIES[r.personality].name}`),
              el('div', { class: 'res-fav' }, 'Loves ', icon(FOOD_BY_ID[r.food].sprite, 18), FOOD_BY_ID[r.food].name),
              el(
                'div',
                { class: 'stat-row' },
                el('span', {}, 'Happy'),
                el('div', { class: 'mini-bar' }, el('i', { style: `width:${r.happy}%` })),
              ),
              el(
                'div',
                { class: 'stat-row' },
                el('span', {}, 'Full'),
                el('div', { class: 'mini-bar food' }, el('i', { style: `width:${r.hunger}%` })),
              ),
              el('div', { class: 'res-mood' }, r.request ? requestText(r) : moodText(r)),
            ),
          ),
          el(
            'div',
            { class: 'res-actions' },
            r.request
              ? el('button', { class: 'px-btn small', onclick: () => (ui.close(), handleRequest(r)) }, 'Help!')
              : el('button', { class: 'px-btn small', onclick: () => talk(r) }, 'Talk'),
            el('button', { class: 'px-btn small pink', onclick: () => (ui.close(), openFeed(r)) }, 'Feed'),
            el('button', { class: 'px-btn small ghost', onclick: () => (ui.close(), showHome(r)) }, 'Visit'),
            el('button', { class: 'px-btn small ghost', onclick: () => (ui.close(), showEditor(r)) }, 'Edit'),
          ),
          el('div', { class: 'shop-note' }, 'Relationships'),
          ...(friends.length
            ? friends.map(({ o, rel }) =>
                el(
                  'div',
                  { class: 'shop-row rel-row' },
                  el(
                    'div',
                    { class: 'shop-icon' },
                    el('img', { class: 'px-icon', src: avatarURL(o.look, 2), width: 32, height: 40, alt: '' }),
                  ),
                  el(
                    'div',
                    { class: 'shop-text' },
                    el('div', { class: 'shop-name' }, o.name),
                    el('div', { class: 'shop-sub' }, relationLabel(rel)),
                  ),
                  el(
                    'div',
                    { class: 'mini-bar rel' + (rel.a < 0 ? ' neg' : '') },
                    el('i', { style: `width:${Math.abs(rel.a)}%` }),
                  ),
                ),
              )
            : [el('div', { class: 'shop-note' }, 'No other residents yet.')]),
          el(
            'button',
            {
              class: 'px-btn ghost small moveout',
              onclick: async () => {
                const ok = await confirmBox(
                  `Say goodbye to ${r.name}?`,
                  `${r.name} will move out of Pixel Town.`,
                  'Move out',
                  'Stay',
                );
                if (!ok) return;
                s.residents = s.residents.filter((x) => x !== r);
                for (const k of Object.keys(s.rel)) if (k.split('|').includes(r.id)) delete s.rel[k];
                for (const o of s.residents) {
                  if (o.partner === r.id) o.partner = null;
                  if (o.request?.with === r.id) o.request = null;
                }
                addNews(s, `${r.name} moved away. Bye bye!`, [], 'sparkle');
                ui.close();
                refreshTown();
                save.persist();
              },
            },
            'Move out',
          ),
        ];
      },
      () => sfx.close(),
    );
  }

  function openNews() {
    sfx.open();
    s.unread = 0;
    save.persist();
    sheet(
      'Town News',
      () => {
        if (!s.news.length) return el('div', { class: 'shop-note' }, 'Nothing has happened yet. Check back soon!');
        return s.news.map((n) => {
          const people = n.ids.map(byId).filter(Boolean);
          const d = new Date(n.t);
          return el(
            'div',
            { class: 'news-row' },
            el(
              'div',
              { class: 'news-faces' },
              people.map((p) =>
                el('img', { class: 'px-icon', src: avatarURL(p.look, 2), width: 24, height: 30, alt: '' }),
              ),
            ),
            el(
              'div',
              { class: 'news-text' },
              n.text,
              el('small', {}, `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`),
            ),
          );
        });
      },
      () => {
        sfx.close();
        townApi?.renderInfo();
        view.querySelector('.badge-count') && (view.querySelector('.badge-count').style.display = 'none');
      },
    );
  }

  // ======================= EDITOR =======================
  function newResident() {
    if (s.residents.length >= MAX_RESIDENTS) {
      sfx.error();
      toast('The apartments are full!', 'house');
      return;
    }
    showEditor(null);
  }

  function showEditor(existing, startTab = 'Face') {
    cleanupView?.();
    cleanupView = null;
    const draft = existing
      ? { name: existing.name, look: { ...existing.look }, personality: existing.personality, food: existing.food }
      : {
          name: pick(NAMES.filter((n) => !s.residents.some((r) => r.name === n))) || 'Pal',
          look: randomLook(),
          personality: pick(PERSONALITY_IDS),
          food: pick(FOODS).id,
        };
    let tab = startTab;
    const preview = el('img', { class: 'px-icon ed-avatar', alt: '' });
    const nameInput = el('input', { class: 'ed-name', maxlength: 10, value: draft.name, 'aria-label': 'Name' });
    nameInput.addEventListener('input', () => (draft.name = nameInput.value));
    const tabsEl = el('div', { class: 'ed-tabs' });
    const opts = el('div', { class: 'ed-opts' });
    const paint = () => (preview.src = avatarURL(draft.look, 6));

    const swatches = (key, colors) =>
      colors.map((c) =>
        el('button', {
          class: 'swatch-btn' + (draft.look[key] === c ? ' on' : ''),
          style: `background:${c}`,
          onclick: () => set(key, c),
        }),
      );
    const variants = (key, values) =>
      values.map((v) =>
        el(
          'button',
          { class: 'variant-btn' + (draft.look[key] === v ? ' on' : ''), onclick: () => set(key, v) },
          el('img', {
            class: 'px-icon',
            src: avatarURL({ ...draft.look, [key]: v }, 2),
            width: 32,
            height: 40,
            alt: v,
          }),
        ),
      );
    function set(key, v) {
      draft.look[key] = v;
      sfx.tap();
      haptic(1);
      paint();
      renderOpts();
    }
    function group(title, kids) {
      return el(
        'div',
        { class: 'ed-group' },
        el('div', { class: 'ed-label' }, title),
        el('div', { class: 'ed-row' }, kids),
      );
    }
    function renderOpts() {
      tabsEl.replaceChildren(
        ...['Face', 'Hair', 'Clothes', 'About'].map((t) =>
          el(
            'button',
            {
              class: 'px-btn small' + (t === tab ? '' : ' ghost'),
              onclick: () => ((tab = t), sfx.tap(), renderOpts()),
            },
            t,
          ),
        ),
      );
      let kids;
      if (tab === 'Face') {
        kids = [
          group('Skin', swatches('skin', SKINS)),
          group('Eyes', variants('eyes', EYES)),
          group('Mouth', variants('mouth', MOUTHS)),
          group('Blush', [
            el(
              'button',
              { class: 'px-btn small' + (draft.look.blush ? '' : ' ghost'), onclick: () => set('blush', true) },
              'On',
            ),
            el(
              'button',
              { class: 'px-btn small' + (!draft.look.blush ? '' : ' ghost'), onclick: () => set('blush', false) },
              'Off',
            ),
          ]),
        ];
      } else if (tab === 'Hair') {
        kids = [group('Style', variants('hair', HAIRS)), group('Colour', swatches('hairColor', HAIR_COLORS))];
      } else if (tab === 'Clothes') {
        kids = [
          group('Outfit', variants('outfit', OUTFITS)),
          group('Top', swatches('shirt', CLOTHES_COLORS)),
          group('Bottoms', swatches('pants', PANTS_COLORS)),
        ];
      } else {
        kids = [
          group(
            'Personality',
            PERSONALITY_IDS.map((p) =>
              el(
                'button',
                {
                  class: 'px-btn small' + (draft.personality === p ? '' : ' ghost'),
                  onclick: () => {
                    draft.personality = p;
                    sfx.tap();
                    renderOpts();
                  },
                },
                PERSONALITIES[p].name,
              ),
            ),
          ),
          group(
            'Favourite food',
            FOODS.map((f) =>
              el(
                'button',
                {
                  class: 'variant-btn' + (draft.food === f.id ? ' on' : ''),
                  onclick: () => {
                    draft.food = f.id;
                    sfx.tap();
                    renderOpts();
                  },
                },
                icon(f.sprite, 28),
              ),
            ),
          ),
        ];
      }
      opts.replaceChildren(...kids);
    }

    function saveDraft() {
      const name = draft.name.trim() || 'Pal';
      if (existing) {
        existing.name = name;
        existing.look = { ...draft.look };
        existing.personality = draft.personality;
        existing.food = draft.food;
        if (existing.request?.type === 'outfit') {
          existing.request = null;
          reward(existing, 22);
          toast(`${name}: “I love it! Thank you!”`, null);
        } else toast(`${name} looks great!`, 'sparkle');
      } else {
        const r = {
          id: 'r' + s.nextId++,
          name,
          look: { ...draft.look },
          personality: draft.personality,
          food: draft.food,
          level: 1,
          xp: 0,
          happy: 70,
          hunger: 80,
          place: 'home',
          visit: null,
          request: null,
          partner: null,
        };
        s.residents.push(r);
        addNews(s, `${name} moved into Pixel Town! Welcome!`, [r.id], 'sparkle');
        sfx.levelup();
        haptic(3);
        toast(`Welcome to Pixel Town, ${name}!`, 'heart');
        burst(innerWidth / 2, innerHeight / 2, { count: 20, spread: 120, stars: 4 });
      }
      save.persist();
      showTown();
    }

    view.replaceChildren(
      el(
        'div',
        { class: 'town-editor' },
        el(
          'div',
          { class: 'ed-top px-box' },
          preview,
          el('div', { class: 'ed-side' }, el('div', { class: 'ed-label' }, 'Name'), nameInput),
        ),
        tabsEl,
        opts,
        el(
          'div',
          { class: 'ed-actions' },
          el(
            'button',
            {
              class: 'px-btn ghost small',
              onclick: () => {
                draft.look = randomLook();
                sfx.pop();
                paint();
                renderOpts();
              },
            },
            '🎲 Random',
          ),
          el('button', { class: 'px-btn ghost small', onclick: () => (sfx.close(), showTown()) }, 'Cancel'),
          el('button', { class: 'px-btn small', onclick: saveDraft }, existing ? 'Save' : 'Move in!'),
        ),
      ),
    );
    paint();
    renderOpts();
  }

  // ======================= HOME VIEW =======================
  function showHome(r) {
    cleanupView?.();
    const RW = 112;
    const RH = 84;
    let raf = 0;
    let k = 3;
    let time = 0;
    const canvas = el('canvas', { class: 'tank-canvas' });
    const ctx = canvas.getContext('2d');
    const wrap = el('div', { class: 'tank-wrap' }, el('div', { class: 'tank-frame town-frame' }, canvas));
    const info = el('div', { class: 'info aq-info px-box' });
    view.replaceChildren(el('div', { class: 'aquarium town-main' }, wrap, info));
    const guests = () => s.residents.filter((o) => o.visit === r.id && !isNight(Date.now()));
    // The owner is only drawn when they're actually home (asleep at night).
    const people = () => [...(isNight(Date.now()) || (r.place === 'home' && !r.visit) ? [r] : []), ...guests()];
    const actors = new Map();
    function actor(p, i) {
      if (!actors.has(p.id)) actors.set(p.id, { x: 40 + i * 22, y: 70, tx: 40 + i * 22, frame: 0, face: 1 });
      return actors.get(p.id);
    }
    function layout() {
      const rr = wrap.getBoundingClientRect();
      const cssScale = Math.min((rr.width - 12) / RW, (rr.height - 12) / RH);
      const dpr = window.devicePixelRatio || 1;
      const nk = Math.max(1, Math.floor(cssScale * dpr));
      if (nk === k && canvas.width === RW * k) return;
      k = nk;
      canvas.width = RW * k;
      canvas.height = RH * k;
      canvas.style.width = (RW * k) / dpr + 'px';
      canvas.style.height = (RH * k) / dpr + 'px';
    }
    const ro = new ResizeObserver(layout);
    ro.observe(wrap);
    const px = (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), w, h);
    };
    function draw() {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const night = isNight(Date.now());
      // wall in their favourite colour, wood floor
      px(0, 0, RW, 52, r.look.shirt);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(0, 0, RW, 52);
      for (let y = 4; y < 46; y += 8)
        for (let x = (y / 8) % 2 ? 4 : 0; x < RW; x += 8) px(x + 1, y, 1, 1, 'rgba(255,255,255,0.8)');
      px(0, 46, RW, 6, '#fffaf3');
      for (let y = 52, n = 0; y < RH; y += 8, n++) {
        px(0, y, RW, 8, n % 2 ? '#bf9c9a' : '#c9a7a5');
        px(0, y + 7, RW, 1, 'rgba(107,74,74,0.25)');
      }
      // window
      px(70, 10, 30, 24, '#6b4a4a');
      px(71, 11, 28, 22, night ? '#3b3f73' : '#cdeaf7');
      if (night) {
        px(90, 14, 4, 4, '#ffe08a');
        px(77, 20, 1, 1, '#ffffff');
        px(82, 15, 1, 1, '#ffffff');
      } else {
        px(75, 15, 8, 3, '#ffffff');
        px(86, 22, 6, 2, '#ffffff');
      }
      px(84, 11, 2, 22, '#6b4a4a');
      px(71, 21, 28, 2, '#6b4a4a');
      // bed
      px(4, 56, 30, 14, '#6b4a4a');
      px(5, 57, 28, 12, '#fffaf3');
      px(5, 61, 28, 8, r.look.pants);
      px(6, 57, 9, 4, '#ffffff');
      // table & plant
      ctx.drawImage(sprite('c_table'), 58, 52);
      ctx.drawImage(sprite('c_plant'), 92, 52);
      ctx.drawImage(sprite(FOOD_BY_ID[r.food].sprite), 58, 44);
      // people
      const list = people();
      list.forEach((p, i) => {
        const a = actor(p, i);
        if (night && p === r) {
          // asleep in bed
          ctx.save();
          ctx.translate(26, 56);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(avatarCanvas(p.look, { expr: { eyes: 'closed', mouth: 'tiny' } }), -12, -14);
          ctx.restore();
          px(5, 61, 28, 8, p.look.pants);
          if (time % 120 < 80) {
            px(18, 44, 3, 1, '#9a7fd1');
            px(20, 45, 1, 1, '#9a7fd1');
            px(18, 46, 3, 1, '#9a7fd1');
          }
          return;
        }
        if (Math.abs(a.tx - a.x) < 0.5 && Math.random() < 0.01) a.tx = 40 + Math.random() * 50;
        const d = a.tx - a.x;
        if (Math.abs(d) > 0.5) {
          a.x += Math.sign(d) * 0.3;
          a.frame += 0.1;
        }
        const walking = Math.abs(d) > 0.5;
        const expr = p.happy < 30 ? { eyes: 'sad', mouth: 'frown' } : null;
        ctx.drawImage(
          avatarCanvas(p.look, { frame: walking ? 1 + (Math.floor(a.frame) % 2) : 0, expr }),
          Math.round(a.x - 8),
          Math.round(a.y - 20),
        );
      });
    }
    function loop() {
      time++;
      draw();
      raf = requestAnimationFrame(loop);
    }
    function renderInfo() {
      const g = guests();
      info.replaceChildren(
        el('div', { class: 'info-icon' }, icon('house', 40)),
        el(
          'div',
          { class: 'info-text' },
          el('div', { class: 'info-name' }, `${r.name}'s room`),
          el(
            'div',
            { class: 'info-sub' },
            isNight(Date.now())
              ? 'Shh… sleeping'
              : g.length
                ? `${g.map((x) => x.name).join(', ')} is visiting!`
                : r.place === 'home'
                  ? 'Relaxing at home'
                  : `Out at ${PLACES[r.place].name}`,
          ),
        ),
        el(
          'div',
          { class: 'info-btns' },
          el('button', { class: 'px-btn small', onclick: () => (sfx.close(), showTown()) }, 'Back'),
        ),
      );
    }
    canvas.addEventListener('pointerup', () => talk(r));
    layout();
    renderInfo();
    raf = requestAnimationFrame(loop);
    cleanupView = () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }

  // ======================= START =======================
  if (!s.residents.length) {
    showEditor(null);
    setTimeout(() => toast('Make your first resident!', 'heart'), 300);
  } else {
    showTown();
    if (awayNews)
      setTimeout(() => toast(`${awayNews} things happened while you were away. Check the News!`, 'book'), 400);
  }
  save.persist();

  return () => {
    cleanupView?.();
    document.querySelectorAll('.sheet-shade').forEach((n) => n.remove());
    save.flush();
  };
}
