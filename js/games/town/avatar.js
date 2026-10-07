// Pixel Town avatars: little 16x20 people built from layers (face, eyes, mouth, hair,
// clothes) with each resident's own colours. Outlines are added automatically.

export const SKINS = ['#ffe3cf', '#f6c7a5', '#e3a882', '#bf8461', '#8f6044'];
export const HAIR_COLORS = [
  '#6e4530',
  '#3d2c2c',
  '#f5cf6b',
  '#f19bb0',
  '#b9a3e3',
  '#8fd3c0',
  '#e2606f',
  '#f4f0ea',
  '#86bfe0',
];
export const CLOTHES_COLORS = [
  '#f19bb0',
  '#86bfe0',
  '#aee0d1',
  '#ffe08a',
  '#d7c6f2',
  '#f39a5b',
  '#e8606f',
  '#fffaf3',
  '#6fb5a3',
];
export const PANTS_COLORS = ['#6b7fb0', '#8f5a3c', '#4a3434', '#e9dede', '#9a7fd1', '#6fae6a'];
export const HAIRS = ['short', 'bob', 'long', 'bun', 'spiky', 'twintails'];
export const EYES = ['dot', 'round', 'happy', 'sleepy', 'wink'];
export const MOUTHS = ['smile', 'open', 'tiny'];
export const OUTFITS = ['tee', 'stripe', 'dress', 'overalls', 'hoodie'];

const W = 16;
const H = 20;

const BASE = [
  '................',
  '................',
  '................',
  '.....SSSSSS.....',
  '...SSSSSSSSSS...',
  '..SSSSSSSSSSSS..',
  '..SSSSSSSSSSSS..',
  '..SSSSSSSSSSSS..',
  '..SSSSSSSSSSSS..',
  '..SSSSSSSSSSSS..',
  '..sSSSSSSSSSSs..',
  '...ssSSSSSSss...',
  '......CCCC......',
  '....CCCCCCCC....',
  '...SCCCCCCCCS...',
  '...SCCCCCCCCS...',
  '....cCCCCCCc....',
  '.....PPPPPP.....',
  '.....PP..PP.....',
  '.....KK..KK.....',
];

// Hair layers: H = hair, h = highlight. Drawn over the face.
const HAIR = {
  short: [
    '',
    '',
    '.....HHHHHH.....',
    '...HHHHHHHHHH...',
    '..HHhHHHHHHHHH..',
    '..HHhHHHHHHHHH..',
    '..HH.HH.HHH.HH..',
    '..H..........H..',
  ],
  bob: [
    '',
    '',
    '.....HHHHHH.....',
    '...HHHHHHHHHH...',
    '..HHhHHHHHHHHH..',
    '.HHhHHHHHHHHHHH.',
    '.HHHHHHHHHHHHHH.',
    '.HH..........HH.',
    '.HH..........HH.',
    '.HH..........HH.',
    '.HHH........HHH.',
  ],
  long: [
    '',
    '',
    '.....HHHHHH.....',
    '...HHHHHHHHHH...',
    '..HHhHHHHHHHHH..',
    '.HHhHHHHHHHHHHH.',
    '.HHHH.HHHH.HHHH.',
    '.HH..........HH.',
    '.HH..........HH.',
    '.HH..........HH.',
    '.HH..........HH.',
    '.HH..........HH.',
    '.HH..........HH.',
    '.HH..........HH.',
    '.HH..........HH.',
    '..H..........H..',
  ],
  bun: [
    '......HHHH......',
    '.....HhHHHH.....',
    '.....HHHHHH.....',
    '...HHHHHHHHHH...',
    '..HHhHHHHHHHHH..',
    '..HHhHHHHHHHHH..',
    '..HHHHH..HHHHH..',
    '..H..........H..',
  ],
  spiky: [
    '',
    '...H..H..H..H...',
    '...HH.HH.HH.HH..',
    '..HHHHHHHHHHHH..',
    '..HHhHHHHHHHHH..',
    '.HHhHHHHHHHHHHH.',
    '..HH.HH.HH.HHH..',
    '..H..........H..',
  ],
  twintails: [
    '',
    '',
    '.....HHHHHH.....',
    '...HHHHHHHHHH...',
    '..HHhHHHHHHHHH..',
    'HHHhHHHHHHHHHHHH',
    'HHHH.HH..HH.HHHH',
    'HHH..........HHH',
    'HH............HH',
    'HH............HH',
    'HH............HH',
    '.H............H.',
  ],
};

// Eyes and mouths: [x, y, colourKey]
const EYE = {
  dot: [
    [5, 7, 'E'],
    [5, 8, 'E'],
    [10, 7, 'E'],
    [10, 8, 'E'],
  ],
  round: [
    [5, 7, 'W'],
    [6, 7, 'E'],
    [5, 8, 'E'],
    [6, 8, 'E'],
    [9, 7, 'W'],
    [10, 7, 'E'],
    [9, 8, 'E'],
    [10, 8, 'E'],
  ],
  happy: [
    [4, 8, 'E'],
    [5, 7, 'E'],
    [6, 8, 'E'],
    [9, 8, 'E'],
    [10, 7, 'E'],
    [11, 8, 'E'],
  ],
  sleepy: [
    [4, 8, 'E'],
    [5, 8, 'E'],
    [6, 8, 'E'],
    [9, 8, 'E'],
    [10, 8, 'E'],
    [11, 8, 'E'],
  ],
  wink: [
    [5, 7, 'E'],
    [5, 8, 'E'],
    [9, 8, 'E'],
    [10, 7, 'E'],
    [11, 8, 'E'],
  ],
  closed: [
    [4, 8, 'E'],
    [5, 8, 'E'],
    [6, 8, 'E'],
    [9, 8, 'E'],
    [10, 8, 'E'],
    [11, 8, 'E'],
  ],
  sad: [
    [5, 7, 'E'],
    [5, 8, 'E'],
    [10, 7, 'E'],
    [10, 8, 'E'],
    [4, 6, 'E'],
    [11, 6, 'E'],
  ],
  angry: [
    [5, 8, 'E'],
    [6, 8, 'E'],
    [9, 8, 'E'],
    [10, 8, 'E'],
    [4, 6, 'E'],
    [5, 7, 'E'],
    [11, 6, 'E'],
    [10, 7, 'E'],
  ],
};
const MOUTH = {
  smile: [
    [6, 9, 'M'],
    [7, 10, 'M'],
    [8, 10, 'M'],
    [9, 9, 'M'],
  ],
  open: [
    [7, 9, 'M'],
    [8, 9, 'M'],
    [7, 10, 'R'],
    [8, 10, 'R'],
  ],
  tiny: [
    [7, 9, 'M'],
    [8, 9, 'M'],
  ],
  frown: [
    [7, 9, 'M'],
    [8, 9, 'M'],
    [6, 10, 'M'],
    [9, 10, 'M'],
  ],
};

function outfitRows(style) {
  const rows = BASE.slice(12).map((r) => r.split(''));
  const set = (y, s) => (rows[y - 12] = s.split(''));
  if (style === 'stripe') {
    set(14, '...SccccccccS...');
    set(16, '....cccccccc....');
  } else if (style === 'dress') {
    set(16, '....CCCCCCCC....');
    set(17, '...CCCCCCCCCC...');
    set(18, '.....SS..SS.....');
  } else if (style === 'overalls') {
    set(13, '....CPCCCCPC....');
    set(14, '...SCPPPPPPCS...');
    set(15, '...SCPPPPPPCS...');
    set(16, '....PPPPPPPP....');
  } else if (style === 'hoodie') {
    set(12, '.....cCCCCc.....');
    set(13, '....cCCWWCCc....');
  }
  return rows;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// Builds the character grid for a look. expr can override eyes/mouth (moods).
export function avatarGrid(look, { expr = null, frame = 0, blush = look.blush } = {}) {
  const grid = BASE.slice(0, 12)
    .map((r) => r.split(''))
    .concat(outfitRows(look.outfit));
  // Walking: legs step
  if (frame === 1) {
    grid[18] = '.....PP...PP....'.split('');
    grid[19] = '.....KK...KK....'.split('');
    if (look.outfit === 'dress') grid[18] = '.....SS...SS....'.split('');
  } else if (frame === 2) {
    grid[18] = '....PP...PP.....'.split('');
    grid[19] = '....KK...KK.....'.split('');
    if (look.outfit === 'dress') grid[18] = '....SS...SS.....'.split('');
  }
  const eyes = EYE[expr?.eyes || look.eyes] || EYE.dot;
  const mouth = MOUTH[expr?.mouth || look.mouth] || MOUTH.smile;
  for (const [x, y, c] of [...eyes, ...mouth]) grid[y][x] = c;
  if (blush) for (const x of [3, 4, 11, 12]) if (grid[9][x] === 'S') grid[9][x] = 'B';
  // Hair on top
  (HAIR[look.hair] || HAIR.short).forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'H' || row[x] === 'h') grid[y][x] = row[x];
  });
  return grid;
}

export function paletteFor(look) {
  return {
    S: look.skin,
    s: shade(look.skin, 0.9),
    H: look.hairColor,
    h: shade(look.hairColor, 1.25),
    E: '#4a3434',
    W: '#ffffff',
    M: '#b8475a',
    R: '#e8606f',
    B: '#f6a5b5',
    C: look.shirt,
    c: shade(look.shirt, 0.85),
    P: look.pants,
    K: '#6b4a4a',
    o: '#6b4a4a',
  };
}

const cache = new Map();

// Returns a 16x20 canvas (1 px per pixel) for drawing into a game canvas.
export function avatarCanvas(look, opts = {}) {
  const key = JSON.stringify([look, opts]);
  if (cache.has(key)) return cache.get(key);
  const grid = avatarGrid(look, opts);
  const pal = paletteFor(look);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const filled = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] !== '.';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let ch = grid[y][x];
      if (ch === '.') {
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ch = 'o';
        else continue;
      }
      g.fillStyle = pal[ch] || '#ff00ff';
      g.fillRect(x, y, 1, 1);
    }
  if (cache.size > 400) cache.clear();
  cache.set(key, cv);
  return cv;
}

// A data URL version, scaled up crisply, for <img> tags.
export function avatarURL(look, scale = 4, opts = {}) {
  const key = 'url' + scale + JSON.stringify([look, opts]);
  if (cache.has(key)) return cache.get(key);
  const src = avatarCanvas(look, opts);
  const cv = document.createElement('canvas');
  cv.width = W * scale;
  cv.height = H * scale;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, W * scale, H * scale);
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function randomLook() {
  return {
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairColor: pick(HAIR_COLORS),
    eyes: pick(EYES),
    mouth: pick(MOUTHS),
    blush: Math.random() < 0.6,
    outfit: pick(OUTFITS),
    shirt: pick(CLOTHES_COLORS),
    pants: pick(PANTS_COLORS),
  };
}
