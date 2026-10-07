// Shared save data: coins (used by every game), settings, and one slot per game.
//
// Saving is belt-and braces, because iPhones write web storage to disk lazily and can lose
// the last few moves if the app is closed right away:
//  - every change is written to localStorage immediately (no delay),
//  - a second copy goes into IndexedDB (a separate on-device database),
//  - on launch we load whichever copy is newer,
//  - we ask the browser to keep our storage permanently,
//  - players can export/import a backup code (see exportBackup / importBackup).

const KEY = 'cozy-arcade-save-v1';
const DB_NAME = 'cozy-arcade';
const STORE = 'kv';

function defaults() {
  return { version: 1, savedAt: 0, coins: 50, settings: { sound: true, haptics: true }, games: {} };
}

function normalise(raw) {
  return { ...defaults(), ...raw, settings: { ...defaults().settings, ...(raw.settings || {}) } };
}

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// ---- IndexedDB mirror (tiny promise wrapper) ----
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function readIDB() {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        try {
          resolve(req.result ? normalise(JSON.parse(req.result)) : null);
        } catch {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// The IndexedDB copy is written at most twice a second (the latest state always wins).
let idbTimer = null;
let idbPending = null;
function writeIDB(json) {
  idbPending = json;
  if (idbTimer) return;
  idbTimer = setTimeout(() => {
    idbTimer = null;
    writeIDBNow(idbPending);
  }, 500);
}

async function writeIDBNow(json) {
  const d = await db();
  if (!d) return;
  try {
    d.transaction(STORE, 'readwrite').objectStore(STORE).put(json, KEY);
  } catch {
    // ignore; localStorage still has it
  }
}

const data = readLocal() || defaults();
const listeners = new Set();
let queued = false;

function persistNow() {
  queued = false;
  data.savedAt = Date.now();
  const json = JSON.stringify(data);
  try {
    localStorage.setItem(KEY, json);
  } catch {
    // Storage full or blocked (private mode). IndexedDB may still work.
  }
  writeIDB(json);
}

function emit() {
  listeners.forEach((fn) => fn(data));
}

// Resolves once the newest save (localStorage or IndexedDB) is loaded. Await before mounting games.
export const ready = (async () => {
  try {
    navigator.storage?.persist?.();
  } catch {}
  const fromIDB = await readIDB();
  if (fromIDB && fromIDB.savedAt > (data.savedAt || 0)) {
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, fromIDB);
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {}
  } else if (data.savedAt) {
    writeIDB(JSON.stringify(data));
  }
})();

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
  // Saves right after the current bit of code finishes (several changes in a row = one write).
  persist() {
    if (queued) return;
    queued = true;
    queueMicrotask(persistNow);
  },
  flush: persistNow,
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  exportBackup() {
    persistNow();
    return 'COZY1:' + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  },
  // Returns true on success. The page should reload afterwards.
  importBackup(code) {
    try {
      const text = code.trim().replace(/^COZY1:/, '');
      const parsed = normalise(JSON.parse(decodeURIComponent(escape(atob(text)))));
      if (typeof parsed.coins !== 'number' || typeof parsed.games !== 'object') return false;
      for (const k of Object.keys(data)) delete data[k];
      Object.assign(data, parsed);
      persistNow();
      return true;
    } catch {
      return false;
    }
  },
};

// Make sure nothing is lost when the app is closed or sent to the background.
function persistAll() {
  persistNow();
  clearTimeout(idbTimer);
  idbTimer = null;
  writeIDBNow(JSON.stringify(data));
}
addEventListener('pagehide', persistAll);
addEventListener('freeze', persistAll);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistAll();
});
