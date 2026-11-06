/**
 * One tick of player intent, packed in a bitmask. Local keyboard, gamepads,
 * AI and (later) network peers all produce the same thing.
 */
export const BTN = {
  LEFT: 1,
  RIGHT: 2,
  UP: 4, // into the screen (smaller z)
  DOWN: 8, // towards the camera (larger z)
  JUMP: 16,
  LIGHT: 32,
  HEAVY: 64,
  DASH: 128,
  /** Rage special (also J+K together). */
  SPECIAL: 256,
  WNEXT: 512,
  WPREV: 1024,
  /** With the SEL field: buy shop item instead of selecting a weapon slot. */
  BUY: 1 << 14,
};

/** 3-bit field (bits 11–13): 0 = none, n = weapon slot / shop item n−1. */
export const SEL_SHIFT = 11;
export function selField(bits) {
  return (bits >> SEL_SHIFT) & 7;
}
export function withSel(bits, n) {
  return (bits & ~(7 << SEL_SHIFT)) | ((n & 7) << SEL_SHIFT);
}

/** Buttons that are edge-triggered and buffered. */
export const ACTION_BTNS = [BTN.JUMP, BTN.LIGHT, BTN.HEAVY, BTN.DASH, BTN.SPECIAL];

export function axisX(bits) {
  return (bits & BTN.RIGHT ? 1 : 0) - (bits & BTN.LEFT ? 1 : 0);
}

export function axisZ(bits) {
  return (bits & BTN.DOWN ? 1 : 0) - (bits & BTN.UP ? 1 : 0);
}
