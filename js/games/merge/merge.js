// Merge Kitchen: tap generators to make ingredients, drag matching items together to
// merge them into better dishes, and serve customers' orders for coins.
import { save } from '../../state.js';
import { el, icon, spriteSrc, toast, confirmBox, flyCoins } from '../../ui.js';
import { sfx } from '../../audio.js';
import {
  CHAINS,
  CHAIN_IDS,
  CUSTOMERS,
  COLS,
  ROWS,
  ENERGY_MAX,
  ENERGY_REGEN_MS,
  REFILL_COST,
  GEN_HOME,
  STARTER,
  xpForLevel,
  orderValue,
  sellValue,
} from './data.js';

const N = COLS * ROWS;
const ORDER_SLOTS = 3;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const keyOf = (c, l) => c + ':' + l;
const maxLevel = (c) => CHAINS[c].items.length;
const itemSprite = (c, l) => CHAINS[c].items[l - 1].id;
const itemName = (c, l) => CHAINS[c].items[l - 1].name;
const spriteOf = (it) => (it.t === 'gen' ? CHAINS[it.c].gen : itemSprite(it.c, it.l));

// ---------- State helpers (pure-ish, operate on the save object) ----------

function newState() {
  const s = {
    board: Array(N).fill(null),
    energy: ENERGY_MAX,
    energyAt: Date.now(),
    level: 1,
    xp: 0,
    discovered: {},
    orders: [],
    orderSeq: 0,
    pendingGens: [],
  };
  for (const id of CHAIN_IDS) if (CHAINS[id].unlock <= 1) placeGen(s, id);
  for (const [i, c, l] of STARTER) {
    if (!s.board[i]) s.board[i] = { t: 'item', c, l };
    s.discovered[c] = Math.max(s.discovered[c] || 0, l);
  }
  ensureOrders(s);
  return s;
}

function rc(i) {
  return [Math.floor(i / COLS), i % COLS];
}

function nearestEmpty(s, from) {
  const [r0, c0] = rc(from);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < N; i++) {
    if (s.board[i]) continue;
    const [r, c] = rc(i);
    const d = Math.hypot(r - r0, c - c0) + Math.random() * 0.3;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function placeGen(s, id) {
  const [r, c] = GEN_HOME[id];
  let i = r * COLS + c;
  if (s.board[i]) i = nearestEmpty(s, i);
  if (i < 0) {
    if (!s.pendingGens.includes(id)) s.pendingGens.push(id);
    return -1;
  }
  s.board[i] = { t: 'gen', c: id };
  s.pendingGens = s.pendingGens.filter((x) => x !== id);
  return i;
}

function syncEnergy(s) {
  const now = Date.now();
  if (s.energy >= ENERGY_MAX) {
    s.energyAt = now;
    return;
  }
  const gained = Math.floor((now - s.energyAt) / ENERGY_REGEN_MS);
  if (gained > 0) {
    s.energy = Math.min(ENERGY_MAX, s.energy + gained);
    s.energyAt = s.energy >= ENERGY_MAX ? now : s.energyAt + gained * ENERGY_REGEN_MS;
  }
}

function randomRequest(s) {
  const unlocked = CHAIN_IDS.filter((id) => CHAINS[id].unlock <= s.level);
  const count = s.level >= 2 && Math.random() < 0.45 ? 2 : 1;
  const req = [];
  for (let n = 0; n < count; n++) {
    const c = pick(unlocked);
    const top = Math.max(2, Math.min(maxLevel(c), s.level + 2, (s.discovered[c] || 1) + 2));
    const l = 2 + Math.floor(Math.random() ** 1.4 * (top - 1));
    req.push({ c, l });
  }
  return req;
}

function makeOrder(s) {
  // Try a few times to avoid asking for the same thing as an existing order.
  const current = new Set(s.orders.flatMap((o) => o.req.map((r) => keyOf(r.c, r.l))));
  let req = randomRequest(s);
  for (let tries = 0; tries < 8 && req.some((r) => current.has(keyOf(r.c, r.l))); tries++) req = randomRequest(s);
  const taken = new Set(s.orders.map((o) => o.cust));
  const free = CUSTOMERS.map((_, i) => i).filter((i) => !taken.has(i));
  return {
    id: ++s.orderSeq,
    cust: pick(free.length ? free : CUSTOMERS.map((_, i) => i)),
    req,
    coins: req.reduce((a, r) => a + orderValue(r.l), 0),
    xp: req.reduce((a, r) => a + r.l * 2, 0),
  };
}

function ensureOrders(s) {
  while (s.orders.length < ORDER_SLOTS) s.orders.push(makeOrder(s));
}

function boardCounts(s) {
  const m = new Map();
  for (const it of s.board) if (it && it.t === 'item') m.set(keyOf(it.c, it.l), (m.get(keyOf(it.c, it.l)) || 0) + 1);
  return m;
}

function orderNeeds(o) {
  const need = new Map();
  for (const r of o.req) need.set(keyOf(r.c, r.l), (need.get(keyOf(r.c, r.l)) || 0) + 1);
  return need;
}

function orderReady(o, counts) {
  for (const [k, n] of orderNeeds(o)) if ((counts.get(k) || 0) < n) return false;
  return true;
}

function validState(s) {
  return s && Array.isArray(s.board) && s.board.length === N && Array.isArray(s.orders);
}

// ---------- The game screen ----------

export function mount(root, { headerSlot }) {
  let s = save.game('merge', newState);
  if (!validState(s)) {
    save.resetGame('merge');
    s = save.game('merge', newState);
  }
  syncEnergy(s);
  ensureOrders(s);

  let selected = -1;
  let sellArmed = false;
  let drag = null;

  // --- Build DOM ---
  const energyNum = el('span', { class: 'pill-num' });
  const energyPill = el(
    'button',
    { class: 'pill energy-pill', onclick: () => energyDialog() },
    icon('bolt', 22),
    energyNum,
  );
  headerSlot.append(energyPill);

  const ordersEl = el('div', { class: 'orders' });
  const lvlNum = el('span', { class: 'lvl-num' });
  const xpFill = el('div', { class: 'xp-fill' });
  const xpText = el('span', { class: 'xp-text' });
  const levelBar = el(
    'div',
    { class: 'level-bar' },
    el('div', { class: 'lvl-badge' }, icon('star', 22), lvlNum),
    el('div', { class: 'xp-track' }, xpFill, xpText),
  );
  const board = el('div', { class: 'board' });
  const boardWrap = el('div', { class: 'board-wrap' }, board);
  const info = el('div', { class: 'info px-box' });
  root.append(el('div', { class: 'merge' }, ordersEl, levelBar, boardWrap, info));

  const cells = [];
  for (let i = 0; i < N; i++) {
    const [r, c] = rc(i);
    const cell = el('div', { class: 'cell' + ((r + c) % 2 ? ' alt' : '') });
    cells.push(cell);
    board.append(cell);
  }

  // --- Rendering ---
  let wanted = new Set();

  function renderCell(i) {
    if (i < 0) return;
    const cell = cells[i];
    const it = s.board[i];
    cell.className = 'cell' + ((rc(i)[0] + rc(i)[1]) % 2 ? ' alt' : '');
    if (i === selected) cell.classList.add('sel');
    cell.replaceChildren();
    if (!it) return;
    cell.append(el('img', { class: 'piece', src: spriteSrc(spriteOf(it)), alt: '', draggable: 'false' }));
    if (it.t === 'gen') {
      cell.classList.add('gen');
      cell.append(el('span', { class: 'badge gen-badge' }, icon('bolt', 14)));
    } else if (wanted.has(keyOf(it.c, it.l))) {
      cell.append(el('span', { class: 'badge want-badge' }, icon('heart', 14)));
    } else if (it.l === maxLevel(it.c)) {
      cell.append(el('span', { class: 'badge max-badge' }, icon('star', 14)));
    }
  }

  function renderBoard() {
    wanted = new Set(s.orders.flatMap((o) => o.req.map((r) => keyOf(r.c, r.l))));
    for (let i = 0; i < N; i++) renderCell(i);
  }

  function renderEnergy() {
    energyNum.textContent = `${s.energy}/${ENERGY_MAX}`;
    energyPill.classList.toggle('empty', s.energy <= 0);
  }

  function renderLevel() {
    const need = xpForLevel(s.level);
    lvlNum.textContent = s.level;
    xpFill.style.width = Math.min(100, (s.xp / need) * 100) + '%';
    xpText.textContent = `${s.xp}/${need} xp`;
  }

  function renderOrders() {
    const counts = boardCounts(s);
    ordersEl.replaceChildren(
      ...s.orders.map((o) => {
        const ready = orderReady(o, counts);
        const used = new Map();
        const reqs = o.req.map((r) => {
          const k = keyOf(r.c, r.l);
          const nth = (used.get(k) || 0) + 1;
          used.set(k, nth);
          const have = (counts.get(k) || 0) >= nth;
          return el(
            'div',
            { class: 'req' + (have ? ' have' : '') },
            icon(itemSprite(r.c, r.l), 32),
            have ? icon('check', 16, 'req-check') : null,
          );
        });
        const card = el(
          'button',
          { class: 'order px-box' + (ready ? ' ready' : ''), onclick: () => (ready ? serve(o, card) : orderHint(o)) },
          el(
            'div',
            { class: 'order-top' },
            el('div', { class: 'order-cust' }, icon(CUSTOMERS[o.cust].sprite, 30)),
            el('div', { class: 'order-reqs' }, reqs),
          ),
          ready
            ? el('div', { class: 'order-foot serve' }, 'Serve!')
            : el('div', { class: 'order-foot' }, icon('coin', 16), String(o.coins)),
        );
        if (o.fresh) {
          card.classList.add('enter');
          delete o.fresh;
        }
        return card;
      }),
    );
  }

  function chainPreview(c) {
    const disc = s.discovered[c] || 0;
    return el(
      'div',
      { class: 'chain' },
      CHAINS[c].items.map((item, idx) => icon(idx < disc ? item.id : 'question', 18, idx < disc ? '' : 'unknown')),
    );
  }

  function renderInfo() {
    const it = selected >= 0 ? s.board[selected] : null;
    if (!it) {
      info.replaceChildren(
        el(
          'div',
          { class: 'info-hint' },
          'Tap a ',
          icon('bolt', 16),
          ' generator to cook. Drag two matching items together to merge!',
        ),
      );
      return;
    }
    if (it.t === 'gen') {
      info.replaceChildren(
        el('div', { class: 'info-icon' }, icon(CHAINS[it.c].gen, 40)),
        el(
          'div',
          { class: 'info-text' },
          el('div', { class: 'info-name' }, CHAINS[it.c].genName),
          el('div', { class: 'info-sub' }, 'Tap to cook! Uses 1 ', icon('bolt', 12)),
          chainPreview(it.c),
        ),
      );
      return;
    }
    const value = sellValue(it.l);
    const sellBtn = el(
      'button',
      {
        class: 'px-btn pink sell',
        onclick: () => {
          if (it.l >= 3 && !sellArmed) {
            sellArmed = true;
            sellBtn.replaceChildren('Sure?');
            return;
          }
          sell(selected);
        },
      },
      'Sell ',
      icon('coin', 16),
      String(value),
    );
    info.replaceChildren(
      el('div', { class: 'info-icon' }, icon(itemSprite(it.c, it.l), 40)),
      el(
        'div',
        { class: 'info-text' },
        el('div', { class: 'info-name' }, itemName(it.c, it.l)),
        el(
          'div',
          { class: 'info-sub' },
          `Level ${it.l} of ${maxLevel(it.c)}` + (it.l === maxLevel(it.c) ? ' · max!' : ''),
        ),
        chainPreview(it.c),
      ),
      sellBtn,
    );
  }

  function renderAll() {
    renderBoard();
    renderEnergy();
    renderLevel();
    renderOrders();
    renderInfo();
  }

  // Board-changing events also change which orders are ready.
  function afterBoardChange() {
    placePending();
    renderBoard();
    renderOrders();
    renderInfo();
    save.persist();
  }

  // --- Little animations ---
  function anim(i, cls) {
    const cell = cells[i];
    cell.classList.remove(cls);
    void cell.offsetWidth;
    cell.classList.add(cls);
    setTimeout(() => cell.classList.remove(cls), 450);
  }

  function sparkle(i) {
    const sp = icon('sparkle', 32, 'sparkle');
    cells[i].append(sp);
    setTimeout(() => sp.remove(), 600);
  }

  function flyFrom(from, to) {
    const a = cells[from].getBoundingClientRect();
    const b = cells[to].getBoundingClientRect();
    const piece = cells[to].querySelector('.piece');
    if (!piece) return;
    cells[to].classList.add('flying');
    piece
      .animate(
        [
          { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(0.4)` },
          { transform: 'translate(0,0) scale(1.15)', offset: 0.8 },
          { transform: 'translate(0,0) scale(1)' },
        ],
        { duration: 320, easing: 'ease-out' },
      )
      .finished.then(() => cells[to].classList.remove('flying'))
      .catch(() => {});
  }

  // --- Game actions ---
  function select(i) {
    const prev = selected;
    selected = i;
    sellArmed = false;
    if (prev !== i) renderCell(prev);
    renderCell(i);
    renderInfo();
  }

  function discover(c, l, i) {
    if (l <= (s.discovered[c] || 0)) return;
    s.discovered[c] = l;
    if (l === 1) return;
    const bonus = l * 5;
    save.addCoins(bonus);
    sfx.discover();
    toast(`New: ${itemName(c, l)}! +${bonus}`, itemSprite(c, l));
    if (i >= 0) {
      sparkle(i);
      flyCoins(cells[i].getBoundingClientRect(), 3);
    }
  }

  function produce(gi) {
    syncEnergy(s);
    if (s.energy <= 0) {
      sfx.error();
      anim(gi, 'shake');
      energyDialog();
      return;
    }
    const to = nearestEmpty(s, gi);
    if (to < 0) {
      sfx.error();
      anim(gi, 'shake');
      toast('Board is full! Merge or sell something');
      return;
    }
    s.energy--;
    const c = s.board[gi].c;
    const l = Math.random() < 0.12 ? 2 : 1;
    s.board[to] = { t: 'item', c, l };
    sfx.pop();
    anim(gi, 'squish');
    afterBoardChange();
    renderEnergy();
    flyFrom(gi, to);
    discover(c, l, to);
  }

  function tap(i) {
    const it = s.board[i];
    if (!it) {
      select(-1);
      return;
    }
    select(i);
    if (it.t === 'gen') produce(i);
    else sfx.tap();
  }

  function drop(a, b) {
    const A = s.board[a];
    const B = s.board[b];
    if (!A) return;
    if (B && A.t === 'item' && B.t === 'item' && A.c === B.c && A.l === B.l) {
      if (A.l >= maxLevel(A.c)) {
        toast('Already max level!', 'star');
      } else {
        s.board[a] = null;
        s.board[b] = { t: 'item', c: A.c, l: A.l + 1 };
        selected = b;
        sellArmed = false;
        sfx.merge(A.l + 1);
        afterBoardChange();
        anim(b, 'pop');
        sparkle(b);
        discover(A.c, A.l + 1, b);
        addXP(1);
        return;
      }
    }
    // Move or swap
    s.board[a] = B || null;
    s.board[b] = A;
    selected = b;
    sellArmed = false;
    sfx.tap();
    afterBoardChange();
    anim(b, 'pop');
  }

  function sell(i) {
    const it = s.board[i];
    if (!it || it.t !== 'item') return;
    const value = sellValue(it.l);
    const rect = cells[i].getBoundingClientRect();
    s.board[i] = null;
    selected = -1;
    save.addCoins(value);
    sfx.coin();
    flyCoins(rect, Math.min(5, value));
    afterBoardChange();
  }

  function orderHint(o) {
    sfx.tap();
    const names = o.req.map((r) => itemName(r.c, r.l)).join(' + ');
    toast(`${CUSTOMERS[o.cust].name} wants ${names}`, CUSTOMERS[o.cust].sprite);
  }

  function serve(o, card) {
    const counts = boardCounts(s);
    if (!orderReady(o, counts)) return;
    for (const r of o.req) {
      let idx = -1;
      for (let i = 0; i < N; i++) {
        const it = s.board[i];
        if (it && it.t === 'item' && it.c === r.c && it.l === r.l && (idx < 0 || idx === selected)) idx = i;
      }
      if (idx === selected) selected = -1;
      s.board[idx] = null;
    }
    const rect = card.getBoundingClientRect();
    s.orders = s.orders.filter((x) => x !== o);
    const fresh = makeOrder(s);
    fresh.fresh = true;
    s.orders.push(fresh);
    save.addCoins(o.coins);
    sfx.coin();
    flyCoins(rect, Math.ceil(o.coins / 6) + 2);
    afterBoardChange();
    addXP(o.xp);
  }

  function addXP(n) {
    s.xp += n;
    const ups = [];
    while (s.xp >= xpForLevel(s.level)) {
      s.xp -= xpForLevel(s.level);
      s.level++;
      ups.push(s.level);
    }
    renderLevel();
    if (ups.length) levelUp(ups[ups.length - 1]);
    save.persist();
  }

  function levelUp(level) {
    const bonus = level * 10;
    save.addCoins(bonus);
    s.energy = Math.max(s.energy, ENERGY_MAX);
    syncEnergy(s);
    const unlocked = CHAIN_IDS.filter((id) => CHAINS[id].unlock > 1 && CHAINS[id].unlock <= level && !hasGen(id));
    for (const id of unlocked) placeGen(s, id);
    afterBoardChange();
    renderEnergy();
    sfx.levelup();
    const extra = unlocked.length ? ` New: ${unlocked.map((id) => CHAINS[id].genName).join(', ')}!` : '';
    confirmBox(`Level ${level}!`, `+${bonus} coins and full energy.${extra}`, 'Yay!', null);
  }

  function hasGen(id) {
    return s.board.some((it) => it && it.t === 'gen' && it.c === id) || s.pendingGens.includes(id);
  }

  function placePending() {
    for (const id of [...s.pendingGens]) {
      if (placeGen(s, id) >= 0) toast(`${CHAINS[id].genName} arrived!`, CHAINS[id].gen);
    }
  }

  async function energyDialog() {
    syncEnergy(s);
    renderEnergy();
    if (s.energy >= ENERGY_MAX) {
      toast('Energy is full!', 'bolt');
      return;
    }
    const secs = Math.ceil((ENERGY_REGEN_MS - (Date.now() - s.energyAt)) / 1000);
    const ok = await confirmBox(
      s.energy <= 0 ? 'Out of energy!' : 'Need energy?',
      `You get +1 every ${ENERGY_REGEN_MS / 1000}s (next in ${secs}s). Refill to ${ENERGY_MAX} for ${REFILL_COST} coins?`,
      `Refill (${REFILL_COST})`,
      'Not now',
    );
    if (!ok) return;
    if (!save.spend(REFILL_COST)) {
      sfx.error();
      toast('Not enough coins', 'coin');
      return;
    }
    s.energy = ENERGY_MAX;
    s.energyAt = Date.now();
    sfx.levelup();
    renderEnergy();
    save.persist();
  }

  // --- Touch / drag handling ---
  function cellAt(x, y) {
    const r = board.getBoundingClientRect();
    const col = Math.floor(((x - r.left) / r.width) * COLS);
    const row = Math.floor(((y - r.top) / r.height) * ROWS);
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return -1;
    return row * COLS + col;
  }

  function startDrag(x, y) {
    const it = s.board[drag.from];
    const size = cells[drag.from].getBoundingClientRect().width * 1.25;
    drag.ghost = el('img', { class: 'ghost', src: spriteSrc(spriteOf(it)), alt: '', draggable: 'false' });
    drag.ghost.style.width = drag.ghost.style.height = size + 'px';
    drag.size = size;
    document.body.append(drag.ghost);
    cells[drag.from].classList.add('lifting');
    drag.active = true;
    select(drag.from);
    cells[drag.from].classList.add('lifting');
    moveGhost(x, y);
  }

  function moveGhost(x, y) {
    drag.ghost.style.transform = `translate(${x - drag.size / 2}px, ${y - drag.size * 0.7}px)`;
  }

  function endDrag() {
    if (!drag) return;
    drag.ghost?.remove();
    if (drag.over >= 0) cells[drag.over].classList.remove('over');
    cells[drag.from].classList.remove('lifting');
    drag = null;
  }

  board.addEventListener('pointerdown', (e) => {
    if (drag) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    drag = { from: i, x: e.clientX, y: e.clientY, id: e.pointerId, active: false, ghost: null, over: -1 };
    try {
      board.setPointerCapture(e.pointerId);
    } catch {}
  });

  board.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      if (!s.board[drag.from]) return;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      startDrag(e.clientX, e.clientY);
    }
    moveGhost(e.clientX, e.clientY);
    const over = cellAt(e.clientX, e.clientY);
    if (over !== drag.over) {
      if (drag.over >= 0) cells[drag.over].classList.remove('over');
      drag.over = over;
      if (over >= 0 && over !== drag.from) cells[over].classList.add('over');
    }
  });

  board.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    endDrag();
    if (!d.active) {
      tap(d.from);
      return;
    }
    const to = cellAt(e.clientX, e.clientY);
    if (to >= 0 && to !== d.from) drop(d.from, to);
  });

  board.addEventListener('pointercancel', () => endDrag());

  // --- Layout: fit the board into whatever space the phone gives us ---
  function layout() {
    const w = boardWrap.clientWidth - 12;
    const h = boardWrap.clientHeight - 12;
    const size = Math.max(24, Math.floor(Math.min(w / COLS, h / ROWS)));
    board.style.setProperty('--cell', size + 'px');
  }
  const ro = new ResizeObserver(layout);
  ro.observe(boardWrap);
  layout();

  // --- Energy ticking ---
  const tick = setInterval(() => {
    const before = s.energy;
    syncEnergy(s);
    if (s.energy !== before) {
      renderEnergy();
      save.persist();
    }
  }, 1000);

  placePending();
  renderAll();
  save.persist();

  return () => {
    clearInterval(tick);
    ro.disconnect();
    endDrag();
    save.flush();
  };
}
