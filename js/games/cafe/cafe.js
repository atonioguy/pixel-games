// Cozy Café: bake treats and brew drinks on real-time timers, stock the display cases,
// and little customers come in to buy (and sometimes sit down to eat). Decorate the café
// to raise its charm, which brings more customers and tips. Sales continue while away.
import { save } from '../../state.js';
import { el, icon, toast, confirmBox, flyCoins, burst, floatText, sheet } from '../../ui.js';
import { sfx } from '../../audio.js';
import { haptic } from '../../haptics.js';
import { SPRITES } from '../../sprites.js';
import { spriteCanvas } from '../../pixel.js';
import {
  COLS,
  ROWS,
  WALL_H,
  TILE,
  DOOR_COL,
  RECIPES,
  RECIPE_BY_ID,
  ITEMS,
  ITEM_BY_ID,
  WALLS,
  FLOORS,
  STARTER,
  xpForLevel,
  spawnSecs,
  OFFLINE_RATE,
  MAX_OFFLINE_HOURS,
  TIP_CHANCE,
} from './data.js';

const W = COLS * TILE; // 128
const H = WALL_H + ROWS * TILE; // 136
const CUSTOMERS = ['cust_cat', 'cust_bunny', 'cust_bear', 'cust_frog'];
const SHIRTS = ['#f19bb0', '#86bfe0', '#aee0d1', '#ffe08a', '#d7c6f2', '#f39a5b'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sprite = (name, flip) => spriteCanvas(name, SPRITES[name], flip);
let uidN = 0;
const uid = () => Date.now().toString(36) + (uidN++).toString(36);

// ---------- State ----------

function makeItem(type, col, row) {
  const def = ITEM_BY_ID[type];
  const it = { uid: uid(), type, col };
  if (def.kind === 'floor') it.row = row;
  if (def.role === 'oven' || def.role === 'drinks') {
    it.bake = null; // { r, done }
    it.ready = null; // recipe id waiting to be collected
  }
  if (def.role === 'display') {
    it.dish = null;
    it.n = 0;
  }
  return it;
}

function newState() {
  const s = {
    level: 1,
    xp: 0,
    till: 0,
    wall: 'pink',
    floor: 'wood',
    styles: { walls: ['pink'], floors: ['wood'] },
    items: [],
    storage: {},
    lastTick: Date.now(),
    spawnDebt: 0,
  };
  for (const [type, col, row] of STARTER.floor) s.items.push(makeItem(type, col, row));
  for (const [type, col] of STARTER.wall) s.items.push(makeItem(type, col));
  return s;
}

const def = (it) => ITEM_BY_ID[it.type];
const isWall = (it) => def(it).kind === 'wall';
const charmOf = (s) => s.items.reduce((a, it) => a + def(it).charm, 0);
const stocked = (s) => s.items.filter((it) => def(it).role === 'display' && it.n > 0);

function floorAt(s, col, row) {
  return s.items.find((it) => !isWall(it) && it.col === col && it.row === row);
}
function wallAt(s, col) {
  return s.items.find((it) => isWall(it) && it.col === col);
}

// Sell one serving from a random stocked display case. Returns the price (0 if nothing to sell).
function sellOne(s) {
  const cases = stocked(s);
  if (!cases.length) return null;
  const c = pick(cases);
  const r = RECIPE_BY_ID[c.dish];
  c.n--;
  if (c.n <= 0) {
    c.n = 0;
    c.dish = null;
  }
  const tip = Math.random() < TIP_CHANCE(charmOf(s)) ? Math.ceil(r.price / 2) : 0;
  s.till += r.price + tip;
  return { r, tip, caseItem: c };
}

// While the app was closed, customers still came in (a bit less often).
function catchUp(s, now) {
  const elapsed = Math.min(now - s.lastTick, MAX_OFFLINE_HOURS * 3600e3) / 1000;
  s.lastTick = now;
  if (elapsed < 30) return null;
  let customers = (elapsed / spawnSecs(charmOf(s))) * OFFLINE_RATE + (s.spawnDebt || 0);
  s.spawnDebt = customers % 1;
  customers = Math.floor(customers);
  let sold = 0;
  const before = s.till;
  for (let i = 0; i < customers; i++) {
    if (!sellOne(s)) break;
    sold++;
  }
  return sold ? { sold, coins: s.till - before } : null;
}

function validState(s) {
  return s && Array.isArray(s.items) && s.items.some((it) => it.type === 'register');
}

// ---------- The game screen ----------

export function mount(root, { headerSlot }) {
  let s = save.game('cafe', newState);
  if (!validState(s)) {
    save.resetGame('cafe');
    s = save.game('cafe', newState);
  }
  const away = catchUp(s, Date.now());

  let mode = 'play'; // play | edit
  let selected = null; // item uid
  let placing = null; // item type being placed from storage
  let moving = null; // uid being moved
  let raf = 0;
  let k = 3;
  let time = 0;
  let customers = [];
  let floaters = []; // little hearts/coins drawn in the scene
  let spawnTimer = 60; // frames until next customer

  // --- DOM ---
  const lvlNum = el('span', { class: 'pill-num' });
  headerSlot.append(el('div', { class: 'pill' }, icon('star', 20), lvlNum));

  const xpFill = el('div', { class: 'xp-fill' });
  const xpText = el('span', { class: 'xp-text' });
  const charmNum = el('span', {});
  const levelBar = el(
    'div',
    { class: 'level-bar' },
    el('div', { class: 'xp-track' }, xpFill, xpText),
    el('div', { class: 'lvl-badge charm' }, icon('heart', 20), charmNum),
  );
  const canvas = el('canvas', { class: 'tank-canvas cafe-canvas' });
  const ctx = canvas.getContext('2d');
  const sceneWrap = el('div', { class: 'tank-wrap' }, el('div', { class: 'tank-frame cafe-frame' }, canvas));
  const tools = el('div', { class: 'tools' });
  const info = el('div', { class: 'info aq-info px-box' });
  root.append(el('div', { class: 'aquarium cafe' }, levelBar, sceneWrap, tools, info));

  const toolBtn = (iconName, label, onclick, extra = '') =>
    el('button', { class: 'tool px-btn ghost ' + extra, onclick }, icon(iconName, 28), el('span', {}, label));

  function renderTools() {
    if (mode === 'edit') {
      tools.replaceChildren(
        toolBtn('coin', 'Shop', openShop),
        toolBtn('c_bookshelf', 'Storage', openStorage),
        toolBtn('w_frame', 'Styles', openStyles),
        toolBtn('check', 'Done', () => setMode('play'), 'done'),
      );
    } else {
      tools.replaceChildren(
        toolBtn('c_plant', 'Decorate', () => setMode('edit')),
        toolBtn('book', 'Menu', openMenu),
        toolBtn('c_register', 'Collect', collectTill),
        toolBtn('cust_cat', 'Guests', () => {
          sfx.tap();
          const n = customers.length;
          toast(n ? `${n} guest${n > 1 ? 's' : ''} in the café` : 'No guests right now', 'cust_cat');
        }),
      );
    }
  }

  // --- Background (rebuilt when the style changes) ---
  let bg = null;
  function buildBackground() {
    bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    const g = bg.getContext('2d');
    const wall = WALLS.find((w) => w.id === s.wall) || WALLS[0];
    const floor = FLOORS.find((f) => f.id === s.floor) || FLOORS[0];
    // Wallpaper with little diamonds
    g.fillStyle = wall.colors[0];
    g.fillRect(0, 0, W, WALL_H);
    g.fillStyle = wall.colors[1];
    for (let y = 3; y < WALL_H - 8; y += 8) {
      for (let x = (y / 8) % 2 ? 4 : 0; x < W; x += 8) {
        g.fillRect(x + 1, y, 1, 3);
        g.fillRect(x, y + 1, 3, 1);
      }
    }
    // Wainscoting
    g.fillStyle = '#fffaf3';
    g.fillRect(0, WALL_H - 9, W, 9);
    g.fillStyle = '#efe2d4';
    for (let x = 2; x < W; x += 5) g.fillRect(x, WALL_H - 7, 1, 6);
    g.fillStyle = '#e9d6c4';
    g.fillRect(0, WALL_H - 9, W, 1);
    // Door on the back wall
    const dx = DOOR_COL * TILE + 2;
    g.fillStyle = '#6b4a4a';
    g.fillRect(dx - 1, 7, 14, WALL_H - 7);
    g.fillStyle = '#c47f4f';
    g.fillRect(dx, 8, 12, WALL_H - 8);
    g.fillStyle = '#d3ecf7';
    g.fillRect(dx + 2, 11, 8, 8);
    g.fillStyle = '#ffffff';
    g.fillRect(dx + 3, 12, 2, 2);
    g.fillStyle = '#8f5a3c';
    g.fillRect(dx + 2, 22, 8, 1);
    g.fillRect(dx + 2, 27, 8, 1);
    g.fillStyle = '#ffe08a';
    g.fillRect(dx + 9, 25, 2, 2);
    // Floor
    const [a, b] = floor.colors;
    if (floor.id === 'check') {
      for (let y = WALL_H; y < H; y += 8)
        for (let x = 0; x < W; x += 8) {
          g.fillStyle = ((x + y) / 8) % 2 ? a : b;
          g.fillRect(x, y, 8, 8);
        }
    } else if (floor.id === 'mint') {
      for (let y = WALL_H; y < H; y += 16)
        for (let x = 0; x < W; x += 16) {
          g.fillStyle = a;
          g.fillRect(x, y, 16, 16);
          g.fillStyle = b;
          g.fillRect(x, y, 16, 1);
          g.fillRect(x, y, 1, 16);
        }
    } else {
      for (let y = WALL_H, n = 0; y < H; y += 8, n++) {
        g.fillStyle = n % 2 ? b : a;
        g.fillRect(0, y, W, 8);
        g.fillStyle = 'rgba(107,74,74,0.25)';
        g.fillRect(0, y + 7, W, 1);
        for (let x = (n * 23) % 32; x < W; x += 32) g.fillRect(x, y, 1, 7);
      }
    }
    // Shadow under the wall
    g.fillStyle = 'rgba(107,74,74,0.18)';
    g.fillRect(0, WALL_H, W, 2);
    // Door mat
    g.fillStyle = '#f19bb0';
    g.fillRect(DOOR_COL * TILE + 2, WALL_H + 1, 12, 4);
  }

  // --- Layout ---
  function layout() {
    const r = sceneWrap.getBoundingClientRect();
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
  ro.observe(sceneWrap);

  const toScene = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const toScreen = (x, y) => {
    const r = canvas.getBoundingClientRect();
    return [r.left + (x / W) * r.width, r.top + (y / H) * r.height];
  };
  const tileXY = (col, row) => [col * TILE, WALL_H + row * TILE];

  // --- Customers ---
  const seatTaken = new Set();

  function spawnCustomer() {
    const cases = stocked(s);
    if (!cases.length || customers.length >= 6) return;
    const target = pick(cases);
    const c = {
      sp: pick(CUSTOMERS),
      shirt: pick(SHIRTS),
      x: DOOR_COL * TILE + 8,
      y: WALL_H + 3,
      alpha: 0,
      state: 'toCase',
      caseUid: target.uid,
      phase: rand(0, 6),
      bubble: null,
      timer: 0,
      seat: null,
    };
    goTo(c, target.col * TILE + 8, WALL_H + (target.row + 1) * TILE + 11);
    customers.push(c);
  }

  function goTo(c, x, y) {
    c.tx = Math.max(6, Math.min(W - 6, x));
    c.ty = Math.max(WALL_H + 3, Math.min(H - 2, y));
  }

  function freeSeat() {
    const seats = s.items.filter((it) => def(it).role === 'seat' && !seatTaken.has(it.uid));
    return seats.length ? pick(seats) : null;
  }

  function updateCustomers() {
    for (const c of customers) {
      c.phase += 0.2;
      if (c.state === 'leaving' && c.arrived) {
        c.alpha -= 0.05;
        continue;
      }
      if (c.alpha < 1 && c.state !== 'leaving') c.alpha = Math.min(1, c.alpha + 0.05);
      if (c.timer > 0) {
        c.timer--;
        if (c.timer === 0) {
          c.bubble = null;
          if (c.state === 'eating') {
            seatTaken.delete(c.seat);
            c.seat = null;
            leave(c);
          } else if (c.state === 'buying') afterBuying(c);
        }
        continue;
      }
      const dx = c.tx - c.x;
      const dy = c.ty - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.6) {
        const sp = 0.45;
        c.x += (dx / d) * Math.min(sp, d);
        c.y += (dy / d) * Math.min(sp, d);
        c.walking = true;
        continue;
      }
      c.walking = false;
      if (c.state === 'toCase') arriveAtCase(c);
      else if (c.state === 'toSeat') {
        c.state = 'eating';
        c.timer = 420;
        c.bubble = c.dish;
        c.sitting = true;
      } else if (c.state === 'leaving') c.arrived = true;
    }
    customers = customers.filter((c) => c.alpha > 0 || c.state !== 'leaving' || !c.arrived);
  }

  function arriveAtCase(c) {
    const cs = s.items.find((it) => it.uid === c.caseUid);
    if (!cs || cs.n <= 0) {
      // Sold out: try another case, or leave sad.
      const other = stocked(s)[0];
      if (other) {
        c.caseUid = other.uid;
        goTo(c, other.col * TILE + 8, WALL_H + (other.row + 1) * TILE + 11);
        return;
      }
      c.bubble = 'sad';
      c.state = 'buying';
      c.timer = 50;
      c.noBuy = true;
      return;
    }
    const r = RECIPE_BY_ID[cs.dish];
    cs.n--;
    if (cs.n <= 0) {
      cs.n = 0;
      cs.dish = null;
    }
    const tip = Math.random() < TIP_CHANCE(charmOf(s)) ? Math.ceil(r.price / 2) : 0;
    s.till += r.price + tip;
    addXP(1);
    c.dish = r.sprite;
    c.bubble = r.sprite;
    c.state = 'buying';
    c.timer = 45;
    floaters.push({ x: c.x, y: c.y - 24, kind: 'coin', life: 40 });
    if (tip) floaters.push({ x: c.x + 6, y: c.y - 26, kind: 'heart', life: 50 });
    if (time - lastSaleSound > 30) {
      sfx.coin();
      lastSaleSound = time;
    }
    renderStatus();
    if (selected && s.items.find((i) => i.uid === selected)?.uid === cs.uid) renderInfo();
    save.persist();
  }
  let lastSaleSound = -100;

  function afterBuying(c) {
    const seat = !c.noBuy && Math.random() < 0.6 ? freeSeat() : null;
    if (seat) {
      seatTaken.add(seat.uid);
      c.seat = seat.uid;
      c.state = 'toSeat';
      goTo(c, seat.col * TILE + 8, WALL_H + seat.row * TILE + 13);
    } else leave(c);
  }

  function leave(c) {
    c.state = 'leaving';
    c.sitting = false;
    c.arrived = false;
    goTo(c, DOOR_COL * TILE + 8, WALL_H + 3);
  }

  // --- Drawing ---
  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function drawBubble(x, y, spriteName) {
    x = Math.round(x);
    y = Math.round(y);
    px(x - 9, y - 1, 18, 16, '#6b4a4a');
    px(x - 8, y, 16, 14, '#fffaf3');
    px(x - 1, y + 15, 3, 1, '#6b4a4a');
    px(x, y + 14, 1, 2, '#fffaf3');
    if (spriteName === 'sad') {
      px(x - 4, y + 6, 2, 2, '#9b7b7b');
      px(x - 1, y + 6, 2, 2, '#9b7b7b');
      px(x + 2, y + 6, 2, 2, '#9b7b7b');
    } else {
      ctx.save();
      ctx.translate(x - 7, y);
      ctx.scale(14 / 16, 14 / 16);
      ctx.drawImage(sprite(spriteName), 0, 0);
      ctx.restore();
    }
  }

  function drawCustomer(c) {
    ctx.globalAlpha = Math.max(0, Math.min(1, c.alpha));
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    const step = c.walking ? Math.sin(c.phase) : 0;
    const bob = c.walking ? Math.abs(step) * 1 : 0;
    if (!c.sitting) {
      // legs
      px(x - 2, y - 3, 1, 3 - (step > 0 ? 1 : 0), '#6b4a4a');
      px(x + 1, y - 3, 1, 3 - (step < 0 ? 1 : 0), '#6b4a4a');
    }
    // shirt
    px(x - 4, y - 8 - bob, 8, 5, '#6b4a4a');
    px(x - 3, y - 7 - bob, 6, 4, c.shirt);
    ctx.drawImage(sprite(c.sp), x - 8, y - 21 - bob);
    ctx.globalAlpha = 1;
    if (c.bubble) drawBubble(x, y - 40, c.bubble);
  }

  function drawItem(it) {
    const d = def(it);
    const [x, y0] = isWall(it) ? [it.col * TILE, 10] : tileXY(it.col, it.row);
    const y = isWall(it) ? y0 : y0 - 3;
    ctx.drawImage(sprite(d.sprite), x, y);
    if (d.role === 'display' && it.dish) {
      ctx.drawImage(sprite(RECIPE_BY_ID[it.dish].sprite), x, y - 3);
    }
    if ((d.role === 'oven' || d.role === 'drinks') && it.bake) {
      const r = RECIPE_BY_ID[it.bake.r];
      const left = Math.max(0, it.bake.done - Date.now());
      const p = 1 - left / (r.secs * 1000);
      px(x + 1, y - 3, 14, 4, '#6b4a4a');
      px(x + 2, y - 2, 12, 2, '#fffaf3');
      px(x + 2, y - 2, Math.round(12 * p), 2, '#6fb5a3');
      if (time % 40 < 20) px(x + 7, y + 1, 2, 1, 'rgba(255,255,255,0.8)'); // a puff of steam
    }
    if ((d.role === 'oven' || d.role === 'drinks') && it.ready) {
      const hop = Math.round(Math.abs(Math.sin(time * 0.08)) * -3);
      ctx.drawImage(sprite(RECIPE_BY_ID[it.ready].sprite), x, y - 14 + hop);
    }
    if (d.role === 'register' && s.till > 0) {
      // a little coin bobbing over the register
      const hop = Math.round(Math.abs(Math.sin(time * 0.08)) * -2);
      const cx = x + 8;
      const cy = y - 5 + hop;
      px(cx - 3, cy - 3, 7, 7, '#6b4a4a');
      px(cx - 2, cy - 2, 5, 5, '#f5b94a');
      px(cx - 1, cy - 1, 2, 2, '#ffe08a');
    }
    if (mode === 'edit' && (it.uid === selected || it.uid === moving)) {
      ctx.strokeStyle = '#f19bb0';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, (isWall(it) ? y0 : y0) + 0.5, TILE - 1, TILE - 1);
    }
  }

  function drawFloater(f) {
    const x = Math.round(f.x);
    const y = Math.round(f.y);
    if (f.kind === 'coin') {
      px(x - 2, y - 2, 5, 5, '#f5b94a');
      px(x - 1, y - 1, 3, 3, '#ffe08a');
    } else {
      px(x - 2, y, 2, 1, '#f19bb0');
      px(x + 1, y, 2, 1, '#f19bb0');
      px(x - 3, y + 1, 7, 2, '#f19bb0');
      px(x - 2, y + 3, 5, 1, '#f19bb0');
      px(x - 1, y + 4, 3, 1, '#f19bb0');
      px(x, y + 5, 1, 1, '#f19bb0');
    }
  }

  function draw() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (!bg) buildBackground();
    ctx.drawImage(bg, 0, 0);
    // Wall items
    for (const it of s.items) if (isWall(it)) drawItem(it);
    // Rugs lie flat under everything
    for (const it of s.items) if (!isWall(it) && it.type === 'rug') drawItem(it);
    // Floor items and customers, back to front
    const things = [
      ...s.items.filter((it) => !isWall(it) && it.type !== 'rug').map((it) => ({ y: WALL_H + it.row * TILE + 15, it })),
      ...customers.map((c) => ({ y: c.sitting ? c.y + 3 : c.y, c })),
    ].sort((a, b) => a.y - b.y);
    for (const t of things) t.it ? drawItem(t.it) : drawCustomer(t.c);
    for (const f of floaters) drawFloater(f);

    if (mode === 'edit') {
      // Grid overlay: shows free tiles and where the door is
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          if ((r + c) % 2) ctx.fillRect(c * TILE, WALL_H + r * TILE, TILE, TILE);
        }
      ctx.fillStyle = 'rgba(232,96,111,0.25)';
      ctx.fillRect(DOOR_COL * TILE, WALL_H, TILE, TILE);
      if (placing || moving) {
        ctx.fillStyle = 'rgba(120,235,185,0.42)';
        const type = placing || s.items.find((i) => i.uid === moving)?.type;
        if (type && ITEM_BY_ID[type].kind === 'wall') {
          for (let c = 1; c < COLS; c++) if (!wallAt(s, c)) ctx.fillRect(c * TILE, 8, TILE, 22);
        } else {
          for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
              if (!floorAt(s, c, r) && !(c === DOOR_COL && r === 0))
                ctx.fillRect(c * TILE + 1, WALL_H + r * TILE + 1, TILE - 2, TILE - 2);
        }
      }
    }
  }

  function update() {
    time++;
    if (mode === 'play') {
      if (--spawnTimer <= 0) {
        spawnCustomer();
        spawnTimer = Math.round(spawnSecs(charmOf(s)) * 60 * rand(0.7, 1.3));
      }
    }
    updateCustomers();
    for (const f of floaters) {
      f.y -= 0.3;
      f.life--;
    }
    floaters = floaters.filter((f) => f.life > 0);
    // Finished baking?
    if (time % 30 === 0) {
      let changed = false;
      for (const it of s.items) {
        if (it.bake && it.bake.done <= Date.now()) {
          it.ready = it.bake.r;
          it.bake = null;
          changed = true;
        }
      }
      if (changed) {
        sfx.ready();
        save.persist();
        renderInfo();
      }
      if (selected) renderInfoLive();
    }
  }

  function loop() {
    update();
    draw();
    raf = requestAnimationFrame(loop);
  }

  // --- Status UI ---
  function renderStatus() {
    const need = xpForLevel(s.level);
    lvlNum.textContent = `Lv ${s.level}`;
    xpFill.style.width = Math.min(100, (s.xp / need) * 100) + '%';
    xpText.textContent = `${s.xp}/${need} xp`;
    charmNum.textContent = String(charmOf(s));
  }

  const mmss = (ms) => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    if (t >= 3600) return `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`;
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  const dur = (secs) => (secs >= 3600 ? `${secs / 3600}h` : secs >= 60 ? `${Math.round(secs / 60)}m` : `${secs}s`);

  // Parts of the info box that tick (timers) are updated without rebuilding it.
  let liveText = null;
  function renderInfoLive() {
    const it = s.items.find((i) => i.uid === selected);
    if (liveText && it?.bake) liveText.textContent = `Ready in ${mmss(it.bake.done - Date.now())}`;
  }

  function infoBox(spriteName, name, sub, sub2, btns = []) {
    liveText = null;
    const subEl = el('div', { class: 'info-sub' }, sub);
    info.replaceChildren(
      el('div', { class: 'info-icon' }, icon(spriteName, 40)),
      el(
        'div',
        { class: 'info-text' },
        el('div', { class: 'info-name' }, name),
        subEl,
        sub2 ? el('div', { class: 'info-sub' }, sub2) : null,
      ),
      btns.length ? el('div', { class: 'info-btns' }, btns) : null,
    );
    return subEl;
  }

  function renderInfo() {
    if (mode === 'edit') return renderEditInfo();
    const it = s.items.find((i) => i.uid === selected);
    if (!it) {
      liveText = null;
      info.replaceChildren(
        el(
          'div',
          { class: 'info-hint' },
          stocked(s).length
            ? 'Tap an oven or the drinks bar to make more. Tap the register to collect coins!'
            : 'Your display cases are empty! Tap an oven or the drinks bar to start making treats.',
        ),
      );
      return;
    }
    const d = def(it);
    if (d.role === 'oven' || d.role === 'drinks') {
      if (it.ready) {
        const r = RECIPE_BY_ID[it.ready];
        infoBox(d.sprite, d.name, `${r.name} is ready!`, 'Tap to put it in a display case', [
          el('button', { class: 'px-btn small', onclick: () => collectMachine(it) }, 'Collect'),
        ]);
      } else if (it.bake) {
        const r = RECIPE_BY_ID[it.bake.r];
        infoBox(d.sprite, d.name, `Making ${r.name}…`, `Ready in ${mmss(it.bake.done - Date.now())}`);
        liveText = info.querySelectorAll('.info-sub')[1];
        renderInfoLive();
      } else {
        infoBox(d.sprite, d.name, 'Idle', 'Pick something to make', [
          el('button', { class: 'px-btn small', onclick: () => openRecipes(it) }, 'Make'),
        ]);
      }
    } else if (d.role === 'display') {
      if (it.dish) {
        const r = RECIPE_BY_ID[it.dish];
        infoBox(r.sprite, r.name, `${it.n} left · ${r.price} coins each`, 'In the display case', [
          el('button', { class: 'px-btn ghost small', onclick: () => clearCase(it) }, 'Clear'),
        ]);
      } else {
        infoBox(d.sprite, d.name, 'Empty', 'Finished treats go here');
      }
    } else if (d.role === 'register') {
      infoBox(d.sprite, 'Register', `${s.till} coins inside`, 'Customers pay here', [
        el('button', { class: 'px-btn small', onclick: collectTill }, 'Collect'),
      ]);
    } else {
      infoBox(d.sprite, d.name, `Charm +${d.charm}`, 'Charm brings more guests & tips');
    }
  }

  function renderEditInfo() {
    liveText = null;
    if (placing) {
      const d = ITEM_BY_ID[placing];
      infoBox(
        d.sprite,
        `Place: ${d.name}`,
        d.kind === 'wall' ? 'Tap a spot on the wall' : 'Tap a free (green) tile',
        '',
        [el('button', { class: 'px-btn ghost small', onclick: () => ((placing = null), renderInfo()) }, 'Cancel')],
      );
      return;
    }
    const it = s.items.find((i) => i.uid === selected);
    if (moving && it) {
      infoBox(def(it).sprite, `Moving: ${def(it).name}`, 'Tap where it should go', '', [
        el('button', { class: 'px-btn ghost small', onclick: () => ((moving = null), renderInfo()) }, 'Cancel'),
      ]);
      return;
    }
    if (!it) {
      info.replaceChildren(
        el('div', { class: 'info-hint' }, 'Tap furniture to move or store it. Buy new things in the Shop!'),
      );
      return;
    }
    const d = def(it);
    const btns = [
      el('button', { class: 'px-btn small', onclick: () => ((moving = it.uid), sfx.tap(), renderInfo()) }, 'Move'),
    ];
    if (d.role !== 'register')
      btns.push(el('button', { class: 'px-btn ghost small', onclick: () => storeItem(it) }, 'Store'));
    infoBox(d.sprite, d.name, d.charm ? `Charm +${d.charm}` : roleText(d.role), '', btns);
  }

  const roleText = (role) =>
    ({
      oven: 'Bakes treats',
      drinks: 'Makes drinks',
      display: 'Holds treats for sale',
      register: 'Customers pay here',
      seat: 'Guests sit here',
    })[role] || '';

  function setMode(m) {
    mode = m;
    selected = null;
    placing = null;
    moving = null;
    sfx.tap();
    if (m === 'edit') {
      // Guests politely leave while you redecorate.
      for (const c of customers) {
        if (c.seat) seatTaken.delete(c.seat);
        c.seat = null;
        c.bubble = null;
        c.timer = 0;
        leave(c);
      }
    }
    renderTools();
    renderInfo();
  }

  // --- Actions ---
  function addXP(n) {
    s.xp += n;
    let leveled = false;
    while (s.xp >= xpForLevel(s.level)) {
      s.xp -= xpForLevel(s.level);
      s.level++;
      leveled = true;
    }
    renderStatus();
    if (leveled) {
      const lv = s.level;
      const newRecipes = RECIPES.filter((r) => r.level === lv).map((r) => r.name);
      const newItems = ITEMS.filter((i) => i.level === lv).map((i) => i.name);
      const bonus = lv * 15;
      save.addCoins(bonus);
      sfx.levelup();
      haptic(3);
      const [x, y] = toScreen(W / 2, H / 2);
      burst(x, y, { count: 24, spread: 140, stars: 6, size: 6 });
      const unlocks = [...newRecipes, ...newItems];
      confirmBox(
        `Café level ${lv}!`,
        `+${bonus} coins.${unlocks.length ? ' New: ' + unlocks.join(', ') + '!' : ''}`,
        'Yay!',
        null,
      );
    }
  }

  function openRecipes(machine) {
    sfx.open();
    const role = def(machine).role;
    const ui = sheet(
      role === 'oven' ? 'Bake' : 'Brew',
      () =>
        RECIPES.filter((r) => r.machine === role).map((r) => {
          const locked = r.level > s.level;
          return el(
            'div',
            { class: 'shop-row' + (locked ? ' locked-row' : '') },
            el('div', { class: 'shop-icon recipe-icon' }, icon(r.sprite, 40)),
            el(
              'div',
              { class: 'shop-text' },
              el('div', { class: 'shop-name' }, r.name),
              el(
                'div',
                { class: 'shop-sub' },
                icon('timer', 14),
                ` ${dur(r.secs)} · ${r.servings} × `,
                icon('coin', 14),
                String(r.price),
              ),
            ),
            locked
              ? el('div', { class: 'lock-tag' }, icon('lock', 16), `Lv ${r.level}`)
              : el(
                  'button',
                  {
                    class: 'px-btn small',
                    onclick: () => {
                      if (!save.spend(r.cost)) {
                        sfx.error();
                        toast(`You need ${r.cost} coins`, 'coin');
                        return;
                      }
                      machine.bake = { r: r.id, done: Date.now() + r.secs * 1000 };
                      machine.ready = null;
                      sfx.pop();
                      haptic(2);
                      toast(`${role === 'oven' ? 'Baking' : 'Brewing'} ${r.name}!`, r.sprite);
                      ui.close();
                      renderInfo();
                      save.persist();
                    },
                  },
                  el('span', { class: 'btn-row' }, icon('coin', 14), String(r.cost)),
                ),
          );
        }),
      () => sfx.close(),
    );
  }

  function collectMachine(it) {
    const r = RECIPE_BY_ID[it.ready];
    const cases = s.items.filter((i) => def(i).role === 'display');
    const target = cases.find((c) => c.dish === r.id) || cases.find((c) => !c.dish);
    if (!target) {
      sfx.error();
      haptic(2);
      toast('All display cases are full! Sell or clear one first.', 'c_display');
      return;
    }
    target.dish = r.id;
    target.n += r.servings;
    it.ready = null;
    sfx.discover();
    haptic(2);
    const [x, y] = toScreen(target.col * TILE + 8, WALL_H + target.row * TILE);
    burst(x, y, { count: 12, spread: 50, stars: 2 });
    floatText(x, y - 10, `+${r.servings} ${r.name}`);
    addXP(r.xp);
    renderInfo();
    save.persist();
  }

  async function clearCase(it) {
    const ok = await confirmBox(
      'Clear this case?',
      `The ${RECIPE_BY_ID[it.dish].name} will be thrown out.`,
      'Clear',
      'Keep',
    );
    if (!ok) return;
    it.dish = null;
    it.n = 0;
    sfx.close();
    renderInfo();
    save.persist();
  }

  function collectTill() {
    if (s.till <= 0) {
      sfx.tap();
      toast('The register is empty', 'c_register');
      return;
    }
    const amount = s.till;
    s.till = 0;
    save.addCoins(amount);
    sfx.serve();
    haptic(3);
    const reg = s.items.find((i) => i.type === 'register');
    const [x, y] = toScreen(reg.col * TILE + 8, WALL_H + reg.row * TILE);
    burst(x, y, { count: 14, spread: 60, stars: 3 });
    floatText(x, y - 10, `+${amount}`, { iconName: 'coin' });
    flyCoins({ left: x - 10, top: y - 10, width: 20, height: 20 }, Math.min(8, 2 + Math.ceil(amount / 10)));
    renderInfo();
    save.persist();
  }

  function storeItem(it) {
    const d = def(it);
    if ((it.bake || it.ready) && (d.role === 'oven' || d.role === 'drinks')) {
      toast('Wait until it finishes cooking', d.sprite);
      return;
    }
    if (d.role === 'display' && it.n > 0) {
      toast('Sell or clear the treats first', d.sprite);
      return;
    }
    s.items = s.items.filter((i) => i !== it);
    s.storage[it.type] = (s.storage[it.type] || 0) + 1;
    selected = null;
    sfx.close();
    renderStatus();
    renderInfo();
    save.persist();
  }

  function placeAt(type, col, row, wallCol) {
    const d = ITEM_BY_ID[type];
    if (d.kind === 'wall') {
      if (wallCol < 1 || wallAt(s, wallCol)) return false;
      s.items.push(makeItem(type, wallCol));
    } else {
      if (row < 0 || floorAt(s, col, row) || (col === DOOR_COL && row === 0)) return false;
      s.items.push(makeItem(type, col, row));
    }
    return true;
  }

  // --- Sheets ---
  function shopRow(spriteName, name, sub, btn, locked) {
    return el(
      'div',
      { class: 'shop-row' + (locked ? ' locked-row' : '') },
      el('div', { class: 'shop-icon' }, icon(spriteName, 40)),
      el('div', { class: 'shop-text' }, el('div', { class: 'shop-name' }, name), el('div', { class: 'shop-sub' }, sub)),
      btn,
    );
  }

  function openShop() {
    sfx.open();
    const ui = sheet(
      'Shop',
      () =>
        ITEMS.filter((d) => d.level < 99).map((d) => {
          const locked = d.level > s.level;
          const sub = d.charm ? `Charm +${d.charm}` : roleText(d.role);
          const btn = locked
            ? el('div', { class: 'lock-tag' }, icon('lock', 16), `Lv ${d.level}`)
            : el(
                'button',
                {
                  class: 'px-btn small',
                  onclick: () => {
                    if (!save.spend(d.price)) {
                      sfx.error();
                      toast(`You need ${d.price} coins`, 'coin');
                      return;
                    }
                    s.storage[d.id] = (s.storage[d.id] || 0) + 1;
                    placing = d.id;
                    selected = null;
                    moving = null;
                    sfx.coin();
                    haptic(2);
                    ui.close();
                    renderInfo();
                    save.persist();
                  },
                },
                el('span', { class: 'btn-row' }, icon('coin', 14), String(d.price)),
              );
          return shopRow(d.sprite, d.name, sub, btn, locked);
        }),
      () => sfx.close(),
    );
  }

  function openStorage() {
    sfx.open();
    const ui = sheet(
      'Storage',
      () => {
        const types = Object.keys(s.storage).filter((t) => s.storage[t] > 0);
        if (!types.length)
          return el('div', { class: 'shop-note' }, 'Nothing in storage. Store furniture to see it here.');
        return types.map((t) => {
          const d = ITEM_BY_ID[t];
          return shopRow(
            d.sprite,
            `${d.name} ×${s.storage[t]}`,
            d.charm ? `Charm +${d.charm}` : roleText(d.role),
            el(
              'button',
              {
                class: 'px-btn pink small',
                onclick: () => {
                  placing = t;
                  selected = null;
                  moving = null;
                  sfx.tap();
                  ui.close();
                  renderInfo();
                },
              },
              'Place',
            ),
          );
        });
      },
      () => sfx.close(),
    );
  }

  function openStyles() {
    sfx.open();
    const ui = sheet(
      'Styles',
      (refresh) => {
        const row = (list, kind) =>
          list.map((st) => {
            const owned = s.styles[kind].includes(st.id);
            const current = (kind === 'walls' ? s.wall : s.floor) === st.id;
            const locked = !owned && st.level > s.level;
            const swatch = el('div', {
              class: 'swatch',
              style: `background:${st.colors[0]};box-shadow:inset -10px -10px 0 ${st.colors[1]}`,
            });
            const btn = current
              ? el('div', { class: 'lock-tag' }, 'In use')
              : locked
                ? el('div', { class: 'lock-tag' }, icon('lock', 16), `Lv ${st.level}`)
                : el(
                    'button',
                    {
                      class: 'px-btn small' + (owned ? ' pink' : ''),
                      onclick: () => {
                        if (!owned) {
                          if (!save.spend(st.price)) {
                            sfx.error();
                            toast(`You need ${st.price} coins`, 'coin');
                            return;
                          }
                          s.styles[kind].push(st.id);
                        }
                        if (kind === 'walls') s.wall = st.id;
                        else s.floor = st.id;
                        bg = null;
                        sfx.pop();
                        haptic(2);
                        refresh();
                        save.persist();
                      },
                    },
                    owned ? 'Use' : el('span', { class: 'btn-row' }, icon('coin', 14), String(st.price)),
                  );
            return el(
              'div',
              { class: 'shop-row' },
              el('div', { class: 'shop-icon' }, swatch),
              el(
                'div',
                { class: 'shop-text' },
                el('div', { class: 'shop-name' }, st.name),
                el('div', { class: 'shop-sub' }, kind === 'walls' ? 'Wallpaper' : 'Floor'),
              ),
              btn,
            );
          });
        return [
          el('div', { class: 'shop-note' }, 'Wallpaper'),
          ...row(WALLS, 'walls'),
          el('div', { class: 'shop-note' }, 'Floors'),
          ...row(FLOORS, 'floors'),
        ];
      },
      () => sfx.close(),
    );
    return ui;
  }

  function openMenu() {
    sfx.open();
    sheet(
      'Menu',
      () => [
        el('div', { class: 'shop-note' }, 'Everything your café can make. Level up to unlock more!'),
        ...RECIPES.map((r) => {
          const locked = r.level > s.level;
          return shopRow(
            r.sprite,
            r.name,
            [
              icon(r.machine === 'oven' ? 'app_oven' : 'c_espresso', 16),
              ` ${dur(r.secs)} · ${r.servings} × `,
              icon('coin', 14),
              String(r.price),
            ],
            locked
              ? el('div', { class: 'lock-tag' }, icon('lock', 16), `Lv ${r.level}`)
              : el('div', { class: 'lock-tag' }, `cost ${r.cost}`),
            locked,
          );
        }),
      ],
      () => sfx.close(),
    );
  }

  // --- Input ---
  canvas.addEventListener('pointerup', (e) => {
    const [x, y] = toScene(e);
    const onWall = y < WALL_H;
    const col = Math.max(0, Math.min(COLS - 1, Math.floor(x / TILE)));
    const row = onWall ? -1 : Math.max(0, Math.min(ROWS - 1, Math.floor((y - WALL_H + 3) / TILE)));

    if (mode === 'edit') {
      if (placing) {
        const d = ITEM_BY_ID[placing];
        if (placeAt(placing, col, row, onWall || d.kind === 'wall' ? col : -1)) {
          s.storage[placing]--;
          if (s.storage[placing] <= 0) delete s.storage[placing];
          sfx.pop();
          haptic(2);
          const [sx, sy] = toScreen(col * TILE + 8, onWall ? 20 : WALL_H + row * TILE + 8);
          burst(sx, sy, { count: 8, spread: 30, stars: 1 });
          placing = null;
          renderStatus();
          renderInfo();
          save.persist();
        } else {
          sfx.error();
          haptic(2);
          toast(d.kind === 'wall' ? 'Pick an empty spot on the wall' : 'That spot is taken');
        }
        return;
      }
      if (moving) {
        const it = s.items.find((i) => i.uid === moving);
        const wall = isWall(it);
        const ok = wall
          ? col >= 1 && (!wallAt(s, col) || wallAt(s, col) === it)
          : !onWall && (!floorAt(s, col, row) || floorAt(s, col, row) === it) && !(col === DOOR_COL && row === 0);
        if (ok) {
          it.col = col;
          if (!wall) it.row = row;
          moving = null;
          sfx.drop();
          haptic(1);
          renderInfo();
          save.persist();
        } else {
          sfx.error();
          toast('That spot is taken');
        }
        return;
      }
      const hit = onWall ? wallAt(s, col) : floorAt(s, col, row);
      selected = hit ? hit.uid : null;
      if (hit) sfx.tap();
      renderInfo();
      return;
    }

    // Play mode: customers first
    const guest = customers.find((c) => Math.abs(c.x - x) < 7 && y > c.y - 22 && y < c.y + 2);
    if (guest) {
      floaters.push({ x: guest.x, y: guest.y - 26, kind: 'heart', life: 50 });
      sfx.pet();
      haptic(1);
      return;
    }
    const hit = onWall ? wallAt(s, col) : floorAt(s, col, row);
    if (!hit) {
      selected = null;
      renderInfo();
      return;
    }
    selected = hit.uid;
    const d = def(hit);
    haptic(1);
    if ((d.role === 'oven' || d.role === 'drinks') && hit.ready) collectMachine(hit);
    else if ((d.role === 'oven' || d.role === 'drinks') && !hit.bake) {
      renderInfo();
      openRecipes(hit);
    } else if (d.role === 'register') {
      collectTill();
    } else {
      sfx.tap();
      if (d.role === 'decor' || d.role === 'seat')
        floaters.push({
          x: hit.col * TILE + 8,
          y: (isWall(hit) ? 10 : WALL_H + hit.row * TILE) - 2,
          kind: 'heart',
          life: 40,
        });
      renderInfo();
    }
  });

  // --- Start ---
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    const got = catchUp(s, Date.now());
    if (got) toast(`While you were away: sold ${got.sold} treats (+${got.coins} in the register)`, 'c_register');
    renderInfo();
  };
  document.addEventListener('visibilitychange', onVisible);
  const clock = setInterval(() => {
    s.lastTick = Date.now();
    save.persist();
  }, 5000);

  layout();
  renderTools();
  renderStatus();
  renderInfo();
  if (away)
    setTimeout(
      () => toast(`While you were away: sold ${away.sold} treats (+${away.coins} in the register)`, 'c_register'),
      400,
    );
  save.persist();
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(clock);
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisible);
    document.querySelectorAll('.sheet-shade').forEach((n) => n.remove());
    s.lastTick = Date.now();
    save.flush();
  };
}
