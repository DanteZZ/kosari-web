import { BTN } from '../sim/input.js';

/**
 * Gamepad support (standard mapping: Xbox / PlayStation / most USB pads).
 *
 * In the fight: readPad() gives input bits like the keyboard does.
 *   Left stick / D-pad — move · A (✕) jump · X (□) punch · Y (△) kick
 *   B (○) dash · RB / RT rage · LB / LT weapon prev / next.
 * Everywhere (menus, dialogues, pause): startPadNav() turns the pad into key
 * presses — D-pad / stick = arrows, A = Enter, B = Backspace (back),
 * Start = Escape (pause / menu), so every screen works without extra code.
 */

const DEAD = 0.35;

/** Synthetic key press that both Phaser (keyCode) and the DOM menus (code) understand. */
export function pressKey(code, keyCode, key = code) {
  for (const type of ['keydown', 'keyup']) {
    const e = new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'keyCode', { get: () => keyCode });
    Object.defineProperty(e, 'which', { get: () => keyCode });
    window.dispatchEvent(e);
  }
}

function pads() {
  try {
    return [...(navigator.getGamepads?.() || [])].filter(Boolean);
  } catch (_) {
    return [];
  }
}

const pressed = (p, i) => !!p.buttons[i]?.pressed || (p.buttons[i]?.value || 0) > 0.5;

/** Input bits from the first connected pad (0 if none). */
export function readPad() {
  const p = pads()[0];
  if (!p) return 0;
  let bits = 0;
  const ax = p.axes[0] || 0;
  const ay = p.axes[1] || 0;
  if (ax < -DEAD || pressed(p, 14)) bits |= BTN.LEFT;
  if (ax > DEAD || pressed(p, 15)) bits |= BTN.RIGHT;
  if (ay < -DEAD || pressed(p, 12)) bits |= BTN.UP;
  if (ay > DEAD || pressed(p, 13)) bits |= BTN.DOWN;
  if (pressed(p, 0)) bits |= BTN.JUMP;
  if (pressed(p, 2)) bits |= BTN.LIGHT;
  if (pressed(p, 3)) bits |= BTN.HEAVY;
  if (pressed(p, 1)) bits |= BTN.DASH;
  if (pressed(p, 5) || pressed(p, 7)) bits |= BTN.SPECIAL;
  if (pressed(p, 4)) bits |= BTN.WPREV;
  if (pressed(p, 6)) bits |= BTN.WNEXT;
  return bits;
}

export function padConnected() {
  return pads().length > 0;
}

let navStarted = false;

/** Menu / dialogue navigation with the pad (edge-triggered key presses). */
export function startPadNav() {
  if (navStarted) return;
  navStarted = true;
  let prev = {};
  let repeatT = 0;
  const tick = () => {
    const p = pads()[0];
    if (p) {
      const ax = p.axes[0] || 0;
      const ay = p.axes[1] || 0;
      const now = {
        up: ay < -0.6 || pressed(p, 12),
        down: ay > 0.6 || pressed(p, 13),
        left: ax < -0.6 || pressed(p, 14),
        right: ax > 0.6 || pressed(p, 15),
        a: pressed(p, 0),
        b: pressed(p, 1),
        start: pressed(p, 9),
      };
      const edge = (k) => now[k] && !prev[k];
      // Held directions repeat slowly (menu lists)
      const held = now.up || now.down || now.left || now.right;
      repeatT = held ? repeatT + 1 : 0;
      const rep = repeatT > 24 && repeatT % 8 === 0;
      if (edge('up') || (now.up && rep)) pressKey('ArrowUp', 38);
      if (edge('down') || (now.down && rep)) pressKey('ArrowDown', 40);
      if (edge('left') || (now.left && rep)) pressKey('ArrowLeft', 37);
      if (edge('right') || (now.right && rep)) pressKey('ArrowRight', 39);
      if (edge('a')) pressKey('Enter', 13);
      if (edge('b')) pressKey('Backspace', 8);
      if (edge('start')) pressKey('Escape', 27);
      prev = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
