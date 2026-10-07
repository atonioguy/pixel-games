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

// ---------- Juicy visual feedback ----------

let fxLayer = null;
function layer() {
  if (!fxLayer || !fxLayer.isConnected) {
    fxLayer = el('div', { class: 'fx-layer' });
    document.body.append(fxLayer);
  }
  return fxLayer;
}

const BURST_COLORS = ['#ffe08a', '#fad0d8', '#f19bb0', '#aee0d1', '#ffffff', '#cdeaf7'];

// Little pixel confetti bursting out from (x, y) in screen coordinates.
export function burst(x, y, { count = 10, colors = BURST_COLORS, spread = 46, size = 5, stars = 2 } = {}) {
  const host = layer();
  for (let i = 0; i < count; i++) {
    const p = el('div', { class: 'particle' });
    const s = size + Math.floor(Math.random() * 3);
    p.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${colors[i % colors.length]}`;
    host.append(p);
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const d = spread * (0.6 + Math.random() * 0.6);
    p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.4)`,
          opacity: 0,
        },
      ],
      { duration: 420 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.3,1)' },
    ).onfinish = () => p.remove();
  }
  for (let i = 0; i < stars; i++) {
    const st = icon('sparkle', 22, 'particle-star');
    st.style.left = x + (Math.random() - 0.5) * spread + 'px';
    st.style.top = y + (Math.random() - 0.5) * spread + 'px';
    host.append(st);
    st.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.2) rotate(0deg)', opacity: 1 },
        { transform: 'translate(-50%,-50%) scale(1.2) rotate(90deg)', opacity: 1, offset: 0.5 },
        { transform: 'translate(-50%,-50%) scale(0.2) rotate(180deg)', opacity: 0 },
      ],
      { duration: 600, delay: i * 80, easing: 'ease-out' },
    ).onfinish = () => st.remove();
  }
}

// Expanding ring, like a soft shockwave.
export function ring(x, y, size = 60, color = '#ffffff') {
  const r = el('div', { class: 'ring' });
  r.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-color:${color}`;
  layer().append(r);
  r.animate(
    [
      { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0.9 },
      { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 },
    ],
    { duration: 380, easing: 'ease-out' },
  ).onfinish = () => r.remove();
}

// Floating "+5" style text that drifts up and fades.
export function floatText(x, y, text, { color = '#6b4a4a', iconName = null } = {}) {
  const t = el('div', { class: 'float-text' }, iconName ? icon(iconName, 18) : null, text);
  t.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
  layer().append(t);
  t.animate(
    [
      { transform: 'translate(-50%,-30%) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%,-200%) scale(1)', opacity: 0 },
    ],
    { duration: 900, easing: 'ease-out' },
  ).onfinish = () => t.remove();
}

// Quick nudge of an element (a "thump" you can see).
export function thump(elem, px = 3) {
  elem.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${px}px)` }, { transform: 'translateY(0)' }], {
    duration: 140,
    easing: 'ease-out',
  });
}

export function center(elem) {
  const r = elem.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

// A panel that slides up from the bottom. render(refresh, close) returns its contents.
export function sheet(title, render, onClose) {
  const body = el('div', { class: 'sheet-body' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    shade.classList.add('out');
    setTimeout(() => shade.remove(), 200);
    onClose?.();
  };
  const shade = el(
    'div',
    { class: 'shade sheet-shade', onclick: (e) => e.target === shade && close() },
    el(
      'div',
      { class: 'sheet px-box' },
      el(
        'div',
        { class: 'sheet-head' },
        el('h2', {}, title),
        el('button', { class: 'icon-btn close-btn', 'aria-label': 'Close', onclick: close }, '✕'),
      ),
      body,
    ),
  );
  document.body.append(shade);
  const refresh = () => {
    const top = body.scrollTop;
    body.replaceChildren(...[render(refresh, close)].flat());
    body.scrollTop = top;
  };
  refresh();
  return { close, refresh };
}
