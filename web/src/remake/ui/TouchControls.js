import { el } from './dom.js';
import { BTN } from '../sim/input.js';
import { pressKey } from '../brawl/gamepad.js';

/**
 * On-screen controls for phones and tablets: a floating joystick on the left
 * half of the screen, action buttons on the right, pause at the top. A tap on
 * the open screen (not on a control) works as Enter — dialogues, results.
 */
export class TouchControls {
  constructor(parent) {
    this.dir = { x: 0, y: 0 };
    this.held = 0;
    this.latched = 0;

    const knob = el('div', { className: 'tc-knob' });
    const base = el('div', { className: 'tc-base' }, [knob]);
    const stick = el('div', { className: 'tc-stick' }, [base]);
    const btn = (label, bit, cls) => {
      const b = el('div', { className: `tc-btn ${cls}`, text: label });
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.held |= bit;
        this.latched |= bit;
        b.classList.add('on');
      };
      const up = (e) => {
        e.preventDefault();
        this.held &= ~bit;
        b.classList.remove('on');
      };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      return b;
    };
    const pause = el('div', { className: 'tc-pause', text: 'II' });
    pause.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pressKey('Escape', 27);
    }, { passive: false });

    this.node = el('div', { className: 'tc' }, [
      stick,
      el('div', { className: 'tc-btns' }, [
        btn('Удар', BTN.LIGHT, 'b-light'),
        btn('Нога', BTN.HEAVY, 'b-heavy'),
        btn('Прыжок', BTN.JUMP, 'b-jump'),
        btn('Рывок', BTN.DASH, 'b-dash'),
        btn('Ярость', BTN.SPECIAL, 'b-rage'),
        btn('Оружие', BTN.WNEXT, 'b-weapon'),
      ]),
      pause,
    ]);
    parent.append(this.node);

    // Floating joystick: appears where the thumb lands on the left half
    let id = null;
    let ox = 0;
    let oy = 0;
    const R = 56;
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      id = t.identifier;
      ox = t.clientX;
      oy = t.clientY;
      const r = stick.getBoundingClientRect();
      base.style.left = `${ox - r.left}px`;
      base.style.top = `${oy - r.top}px`;
      base.classList.add('on');
      knob.style.transform = 'translate(-50%, -50%)';
    }, { passive: false });
    stick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        let dx = t.clientX - ox;
        let dy = t.clientY - oy;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.dir = { x: dx / R, y: dy / R };
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        id = null;
        this.dir = { x: 0, y: 0 };
        base.classList.remove('on');
      }
    };
    stick.addEventListener('touchend', end);
    stick.addEventListener('touchcancel', end);
  }

  read() {
    let bits = this.held | this.latched;
    const { x, y } = this.dir;
    if (x < -0.35) bits |= BTN.LEFT;
    if (x > 0.35) bits |= BTN.RIGHT;
    if (y < -0.35) bits |= BTN.UP;
    if (y > 0.35) bits |= BTN.DOWN;
    return bits;
  }

  consumed() {
    this.latched = 0;
  }

  setVisible(on) {
    this.node.classList.toggle('hidden', !on);
  }

  destroy() {
    this.node.remove();
  }
}
