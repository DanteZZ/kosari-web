import Phaser from 'phaser';
import { BTN, withSel } from '../sim/input.js';

const K = Phaser.Input.Keyboard.KeyCodes;

/** Default layout for local player 1. */
export const P1_KEYS = {
  [BTN.LEFT]: [K.A, K.LEFT],
  [BTN.RIGHT]: [K.D, K.RIGHT],
  [BTN.UP]: [K.W, K.UP],
  [BTN.DOWN]: [K.S, K.DOWN],
  [BTN.JUMP]: [K.SPACE],
  [BTN.LIGHT]: [K.J],
  [BTN.HEAVY]: [K.K],
  [BTN.DASH]: [K.L, K.SHIFT],
  [BTN.SPECIAL]: [K.I],
  [BTN.WPREV]: [K.Q],
  [BTN.WNEXT]: [K.E],
};

const DIGITS = [K.ONE, K.TWO, K.THREE, K.FOUR, K.FIVE, K.SIX, K.SEVEN];

/**
 * Keyboard → input bits for one player slot.
 * Taps are latched until the sim consumes a tick, so a press shorter than a
 * tick (high refresh rates) is never lost.
 * Digits 1–5 pick a weapon slot, or buy shop item 1–5 while the shop is open.
 */
export class KeyboardInput {
  constructor(scene, map = P1_KEYS) {
    this.binds = [];
    this.latched = 0;
    this.sel = 0;
    this.shopOpen = false;
    for (const [bit, codes] of Object.entries(map)) {
      for (const code of codes) {
        const key = scene.input.keyboard.addKey(code, true);
        const b = Number(bit);
        key.on('down', () => {
          this.latched |= b;
        });
        this.binds.push({ key, bit: b });
      }
    }
    DIGITS.forEach((code, i) => {
      scene.input.keyboard.addKey(code, true).on('down', () => {
        this.sel = i + 1;
      });
    });
  }

  read() {
    let bits = this.latched;
    for (const { key, bit } of this.binds) if (key.isDown) bits |= bit;
    if (this.sel) {
      bits = withSel(bits, this.sel);
      if (this.shopOpen) bits |= BTN.BUY;
    }
    return bits;
  }

  /** Call after at least one sim tick has seen the latched presses. */
  consumed() {
    this.latched = 0;
    this.sel = 0;
  }
}
