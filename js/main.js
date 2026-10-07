// App shell: top bar with shared coins, the game menu, and switching between games.
import { save, ready as saveReady } from './state.js';
import { el, icon, toast, sheet } from './ui.js';
import { sfx, unlockAudio } from './audio.js';
import { haptic } from './haptics.js';
import { tileURL } from './pixel.js';
import { WALLPAPER, WOOD } from './sprites.js';

// Shown on the menu so it's easy to tell which version is running. Bump with sw.js VERSION.
const APP_VERSION = 8;

const GAMES = [
  {
    id: 'merge',
    name: 'Merge Kitchen',
    desc: 'Merge ingredients into yummy dishes',
    icon: 'croissant',
    color: 'peach',
    load: () => import('./games/merge/merge.js'),
  },
  {
    id: 'aquarium',
    name: 'Fishy Tank',
    desc: 'Collect fish & decorate your tank',
    icon: 'f_whale',
    color: 'blue',
    load: () => import('./games/aquarium/aquarium.js'),
  },
  {
    id: 'cafe',
    name: 'Cozy Café',
    desc: 'Run & decorate your own café',
    icon: 'cafecup',
    color: 'mint',
    load: () => import('./games/cafe/cafe.js'),
  },
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

function toggleButton(setting, iconName, label) {
  const b = el('button', { class: 'icon-btn', 'aria-label': label });
  const paint = () => b.replaceChildren(icon(iconName, 24, save.settings[setting] ? '' : 'muted'));
  paint();
  b.addEventListener('click', () => {
    save.setSetting(setting, !save.settings[setting]);
    paint();
    sfx.tap();
    haptic(2);
  });
  return b;
}

// Every button gets a soft click + a haptic tick.
document.addEventListener(
  'click',
  (e) => {
    if (e.target.closest?.('button')) haptic(1);
  },
  true,
);

// Buttons squish down while pressed, for visual "feel".
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest?.('button');
  if (!b) return;
  b.classList.add('pressed');
  const up = () => {
    b.classList.remove('pressed');
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
});

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
  setTop(
    el('div', { class: 'brand' }, icon('heart', 22), 'Cozy Arcade'),
    el(
      'div',
      { class: 'toggles' },
      toggleButton('haptics', 'vibe', 'Vibration'),
      toggleButton('sound', 'speaker', 'Sound'),
    ),
  );

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
      el(
        'div',
        { class: 'menu-foot' },
        el('button', { class: 'px-btn ghost small', onclick: openBackup }, 'Backup & restore'),
        el('div', { class: 'version' }, `version ${APP_VERSION}`),
      ),
    ),
    el('div', { class: 'floor' }),
  );
}

// Lets the player copy their whole save as a code, and paste it back later
// (e.g. before deleting and re-adding the home-screen icon, which wipes app data).
function openBackup() {
  sfx.open();
  sheet('Backup', () => {
    const code = save.exportBackup();
    const out = el('textarea', { class: 'backup-box', readonly: '', rows: 3 }, code);
    const input = el('textarea', { class: 'backup-box', rows: 3, placeholder: 'Paste a backup code here' });
    return [
      el(
        'p',
        { class: 'backup-note' },
        'Copy this code and keep it somewhere safe (like Notes). It has all your coins and progress.',
      ),
      out,
      el(
        'button',
        {
          class: 'px-btn',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(code);
              toast('Backup copied!', 'heart');
            } catch {
              out.focus();
              out.select();
              toast('Select the text and copy it', 'heart');
            }
          },
        },
        'Copy backup code',
      ),
      el('p', { class: 'backup-note' }, 'To restore, paste a code below. This replaces your current progress.'),
      input,
      el(
        'button',
        {
          class: 'px-btn pink',
          onclick: () => {
            if (!input.value.trim()) return;
            if (save.importBackup(input.value)) {
              toast('Restored!', 'heart');
              setTimeout(() => location.reload(), 500);
            } else {
              sfx.error();
              toast("That code didn't work", 'lock');
            }
          },
        },
        'Restore',
      ),
    ];
  });
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
saveReady.then(route);

// Offline support + "Add to Home Screen" app behaviour.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
