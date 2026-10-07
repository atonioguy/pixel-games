// Small shared UI helpers: element builder, sprite images, toasts, dialogs, flying coins.
import { SPRITES } from './sprites.js';
import { spriteURL } from './pixel.js';

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export function spriteSrc(name) {
  return spriteURL(name, SPRITES[name] || SPRITES.question);
}

export function icon(name, size = 32, cls = '') {
  return el('img', {
    class: 'px-icon ' + cls,
    src: spriteSrc(name),
    width: size,
    height: size,
    alt: '',
    draggable: 'false',
  });
}

let toastHost = null;
export function toast(msg, iconName) {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.append(toastHost);
  }
  const t = el('div', { class: 'toast px-box' }, iconName ? icon(iconName, 24) : null, el('span', {}, msg));
  toastHost.append(t);
  setTimeout(() => t.classList.add('out'), 1800);
  setTimeout(() => t.remove(), 2200);
}

// A tiny pixel-styled confirm dialog. Resolves true/false.
export function confirmBox(title, text, okLabel = 'OK', cancelLabel = 'Cancel') {
  return new Promise((resolve) => {
    const close = (v) => {
      shade.remove();
      resolve(v);
    };
    const shade = el(
      'div',
      { class: 'shade', onclick: (e) => e.target === shade && close(false) },
      el(
        'div',
        { class: 'dialog px-box' },
        el('h2', {}, title),
        el('p', {}, text),
        el(
          'div',
          { class: 'dialog-btns' },
          cancelLabel ? el('button', { class: 'px-btn ghost', onclick: () => close(false) }, cancelLabel) : null,
          el('button', { class: 'px-btn', onclick: () => close(true) }, okLabel),
        ),
      ),
    );
    document.body.append(shade);
  });
}

// Coins fly from a screen rect to the coin counter.
export function flyCoins(fromRect, count = 5) {
  const target = document.getElementById('coin-pill');
  if (!target) return;
  const to = target.getBoundingClientRect();
  const n = Math.min(count, 8);
  for (let i = 0; i < n; i++) {
    const c = icon('coin', 22, 'flyer');
    document.body.append(c);
    const sx = fromRect.left + fromRect.width / 2 - 11 + (Math.random() - 0.5) * 30;
    const sy = fromRect.top + fromRect.height / 2 - 11 + (Math.random() - 0.5) * 20;
    const ex = to.left + 6;
    const ey = to.top + to.height / 2 - 11;
    c.style.left = sx + 'px';
    c.style.top = sy + 'px';
    const anim = c.animate(
      [
        { transform: 'translate(0,0) scale(0.6)', opacity: 1 },
        {
          transform: `translate(${(ex - sx) * 0.3}px, ${(ey - sy) * 0.1 - 30}px) scale(1.1)`,
          opacity: 1,
          offset: 0.35,
        },
        { transform: `translate(${ex - sx}px, ${ey - sy}px) scale(0.8)`, opacity: 0.9 },
      ],
      { duration: 600 + i * 70, easing: 'ease-in' },
    );
    anim.onfinish = () => {
      c.remove();
      target.classList.remove('bump');
      void target.offsetWidth;
      target.classList.add('bump');
    };
  }
}
