// App shell: top bar with shared coins, the game menu, and switching between games.
import { save } from './state.js';
import { el, icon, toast } from './ui.js';
import { sfx, unlockAudio } from './audio.js';
import { tileURL } from './pixel.js';
import { WALLPAPER, WOOD } from './sprites.js';

const GAMES = [
  {
    id: 'merge',
    name: 'Merge Kitchen',
    desc: 'Merge ingredients into yummy dishes',
    icon: 'croissant',
    color: 'peach',
    load: () => import('./games/merge/merge.js'),
  },
  { id: 'aquarium', name: 'Fishy Tank', desc: 'Collect fish & decorate your tank', icon: 'fish', color: 'blue' },
  { id: 'cafe', name: 'Cozy Café', desc: 'Run & decorate your own café', icon: 'cafecup', color: 'mint' },
  { id: 'rhythm', name: 'Beat Battle', desc: 'Tap the arrows to the music', icon: 'note', color: 'lav' },
  { id: 'town', name: 'Pixel Town', desc: 'Make little people & watch them live', icon: 'house', color: 'pink' },
];

const app = document.getElementById('app');
const top = el('header', { id: 'topbar' });
const view = el('main', { id: 'view' });
app.append(top, view);

document.documentElement.style.setProperty('--wallpaper', tileURL(WALLPAPER.rows, WALLPAPER.colors));
document.documentElement.style.setProperty('--wood', tileURL(WOOD.rows, WOOD.colors));

// Wake up audio on the first touch (iPhone requirement).
addEventListener('pointerdown', unlockAudio, { once: true });

// Stop iOS from pinch-zooming or double-tap zooming the game.
document.addEventListener('gesturestart', (e) => e.preventDefault());
let lastTouch = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouch < 300) e.preventDefault();
    lastTouch = now;
  },
  { passive: false },
);

function coinPill() {
  const num = el('span', { class: 'pill-num' }, save.coins.toLocaleString());
  const pill = el('div', { class: 'pill', id: 'coin-pill' }, icon('coin', 22), num);
  const off = save.onChange(() => (num.textContent = save.coins.toLocaleString()));
  pill._cleanup = off;
  return pill;
}

function soundButton() {
  const b = el('button', { class: 'icon-btn', 'aria-label': 'Sound' });
  const paint = () => {
    b.replaceChildren(icon('speaker', 24, save.settings.sound ? '' : 'muted'));
  };
  paint();
  b.addEventListener('click', () => {
    save.setSetting('sound', !save.settings.sound);
    paint();
    sfx.tap();
  });
  return b;
}

let cleanup = null;
let pill = null;

function setTop(left, middle) {
  pill?._cleanup?.();
  pill = coinPill();
  top.replaceChildren(el('div', { class: 'top-left' }, left), el('div', { class: 'top-mid' }, middle), pill);
}

function showMenu() {
  cleanup?.();
  cleanup = null;
  app.dataset.screen = 'menu';
  setTop(el('div', { class: 'brand' }, icon('heart', 22), 'Cozy Arcade'), soundButton());

  const list = el('div', { class: 'game-list' });
  for (const g of GAMES) {
    const ready = !!g.load;
    list.append(
      el(
        'button',
        {
          class: `game-card px-box c-${g.color}` + (ready ? '' : ' locked'),
          onclick: () => {
            if (!ready) {
              sfx.error();
              toast('Coming soon!', 'lock');
              return;
            }
            sfx.tap();
            location.hash = g.id;
          },
        },
        el('div', { class: 'card-icon' }, icon(g.icon, 48)),
        el(
          'div',
          { class: 'card-text' },
          el('div', { class: 'card-name' }, g.name),
          el('div', { class: 'card-desc' }, g.desc),
        ),
        el('div', { class: 'card-tag' }, ready ? 'PLAY' : 'SOON'),
      ),
    );
  }
  view.replaceChildren(
    el(
      'div',
      { class: 'menu' },
      el(
        'div',
        { class: 'sign px-box' },
        el('div', { class: 'sign-title' }, 'Cozy Arcade'),
        el('div', { class: 'sign-sub' }, 'pick a game ♡'),
      ),
      list,
    ),
    el('div', { class: 'floor' }),
  );
}

async function showGame(id) {
  const g = GAMES.find((x) => x.id === id && x.load);
  if (!g) return showMenu();
  cleanup?.();
  cleanup = null;
  app.dataset.screen = id;
  const back = el('button', { class: 'icon-btn back', 'aria-label': 'Back', onclick: () => (location.hash = '') }, '◀');
  const mid = el('div', { class: 'top-slot' });
  setTop(el('div', { class: 'top-left' }, back, el('div', { class: 'game-title' }, g.name)), mid);
  view.replaceChildren(el('div', { class: 'loading' }, 'loading…'));
  const mod = await g.load();
  if (app.dataset.screen !== id) return; // user left while loading
  view.replaceChildren();
  cleanup = mod.mount(view, { headerSlot: mid });
}

function route() {
  const id = location.hash.slice(1);
  if (id) showGame(id);
  else showMenu();
}

addEventListener('hashchange', route);
route();

// Offline support + "Add to Home Screen" app behaviour.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
