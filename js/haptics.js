// Haptic "ticks". Android supports navigator.vibrate. iPhone (iOS 18+) has no vibration API,
// but toggling a hidden <input switch> makes Safari play its own little haptic tick.
import { save } from './state.js';

let lastAt = 0;

function iosTick() {
  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.append(input);
  document.head.append(label);
  label.click();
  label.remove();
}

// strength: 1 = light tap, 2 = medium, 3 = celebration
export function haptic(strength = 1) {
  if (!save.settings.haptics) return;
  const now = performance.now();
  if (now - lastAt < 40) return;
  lastAt = now;
  try {
    if (navigator.vibrate) {
      navigator.vibrate(strength === 1 ? 8 : strength === 2 ? 18 : [20, 40, 20]);
      return;
    }
    iosTick();
    if (strength === 3) setTimeout(iosTick, 90);
  } catch {
    // No haptics available; visuals still show.
  }
}
