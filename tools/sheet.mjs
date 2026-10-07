// Renders every sprite into a contact sheet PNG and checks sprite dimensions.
// Usage: node tools/sheet.mjs out.png
import fs from 'node:fs';
import { SPRITES } from '../js/sprites.js';
import { PALETTE, SIZE, bake } from '../js/pixel.js';
import { Canvas } from './png.mjs';

const names = Object.keys(SPRITES);
let bad = 0;
for (const n of names) {
  const rows = SPRITES[n];
  if (rows.length > SIZE) {
    console.log(`${n}: ${rows.length} rows`);
    bad++;
  }
  rows.forEach((r, i) => {
    if (r.length !== SIZE) {
      console.log(`${n} row ${i}: length ${r.length}`);
      bad++;
    }
    for (const ch of r)
      if (ch !== '.' && ch !== '_' && !PALETTE[ch]) {
        console.log(`${n} row ${i}: unknown '${ch}'`);
        bad++;
      }
  });
}
const scale = 5,
  cols = 8,
  cell = SIZE * scale + 10;
const rows = Math.ceil(names.length / cols);
const cv = new Canvas(cols * cell, rows * cell, '#f7c9cf');
names.forEach((n, i) => {
  const x = (i % cols) * cell + 5,
    y = Math.floor(i / cols) * cell + 5;
  cv.rect(x, y, SIZE * scale, SIZE * scale, '#fbefd9');
  cv.sprite(bake(SPRITES[n]), PALETTE, x, y, scale);
});
fs.writeFileSync(process.argv[2] || 'sheet.png', cv.png());
console.log(names.map((n, i) => `${i}:${n}`).join(' '));
console.log(bad ? `${bad} problems` : 'all sprites OK');
