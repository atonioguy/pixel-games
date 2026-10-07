// Merge Kitchen: tap generators to make ingredients, drag matching items together to
// merge them into better dishes, cook ingredients from different generators together in
// appliances, and serve customers' orders for coins.
import { save } from '../../state.js';
import {
  el,
  icon,
  spriteSrc,
  toast,
  confirmBox,
  flyCoins,
  burst,
  ring,
  floatText,
  thump,
  center,
  sheet,
} from '../../ui.js';
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
  LEVELUP_ENERGY,
  GEN_HOME,
  STARTER,
  APPLIANCES,
  APP_IDS,
  APP_HOME,
  RECIPES,
  RECIPE_IDS,
  xpForLevel,
  orderValue,
  sellValue,
  dishValue,
  dishXP,
} from './data.js';

const N = COLS * ROWS;
const ORDER_SLOTS = 3;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const keyOf = (c, l) => c + ':' + l;
const maxLevel = (c) => CHAINS[c].items.length;
const itemSprite = (c, l) => CHAINS[c].items[l - 1].id;
const itemName = (c, l) => CHAINS[c].items[l - 1].name;

// Board things: {t:'gen',c} generator, {t:'app',a,load,cook,out} appliance,
// {t:'item',c,l} ingredient, {t:'dish',d} cooked dish.
function spriteOf(it) {
  if (it.t === 'gen') return CHAINS[it.c].gen;
  if (it.t === 'app') return APPLIANCES[it.a].sprite;
  if (it.t === 'dish') return RECIPES[it.d].sprite;
  return itemSprite(it.c, it.l);
}
const isServable = (it) => it && (it.t === 'item' || it.t === 'dish');
const itemKey = (it) => (it.t === 'dish' ? 'd:' + it.d : keyOf(it.c, it.l));

// Order requests are either {c, l} (an ingredient) or {d} (a dish).
const reqKey = (r) => (r.d ? 'd:' + r.d : keyOf(r.c, r.l));
const reqSprite = (r) => (r.d ? RECIPES[r.d].sprite : itemSprite(r.c, r.l));
const reqName = (r) => (r.d ? RECIPES[r.d].name : itemName(r.c, r.l));
const reqCoins = (r) => (r.d ? dishValue(r.d) : orderValue(r.l));
const reqXP = (r) => (r.d ? dishXP(r.d) : r.l * 2);
const thingName = (it) => (it.t === 'dish' ? RECIPES[it.d].name : itemName(it.c, it.l));

// ---------- State helpers (pure-ish, operate on the save object) ----------

function newState() {
  const s = {
    board: Array(N).fill(null),
    energy: ENERGY_MAX,
    energyAt: Date.now(),
    level: 1,
    xp: 0,
    discovered: {},
    dishes: {},
    orders: [],
    orderSeq: 0,
    pendingGens: [],
    pendingApps: [],
    energyV2: true,
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

function placeApp(s, id) {
  const [r, c] = APP_HOME[id];
  let i = r * COLS + c;
  if (s.board[i]) i = nearestEmpty(s, i);
  if (i < 0) {
    if (!s.pendingApps.includes(id)) s.pendingApps.push(id);
    return -1;
  }
  s.board[i] = { t: 'app', a: id, load: [], cook: null, out: null };
  s.pendingApps = s.pendingApps.filter((x) => x !== id);
  return i;
}

const hasApp = (s, id) => s.board.some((it) => it && it.t === 'app' && it.a === id) || s.pendingApps.includes(id);

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

// Does `load` (ingredients already in the appliance) fit inside this recipe?
function recipeFits(rec, load) {
  const need = new Map();
  for (const [c, l] of rec.needs) need.set(keyOf(c, l), (need.get(keyOf(c, l)) || 0) + 1);
  for (const x of load) {
    const k = keyOf(x.c, x.l);
    const n = need.get(k) || 0;
    if (!n) return false;
    need.set(k, n - 1);
  }
  return true;
}
const recipeDone = (rec, load) => rec.needs.length === load.length && recipeFits(rec, load);

function randomRequest(s) {
  // Sometimes ask for a cooked dish from an appliance the player has.
  const dishes = RECIPE_IDS.filter((d) => s.board.some((it) => it && it.t === 'app' && it.a === RECIPES[d].app));
  if (dishes.length && Math.random() < 0.4) {
    const req = [{ d: pick(dishes) }];
    if (s.level >= 5 && Math.random() < 0.25) req.push(...randomItems(s, 1));
    return req;
  }
  return randomItems(s, s.level >= 2 && Math.random() < 0.45 ? 2 : 1);
}

function randomItems(s, count) {
  const unlocked = CHAIN_IDS.filter((id) => CHAINS[id].unlock <= s.level);
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
  const current = new Set(s.orders.flatMap((o) => o.req.map(reqKey)));
  let req = randomRequest(s);
  for (let tries = 0; tries < 8 && req.some((r) => current.has(reqKey(r))); tries++) req = randomRequest(s);
  const taken = new Set(s.orders.map((o) => o.cust));
  const free = CUSTOMERS.map((_, i) => i).filter((i) => !taken.has(i));
  return {
    id: ++s.orderSeq,
    cust: pick(free.length ? free : CUSTOMERS.map((_, i) => i)),
    req,
    coins: req.reduce((a, r) => a + reqCoins(r), 0),
    xp: req.reduce((a, r) => a + reqXP(r), 0),
  };
}

function ensureOrders(s) {
  while (s.orders.length < ORDER_SLOTS) s.orders.push(makeOrder(s));
}

function boardCounts(s) {
  const m = new Map();
  for (const it of s.board) if (isServable(it)) m.set(itemKey(it), (m.get(itemKey(it)) || 0) + 1);
  return m;
}

function orderNeeds(o) {
  const need = new Map();
  for (const r of o.req) need.set(reqKey(r), (need.get(reqKey(r)) || 0) + 1);
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
  // Older saves: add fields for appliances.
  s.dishes ||= {};
  s.pendingApps ||= [];
  for (const id of APP_IDS) if (APPLIANCES[id].unlock <= s.level && !hasApp(s, id)) placeApp(s, id);
  syncEnergy(s);
  finishCooking();
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
    } else if (it.t === 'app') {
      cell.classList.add('app');
      if (it.out) {
        cell.classList.add('done');
        cell.append(el('span', { class: 'app-out' }, icon(RECIPES[it.out].sprite, 22)));
      } else if (it.cook) {
        cell.classList.add('cooking');
        cell.append(el('span', { class: 'badge' }, icon('timer', 14)), el('span', { class: 'app-bar' }, el('i')));
        updateBar(i);
      } else if (it.load.length) {
        cell.append(
          el(
            'span',
            { class: 'app-load' },
            it.load.map((x) => icon(itemSprite(x.c, x.l), 12)),
          ),
        );
      }
    } else if (wanted.has(itemKey(it))) {
      cell.classList.add('wanted');
      cell.append(el('span', { class: 'badge want-badge' }, icon('heart', 14)));
    } else if (it.t === 'dish') {
      cell.classList.add('dish');
    } else if (it.l === maxLevel(it.c)) {
      cell.append(el('span', { class: 'badge max-badge' }, icon('star', 14)));
    }
  }

  // Cooking progress bar on an appliance cell
  function updateBar(i) {
    const it = s.board[i];
    const bar = cells[i].querySelector('.app-bar i');
    if (!bar || !it?.cook) return;
    const total = RECIPES[it.cook.d].secs * 1000;
    const left = Math.max(0, it.cook.done - Date.now());
    bar.style.width = (100 * (1 - left / total)).toFixed(1) + '%';
  }

  function renderBoard() {
    wanted = new Set(s.orders.flatMap((o) => o.req.map(reqKey)));
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
      const k = reqKey(r);
      const nth = (used.get(k) || 0) + 1;
      used.set(k, nth);
      const have = (counts.get(k) || 0) >= nth;
      return el(
        'div',
        { class: 'req' + (have ? ' have' : '') + (r.d ? ' is-dish' : '') },
        icon(reqSprite(r), 32),
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
          const i = s.board.findIndex((it) => isServable(it) && itemKey(it) === reqKey(r));
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
      CHAINS[c].items.map((item, idx) => icon(idx < disc ? item.id : 'question', 16, idx < disc ? '' : 'unknown')),
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
    if (it.t === 'app') {
      renderAppInfo(it);
      return;
    }
    const isDish = it.t === 'dish';
    const value = isDish ? Math.round(dishValue(it.d) / 4) : sellValue(it.l);
    const sellBtn = el(
      'button',
      {
        class: 'px-btn pink sell',
        onclick: () => {
          if ((isDish || it.l >= 3) && !sellArmed) {
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
    if (isDish) {
      info.replaceChildren(
        el('div', { class: 'info-icon' }, icon(RECIPES[it.d].sprite, 40)),
        el(
          'div',
          { class: 'info-text' },
          el('div', { class: 'info-name' }, RECIPES[it.d].name),
          el('div', { class: 'info-sub' }, 'A cooked dish! Customers love these.'),
          el(
            'div',
            { class: 'chain' },
            RECIPES[it.d].needs.map(([c, l]) => icon(itemSprite(c, l), 16)),
          ),
        ),
        sellBtn,
      );
      return;
    }
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

  const mmss = (ms) => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };

  function renderAppInfo(it) {
    const app = APPLIANCES[it.a];
    let sub;
    let extra = null;
    let btns = [el('button', { class: 'px-btn small', onclick: () => openRecipes(it.a) }, 'Recipes')];
    if (it.out) {
      sub = `${RECIPES[it.out].name} is ready! Tap to collect.`;
      extra = el('div', { class: 'chain' }, icon(RECIPES[it.out].sprite, 18));
    } else if (it.cook) {
      sub = `${app.verb} ${RECIPES[it.cook.d].name}… ${mmss(it.cook.done - Date.now())}`;
      extra = el('div', { class: 'chain' }, icon(RECIPES[it.cook.d].sprite, 18), icon('timer', 18));
    } else if (it.load.length) {
      sub = 'Add the rest of a recipe!';
      extra = el(
        'div',
        { class: 'chain' },
        it.load.map((x) => icon(itemSprite(x.c, x.l), 18)),
      );
      btns.push(el('button', { class: 'px-btn ghost small', onclick: () => eject(selected) }, 'Take out'));
    } else {
      sub = 'Drag ingredients in to cook!';
    }
    info.replaceChildren(
      el('div', { class: 'info-icon' }, icon(app.sprite, 40)),
      el(
        'div',
        { class: 'info-text' },
        el('div', { class: 'info-name' }, app.name),
        el('div', { class: 'info-sub app-sub' }, sub),
        extra,
      ),
      el('div', { class: 'info-btns' }, btns),
    );
  }

  // Sheet listing what an appliance can make, with ticks for ingredients you already have.
  function openRecipes(appId) {
    sfx.open();
    sheet(
      `${APPLIANCES[appId].name} recipes`,
      () => {
        const counts = boardCounts(s);
        return RECIPE_IDS.filter((d) => RECIPES[d].app === appId).map((d) => {
          const rec = RECIPES[d];
          const used = new Map();
          return el(
            'div',
            { class: 'shop-row' },
            el('div', { class: 'shop-icon recipe-icon' }, icon(rec.sprite, 40)),
            el(
              'div',
              { class: 'shop-text' },
              el('div', { class: 'shop-name' }, rec.name),
              el(
                'div',
                { class: 'shop-sub' },
                rec.needs.map(([c, l]) => {
                  const k = keyOf(c, l);
                  const nth = (used.get(k) || 0) + 1;
                  used.set(k, nth);
                  const have = (counts.get(k) || 0) >= nth;
                  return el(
                    'span',
                    { class: 'need' + (have ? ' have' : '') },
                    icon(itemSprite(c, l), 24),
                    have ? icon('check', 12, 'req-check') : null,
                  );
                }),
              ),
            ),
            el(
              'div',
              { class: 'recipe-meta' },
              el('div', {}, icon('timer', 14), ` ${rec.secs}s`),
              el('div', {}, icon('coin', 14), ` ${dishValue(d)}`),
            ),
          );
        });
      },
      () => sfx.close(),
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
    const img = el('img', { class: 'drag-float', src: spriteSrc(name), alt: '' });
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
    else if (it.t === 'app' && it.out) collect(i);
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
    if (B && B.t === 'app' && A.t === 'item') {
      tryLoad(b, a);
      return;
    }
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
    if (!isServable(it)) return;
    const value = it.t === 'dish' ? Math.round(dishValue(it.d) / 4) : sellValue(it.l);
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
    const names = o.req.map(reqName).join(' + ');
    const dish = o.req.find((r) => r.d);
    const where = dish ? ` (cook it in the ${APPLIANCES[RECIPES[dish.d].app].name})` : '';
    toast(`${CUSTOMERS[o.cust].name} wants ${names}${where}`, CUSTOMERS[o.cust].sprite);
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
        if (isServable(it) && itemKey(it) === reqKey(r) && !usedIdx.has(i)) matches.push(i);
      }
      const idx = matches.includes(prefer) ? prefer : (matches.find((i) => i !== selected) ?? matches[0]);
      usedIdx.add(idx);
      flySprite(reqSprite(r), cells[idx].getBoundingClientRect(), cardRect, n * 60);
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
    syncEnergy(s);
    s.energy = Math.min(ENERGY_MAX, s.energy + LEVELUP_ENERGY);
    const unlocked = CHAIN_IDS.filter((id) => CHAINS[id].unlock > 1 && CHAINS[id].unlock <= level && !hasGen(id));
    for (const id of unlocked) placeGen(s, id);
    const newApps = APP_IDS.filter((id) => APPLIANCES[id].unlock <= level && !hasApp(s, id));
    for (const id of newApps) placeApp(s, id);
    afterBoardChange();
    renderEnergy();
    setTimeout(() => {
      sfx.levelup();
      haptic(3);
      const [x, y] = center(boardWrap);
      burst(x, y, { count: 24, spread: 150, stars: 6, size: 6 });
      ring(x, y, 220, '#ffe08a');
    }, 300);
    const names = [...unlocked.map((id) => CHAINS[id].genName), ...newApps.map((id) => APPLIANCES[id].name)];
    const extra = names.length ? ` New: ${names.join(', ')}!` : '';
    const tip = newApps.length ? ' Drag ingredients into appliances to cook dishes.' : '';
    confirmBox(`Level ${level}!`, `+${bonus} coins and +${LEVELUP_ENERGY} energy.${extra}${tip}`, 'Yay!', null);
  }

  function hasGen(id) {
    return s.board.some((it) => it && it.t === 'gen' && it.c === id) || s.pendingGens.includes(id);
  }

  function placePending() {
    for (const id of [...s.pendingGens]) {
      if (placeGen(s, id) >= 0) toast(`${CHAINS[id].genName} arrived!`, CHAINS[id].gen);
    }
    for (const id of [...s.pendingApps]) {
      if (placeApp(s, id) >= 0) toast(`${APPLIANCES[id].name} arrived!`, APPLIANCES[id].sprite);
    }
  }

  // --- Appliances ---

  // Marks finished cooking as ready to collect. Pure state (safe to call before the DOM exists).
  function finishCooking() {
    const done = [];
    s.board.forEach((it, i) => {
      if (it && it.t === 'app' && it.cook && it.cook.done <= Date.now()) {
        it.out = it.cook.d;
        it.cook = null;
        done.push(i);
      }
    });
    return done;
  }

  function tryLoad(ai, ii) {
    const app = s.board[ai];
    const it = s.board[ii];
    const A = APPLIANCES[app.a];
    if (app.cook || app.out) {
      nope(ii);
      toast(app.out ? `Collect the ${RECIPES[app.out].name} first!` : `The ${A.name} is busy`, A.sprite);
      return;
    }
    const next = [...app.load, { c: it.c, l: it.l }];
    const options = RECIPE_IDS.filter((d) => RECIPES[d].app === app.a && recipeFits(RECIPES[d], next));
    if (!options.length) {
      nope(ii);
      toast(`The ${A.name} can't use ${itemName(it.c, it.l)}`, A.sprite);
      return;
    }
    app.load = next;
    s.board[ii] = null;
    selected = ai;
    sellArmed = false;
    flySprite(itemSprite(it.c, it.l), cells[ii].getBoundingClientRect(), cells[ai].getBoundingClientRect());
    sfx.pop();
    haptic(1);
    const ready = options.find((d) => recipeDone(RECIPES[d], app.load));
    if (ready) {
      app.cook = { d: ready, done: Date.now() + RECIPES[ready].secs * 1000 };
      app.load = [];
      setTimeout(() => sfx.ready(), 150);
      haptic(2);
      toast(`${A.verb} ${RECIPES[ready].name}!`, RECIPES[ready].sprite);
    }
    afterBoardChange();
    anim(ai, 'squish');
  }

  function collect(ai) {
    const app = s.board[ai];
    const to = nearestEmpty(s, ai);
    if (to < 0) {
      nope(ai);
      toast('Board is full! Make some room first');
      return;
    }
    const d = app.out;
    app.out = null;
    s.board[to] = { t: 'dish', d };
    sfx.pop();
    haptic(2);
    afterBoardChange();
    flyFrom(ai, to);
    anim(ai, 'squish');
    if (!s.dishes[d]) {
      s.dishes[d] = true;
      const bonus = 20;
      save.addCoins(bonus);
      setTimeout(() => sfx.discover(), 150);
      toast(`New dish: ${RECIPES[d].name}! +${bonus}`, RECIPES[d].sprite);
      const [x, y] = center(cells[to]);
      burst(x, y, { count: 14, spread: 70, stars: 3 });
    }
  }

  // Gives back ingredients that were put in an appliance.
  function eject(ai) {
    const app = s.board[ai];
    if (!app || app.t !== 'app' || !app.load.length) return;
    while (app.load.length) {
      const to = nearestEmpty(s, ai);
      if (to < 0) {
        toast('No room to take everything out');
        break;
      }
      const x = app.load.pop();
      s.board[to] = { t: 'item', c: x.c, l: x.l };
    }
    sfx.drop();
    afterBoardChange();
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

  // Would the appliance at b accept the ingredient at a right now?
  const canLoad = (a, b) => {
    const A = s.board[a];
    const B = s.board[b];
    if (!A || !B || A.t !== 'item' || B.t !== 'app' || B.cook || B.out) return false;
    const next = [...B.load, { c: A.c, l: A.l }];
    return RECIPE_IDS.some((d) => RECIPES[d].app === B.a && recipeFits(RECIPES[d], next));
  };

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
      { class: 'drag-float drag-ghost' },
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
      if (canMerge(drag.from, i) || canLoad(drag.from, i)) {
        cells[i].classList.add('match');
        drag.matches.push(i);
      }
    }
    // And any orders that want it.
    if (isServable(it)) {
      const k = itemKey(it);
      for (const [id, e] of cardEls) {
        const o = s.orders.find((x) => x.id === id);
        if (o.req.some((r) => reqKey(r) === k)) e.card.classList.add(e.ready ? 'can-drop' : 'wants');
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
        if (canMerge(drag.from, over) || canLoad(drag.from, over)) {
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
    if (o && isServable(it)) {
      const wantsIt = o.req.some((r) => reqKey(r) === itemKey(it));
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
    const size = Math.max(24, Math.floor(Math.min(w / COLS, h / ROWS))) + 'px';
    if (board.style.getPropertyValue('--cell') !== size) board.style.setProperty('--cell', size);
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
    // Appliances: progress bars, and dishes finishing
    const done = finishCooking();
    s.board.forEach((it, i) => it && it.t === 'app' && it.cook && updateBar(i));
    if (done.length) {
      sfx.ready();
      for (const i of done) {
        renderCell(i);
        anim(i, 'jump');
      }
      save.persist();
    }
    const sel = s.board[selected];
    if (sel && sel.t === 'app' && (sel.cook || done.includes(selected))) renderInfo();
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
