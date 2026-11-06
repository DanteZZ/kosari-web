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
};

/** Buttons that are edge-triggered and buffered. */
export const ACTION_BTNS = [BTN.JUMP, BTN.LIGHT, BTN.HEAVY, BTN.DASH];

export function axisX(bits) {
  return (bits & BTN.RIGHT ? 1 : 0) - (bits & BTN.LEFT ? 1 : 0);
}

export function axisZ(bits) {
  return (bits & BTN.DOWN ? 1 : 0) - (bits & BTN.UP ? 1 : 0);
}
