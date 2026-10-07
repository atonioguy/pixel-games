// Merge Kitchen: tap generators to make ingredients, drag matching items together to
// merge them into better dishes, and serve customers' orders for coins.
import { save } from '../../state.js';
import { el, icon, spriteSrc, toast, confirmBox, flyCoins, burst, ring, floatText, thump, center } from '../../ui.js';
import { sfx } from '../../audio.js';
import { haptic } from '../../haptics.js';
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
  // Energy was raised to 100: top everyone up once.
  if (!s.energyV2) {
    s.energy = Math.max(s.energy, ENERGY_MAX);
    s.energyAt = Date.now();
    s.energyV2 = true;
  }
  syncEnergy(s);
  ensureOrders(s);

  let selected = -1;
  let sellArmed = false;
  let drag = null;
  let pressed = -1;

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
  const xpTrack = el('div', { class: 'xp-track' }, xpFill, xpText);
  const levelBar = el(
    'div',
    { class: 'level-bar' },
    el('div', { class: 'lvl-badge' }, icon('star', 22), lvlNum),
    xpTrack,
  );
  const board = el('div', { class: 'board' });
  const boardWrap = el('div', { class: 'board-wrap' }, board);
  const info = el('div', { class: 'info px-box' });
  root.append(el('div', { class: 'merge' }, ordersEl, levelBar, boardWrap, info));

  const cells = [];
  for (let i = 0; i < N; i++) {
    const cell = el('div', { class: 'cell' });
    cells.push(cell);
    board.append(cell);
  }

  // --- Rendering ---
  let wanted = new Set();

  function renderCell(i) {
    if (i < 0) return;
    const cell = cells[i];
    const it = s.board[i];
    const [r, c] = rc(i);
    cell.className = 'cell' + ((r + c) % 2 ? ' alt' : '');
    if (i === selected) cell.classList.add('sel');
    cell.replaceChildren();
    if (!it) return;
    cell.append(el('img', { class: 'piece', src: spriteSrc(spriteOf(it)), alt: '', draggable: 'false' }));
    if (it.t === 'gen') {
      cell.classList.add('gen');
      cell.append(el('span', { class: 'badge gen-badge' }, icon('bolt', 14)));
    } else if (wanted.has(keyOf(it.c, it.l))) {
      cell.classList.add('wanted');
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

  // Order cards are kept between renders so they can slide around smoothly.
  const cardEls = new Map(); // order id -> { card, ready }
  let firstOrderRender = true;

  function fillCard(card, o, counts, ready) {
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
    card.className = 'order px-box' + (ready ? ' ready' : '');
    card.replaceChildren(
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
  }

  function renderOrders() {
    const counts = boardCounts(s);
    const before = new Map();
    for (const [id, e] of cardEls) before.set(id, e.card.getBoundingClientRect());
    for (const id of [...cardEls.keys()]) if (!s.orders.some((o) => o.id === id)) cardEls.delete(id);

    // Ready orders slide to the front (left).
    const readyOf = new Map(s.orders.map((o) => [o.id, orderReady(o, counts)]));
    const sorted = [...s.orders].sort((a, b) => readyOf.get(b.id) - readyOf.get(a.id));
    const newlyReady = [];
    const cards = sorted.map((o) => {
      let entry = cardEls.get(o.id);
      const isNew = !entry;
      if (isNew) {
        const card = el('button', { onclick: () => onOrderTap(o.id) });
        card.dataset.id = o.id;
        entry = { card, ready: false };
        cardEls.set(o.id, entry);
      }
      const ready = readyOf.get(o.id);
      if (ready && !entry.ready && !firstOrderRender) newlyReady.push(entry);
      entry.ready = ready;
      fillCard(entry.card, o, counts, ready);
      if (isNew && !firstOrderRender) entry.card.classList.add('enter');
      return entry.card;
    });
    if (cards.some((c, i) => ordersEl.children[i] !== c) || ordersEl.children.length !== cards.length) {
      ordersEl.replaceChildren(...cards);
    }

    // FLIP: animate each card from where it was to where it is now.
    const moved = new Set();
    for (const card of cards) {
      const b = before.get(+card.dataset.id);
      if (!b) continue;
      const dx = b.left - card.getBoundingClientRect().left;
      if (Math.abs(dx) > 1) {
        moved.add(card);
        card.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], {
          duration: 420,
          easing: 'cubic-bezier(.3,1.35,.5,1)',
        });
      }
    }
    if (newlyReady.length) {
      sfx.ready();
      haptic(2);
      for (const e of newlyReady) {
        e.card.animate(
          [
            { transform: 'none' },
            { transform: 'translate(-6px,-8px) rotate(-3deg) scale(1.05)' },
            { transform: 'translate(2px,0) rotate(1.5deg)' },
            { transform: 'none' },
          ],
          { duration: 420, delay: moved.has(e.card) ? 380 : 0, easing: 'ease-out' },
        );
        // The items that complete it do a little jump on the board too.
        const o = s.orders.find((x) => x.id === +e.card.dataset.id);
        for (const r of o.req) {
          const i = s.board.findIndex((it) => it && it.t === 'item' && it.c === r.c && it.l === r.l);
          if (i >= 0) anim(i, 'jump');
        }
      }
    }
    firstOrderRender = false;
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
            sfx.tap();
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
  function anim(i, cls, ms = 450) {
    const cell = cells[i];
    cell.classList.remove(cls);
    void cell.offsetWidth;
    cell.classList.add(cls);
    setTimeout(() => cell.classList.remove(cls), ms);
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
          { transform: 'translate(0,0) scale(1.2)', offset: 0.75 },
          { transform: 'translate(0,0) scale(0.95)', offset: 0.9 },
          { transform: 'translate(0,0) scale(1)' },
        ],
        { duration: 340, easing: 'ease-out' },
      )
      .finished.then(() => {
        cells[to].classList.remove('flying');
        const [x, y] = center(cells[to]);
        burst(x, y, { count: 5, spread: 22, size: 4, stars: 0, colors: CHAINS[s.board[to]?.c]?.colors });
      })
      .catch(() => {});
  }

  // A sprite that flies from one rect to another (used when serving).
  function flySprite(name, from, to, delay = 0) {
    const size = from.width * 0.86;
    const img = el('img', { class: 'ghost', src: spriteSrc(name), alt: '' });
    img.style.width = img.style.height = size + 'px';
    document.body.append(img);
    const sx = from.left + (from.width - size) / 2;
    const sy = from.top + (from.height - size) / 2;
    const ex = to.left + to.width / 2 - size / 2;
    const ey = to.top + to.height / 2 - size / 2;
    img
      .animate(
        [
          { transform: `translate(${sx}px, ${sy}px) scale(1)` },
          { transform: `translate(${(sx + ex) / 2}px, ${Math.min(sy, ey) - 40}px) scale(1.15)`, offset: 0.5 },
          { transform: `translate(${ex}px, ${ey}px) scale(0.5)`, opacity: 0.6 },
        ],
        { duration: 420, delay, easing: 'ease-in-out', fill: 'backwards' },
      )
      .finished.then(() => img.remove())
      .catch(() => img.remove());
  }

  function nope(i) {
    sfx.error();
    haptic(2);
    anim(i, 'shake');
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
    setTimeout(() => sfx.discover(), 150);
    toast(`New: ${itemName(c, l)}! +${bonus}`, itemSprite(c, l));
    if (i >= 0) {
      const [x, y] = center(cells[i]);
      burst(x, y, { count: 14, spread: 70, stars: 3, colors: CHAINS[c].colors });
      flyCoins(cells[i].getBoundingClientRect(), 3);
    }
  }

  function produce(gi) {
    syncEnergy(s);
    if (s.energy <= 0) {
      nope(gi);
      energyDialog();
      return;
    }
    const to = nearestEmpty(s, gi);
    if (to < 0) {
      nope(gi);
      toast('Board is full! Merge or sell something');
      return;
    }
    s.energy--;
    const c = s.board[gi].c;
    const l = Math.random() < 0.12 ? 2 : 1;
    s.board[to] = { t: 'item', c, l };
    sfx.pop();
    haptic(1);
    anim(gi, 'squish');
    afterBoardChange();
    renderEnergy();
    energyPill.classList.remove('bump');
    void energyPill.offsetWidth;
    energyPill.classList.add('bump');
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
    else {
      sfx.tap();
      haptic(1);
      anim(i, 'boing');
    }
  }

  function drop(a, b) {
    const A = s.board[a];
    const B = s.board[b];
    if (!A) return;
    if (B && A.t === 'item' && B.t === 'item' && A.c === B.c && A.l === B.l) {
      if (A.l >= maxLevel(A.c)) {
        toast('Already max level!', 'star');
        nope(b);
        return;
      }
      s.board[a] = null;
      s.board[b] = { t: 'item', c: A.c, l: A.l + 1 };
      selected = b;
      sellArmed = false;
      const top = A.l + 1 === maxLevel(A.c);
      sfx.merge(A.l + 1);
      haptic(top ? 3 : 2);
      afterBoardChange();
      anim(b, 'pop');
      const [x, y] = center(cells[b]);
      ring(x, y, cells[b].offsetWidth * 1.4);
      burst(x, y, { count: top ? 18 : 10, spread: top ? 80 : 50, stars: top ? 4 : 1, colors: CHAINS[A.c].colors });
      thump(board, top ? 4 : 2);
      discover(A.c, A.l + 1, b);
      addXP(1);
      return;
    }
    // Move or swap
    s.board[a] = B || null;
    s.board[b] = A;
    selected = b;
    sellArmed = false;
    sfx.drop();
    haptic(1);
    afterBoardChange();
    anim(b, 'land');
    if (B) anim(a, 'land');
  }

  function sell(i) {
    const it = s.board[i];
    if (!it || it.t !== 'item') return;
    const value = sellValue(it.l);
    const rect = cells[i].getBoundingClientRect();
    const [x, y] = center(cells[i]);
    s.board[i] = null;
    selected = -1;
    save.addCoins(value);
    sfx.coin();
    haptic(1);
    floatText(x, y, `+${value}`, { iconName: 'coin' });
    burst(x, y, { count: 6, spread: 30, stars: 0 });
    flyCoins(rect, Math.min(5, value));
    afterBoardChange();
  }

  function onOrderTap(id) {
    const o = s.orders.find((x) => x.id === id);
    if (!o) return;
    if (orderReady(o, boardCounts(s))) serve(o);
    else orderHint(o);
  }

  function orderHint(o) {
    sfx.tap();
    const card = cardEls.get(o.id)?.card;
    card?.animate(
      [
        { transform: 'rotate(0)' },
        { transform: 'rotate(-2deg)' },
        { transform: 'rotate(2deg)' },
        { transform: 'rotate(0)' },
      ],
      { duration: 260 },
    );
    const names = o.req.map((r) => itemName(r.c, r.l)).join(' + ');
    toast(`${CUSTOMERS[o.cust].name} wants ${names}`, CUSTOMERS[o.cust].sprite);
  }

  // prefer: a board index to use first (e.g. the item that was dragged onto the order)
  function serve(o, prefer = -1) {
    if (!orderReady(o, boardCounts(s))) return;
    const card = cardEls.get(o.id)?.card;
    const cardRect = card.getBoundingClientRect();
    const usedIdx = new Set();
    o.req.forEach((r, n) => {
      const matches = [];
      for (let i = 0; i < N; i++) {
        const it = s.board[i];
        if (it && it.t === 'item' && it.c === r.c && it.l === r.l && !usedIdx.has(i)) matches.push(i);
      }
      const idx = matches.includes(prefer) ? prefer : (matches.find((i) => i !== selected) ?? matches[0]);
      usedIdx.add(idx);
      flySprite(itemSprite(r.c, r.l), cells[idx].getBoundingClientRect(), cardRect, n * 60);
    });
    for (const idx of usedIdx) {
      if (idx === selected) selected = -1;
      s.board[idx] = null;
    }

    // The served card hops up and floats away.
    const leaving = card.cloneNode(true);
    leaving.style.cssText = `position:fixed;left:${cardRect.left}px;top:${cardRect.top}px;width:${cardRect.width}px;height:${cardRect.height}px;margin:0;z-index:30;pointer-events:none`;
    document.body.append(leaving);
    leaving.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: 'translateY(-8px) scale(1.08)', opacity: 1, offset: 0.35 },
        { transform: 'translateY(-50px) scale(0.6)', opacity: 0 },
      ],
      { duration: 520, delay: 200, easing: 'ease-in', fill: 'backwards' },
    ).onfinish = () => leaving.remove();

    s.orders = s.orders.filter((x) => x !== o);
    s.orders.push(makeOrder(s));
    save.addCoins(o.coins);
    sfx.serve();
    haptic(3);
    const cx = cardRect.left + cardRect.width / 2;
    const cy = cardRect.top + cardRect.height / 2;
    setTimeout(() => {
      burst(cx, cy, { count: 14, spread: 60, stars: 3 });
      floatText(cx, cy, `+${o.coins}`, { iconName: 'coin' });
      flyCoins(cardRect, Math.ceil(o.coins / 6) + 2);
    }, 380);
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
    xpTrack.classList.remove('flash');
    void xpTrack.offsetWidth;
    xpTrack.classList.add('flash');
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
    setTimeout(() => {
      sfx.levelup();
      haptic(3);
      const [x, y] = center(boardWrap);
      burst(x, y, { count: 24, spread: 150, stars: 6, size: 6 });
      ring(x, y, 220, '#ffe08a');
    }, 300);
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
    const next = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
    const ok = await confirmBox(
      s.energy <= 0 ? 'Out of energy!' : 'Need energy?',
      `You get +1 every ${ENERGY_REGEN_MS / 60000} min (next in ${next}). Refill to ${ENERGY_MAX} for ${REFILL_COST} coins?`,
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
    haptic(3);
    renderEnergy();
    const [x, y] = center(energyPill);
    burst(x, y, { count: 10, spread: 40, stars: 2, colors: ['#ffe08a', '#f5b94a', '#fffaf3'] });
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

  function orderAt(x, y) {
    for (const [id, e] of cardEls) {
      const r = e.card.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return s.orders.find((o) => o.id === id);
    }
    return null;
  }

  const canMerge = (a, b) => {
    const A = s.board[a];
    const B = s.board[b];
    return A && B && a !== b && A.t === 'item' && B.t === 'item' && A.c === B.c && A.l === B.l && A.l < maxLevel(A.c);
  };

  function release() {
    if (pressed >= 0) cells[pressed].classList.remove('press');
    pressed = -1;
  }

  function startDrag(x, y) {
    const it = s.board[drag.from];
    const size = cells[drag.from].getBoundingClientRect().width * 1.25;
    drag.ghost = el(
      'div',
      { class: 'ghost drag-ghost' },
      el('img', { src: spriteSrc(spriteOf(it)), alt: '', draggable: 'false' }),
    );
    drag.ghost.style.width = drag.ghost.style.height = size + 'px';
    drag.size = size;
    document.body.append(drag.ghost);
    drag.active = true;
    release();
    select(drag.from);
    cells[drag.from].classList.add('lifting');
    sfx.pick();
    haptic(1);
    // Glow every item it could merge with.
    drag.matches = [];
    for (let i = 0; i < N; i++) {
      if (canMerge(drag.from, i)) {
        cells[i].classList.add('match');
        drag.matches.push(i);
      }
    }
    // And any orders that want it.
    if (it.t === 'item') {
      const k = keyOf(it.c, it.l);
      for (const [id, e] of cardEls) {
        const o = s.orders.find((x) => x.id === id);
        if (o.req.some((r) => keyOf(r.c, r.l) === k)) e.card.classList.add(e.ready ? 'can-drop' : 'wants');
      }
    }
    moveGhost(x, y);
  }

  function moveGhost(x, y) {
    drag.ghost.style.transform = `translate(${x - drag.size / 2}px, ${y - drag.size * 0.75}px)`;
  }

  function clearOver() {
    if (drag.over >= 0) cells[drag.over].classList.remove('over', 'merge');
    drag.over = -1;
    drag.overCard?.classList.remove('hover');
    drag.overCard = null;
  }

  function endDrag() {
    release();
    if (!drag) return;
    drag.ghost?.remove();
    clearOver();
    cells[drag.from].classList.remove('lifting');
    for (const i of drag.matches || []) cells[i].classList.remove('match');
    for (const e of cardEls.values()) e.card.classList.remove('can-drop', 'wants', 'hover');
    drag = null;
  }

  board.addEventListener('pointerdown', (e) => {
    if (drag) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    drag = { from: i, x: e.clientX, y: e.clientY, id: e.pointerId, active: false, ghost: null, over: -1 };
    if (s.board[i]) {
      pressed = i;
      cells[i].classList.add('press');
    }
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
    const card = over < 0 ? orderAt(e.clientX, e.clientY) : null;
    const cardEl = card ? cardEls.get(card.id).card : null;
    if (over !== drag.over || cardEl !== drag.overCard) {
      clearOver();
      if (over >= 0 && over !== drag.from) {
        drag.over = over;
        cells[over].classList.add('over');
        if (canMerge(drag.from, over)) {
          cells[over].classList.add('merge');
          sfx.press();
        }
      }
      if (cardEl) {
        drag.overCard = cardEl;
        cardEl.classList.add('hover');
      }
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
    if (to >= 0 && to !== d.from) {
      drop(d.from, to);
      return;
    }
    // Dropped on an order card?
    const o = to < 0 ? orderAt(e.clientX, e.clientY) : null;
    const it = s.board[d.from];
    if (o && it && it.t === 'item') {
      const wantsIt = o.req.some((r) => r.c === it.c && r.l === it.l);
      if (wantsIt && orderReady(o, boardCounts(s))) serve(o, d.from);
      else {
        nope(d.from);
        if (wantsIt) orderHint(o);
        else toast(`${CUSTOMERS[o.cust].name} doesn't want that`, CUSTOMERS[o.cust].sprite);
      }
      return;
    }
    sfx.drop();
    anim(d.from, 'land');
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
