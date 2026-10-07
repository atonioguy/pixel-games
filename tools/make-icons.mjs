// Generates the home-screen app icons from the sprite art.
// Usage: node tools/make-icons.mjs
import fs from 'node:fs';
import { SPRITES } from '../js/sprites.js';
import { PALETTE, SIZE, bake } from '../js/pixel.js';
import { Canvas } from './png.mjs';

fs.mkdirSync('assets/icons', { recursive: true });

for (const size of [180, 192, 512]) {
  const cv = new Canvas(size, size, '#f7c9cf');
  // Wallpaper diamonds
  const step = Math.round(size / 8);
  const dot = Math.max(2, Math.round(size / 64));
  for (let y = 0; y < size; y += step)
    for (let x = (y / step) % 2 ? step / 2 : 0; x < size; x += step) {
      cv.rect(Math.round(x), Math.round(y) - dot, dot, dot * 3, '#fde8ea');
      cv.rect(Math.round(x) - dot, Math.round(y), dot * 3, dot, '#fde8ea');
    }
  // Croissant in the middle (keeps clear of the corners iOS rounds off)
  const scale = Math.floor((size * 0.7) / SIZE);
  const off = Math.round((size - SIZE * scale) / 2);
  cv.sprite(bake(SPRITES.croissant), PALETTE, off, off + scale, scale);
  fs.writeFileSync(`assets/icons/icon-${size}.png`, cv.png());
}
console.log('icons written');
