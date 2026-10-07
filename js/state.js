// Shared save data: coins (used by every game), settings, and one slot per game.
// Saved to localStorage on the device. Added-to-home-screen apps on iPhone keep this storage.

const KEY = 'cozy-arcade-save-v1';

function defaults() {
  return { version: 1, coins: 50, settings: { sound: true }, games: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw);
    return { ...defaults(), ...data, settings: { ...defaults().settings, ...data.settings } };
  } catch {
    return defaults();
  }
}

const data = load();
const listeners = new Set();
let timer = null;

function persistNow() {
  clearTimeout(timer);
  timer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked (private mode). The game still works, it just won't remember.
  }
}

function emit() {
  listeners.forEach((fn) => fn(data));
}

export const save = {
  get coins() {
    return data.coins;
  },
  get settings() {
    return data.settings;
  },
  addCoins(n) {
    data.coins = Math.max(0, Math.round(data.coins + n));
    this.persist();
    emit();
  },
  // Returns true if the player could afford it.
  spend(n) {
    if (data.coins < n) return false;
    data.coins -= n;
    this.persist();
    emit();
    return true;
  },
  // Each game gets its own object to store whatever it wants.
  game(id, makeDefault) {
    if (!data.games[id]) data.games[id] = makeDefault ? makeDefault() : {};
    return data.games[id];
  },
  resetGame(id) {
    delete data.games[id];
    persistNow();
  },
  setSetting(k, v) {
    data.settings[k] = v;
    this.persist();
    emit();
  },
  persist() {
    if (!timer) timer = setTimeout(persistNow, 250);
  },
  flush: persistNow,
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// Make sure nothing is lost when the app is closed or sent to the background.
addEventListener('pagehide', persistNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistNow();
});
