// Tiny pixel-art renderer. Sprites are arrays of strings, one char per pixel.
// '.' is transparent. Any transparent pixel touching a filled pixel (up/down/left/right)
// automatically gets the outline colour, so sprites only need their fill drawn.

export const PALETTE = {
  o: '#6b4a4a', // outline (warm brown)
  k: '#4a3434', // eyes / darkest
  h: '#ffffff', // highlight
  w: '#fffaf3', // white
  c: '#fbefd9', // cream
  t: '#efd3a8', // tan
  n: '#e7ae6e', // crust
  b: '#c47f4f', // brown
  B: '#8f5a3c', // dark brown
  p: '#fad0d8', // light pink
  P: '#f19bb0', // pink
  r: '#e8606f', // red
  R: '#b8475a', // dark red
  y: '#ffe08a', // yellow
  Y: '#f5b94a', // gold
  a: '#f39a5b', // orange
  g: '#b3de95', // light green
  G: '#6fae6a', // green
  m: '#aee0d1', // mint
  M: '#6fb5a3', // teal
  l: '#d3ecf7', // light blue
  L: '#86bfe0', // blue
  v: '#d7c6f2', // lavender
  V: '#9a7fd1', // purple
  s: '#ece3e3', // light grey
  S: '#b8a8a8', // grey
};

export const SIZE = 16;

// Normalises a sprite to SIZE x SIZE and adds the auto outline. Returns a grid of chars.
export function bake(rows) {
  const grid = [];
  for (let y = 0; y < SIZE; y++) {
    const row = (rows[y] || '').padEnd(SIZE, '.').slice(0, SIZE);
    grid.push(row.split(''));
  }
  const filled = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && grid[y][x] !== '.' && grid[y][x] !== '_';
  const out = grid.map((r) => r.slice());
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (grid[y][x] !== '.') continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) out[y][x] = 'o';
    }
  }
  return out;
}

const cache = new Map();

// Returns a data URL for the sprite, drawn at `scale` (nearest-neighbour, crisp).
export function spriteURL(name, rows, scale = 4) {
  const key = name + '@' + scale;
  if (cache.has(key)) return cache.get(key);
  const grid = bake(rows);
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE * scale;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ch = grid[y][x];
      const col = PALETTE[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

// Builds a small repeating background tile from rows (no outline), returned as a CSS url().
export function tileURL(rows, colors, scale = 3) {
  const h = rows.length;
  const w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = colors[rows[y][x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return `url(${cv.toDataURL()})`;
}
