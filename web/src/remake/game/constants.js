/**
 * Canvas = full browser stage. 1 CSS px = 1 game px (Scale.RESIZE).
 * VIEW_W / VIEW_H are live bindings updated on every resize.
 */
export let VIEW_W = 960;
export let VIEW_H = 720;

/** On-screen height of the player puppet (enemy skins are sized against it). */
export const CHAR_TARGET_H = 210;

/** Call whenever the game canvas size changes. */
export function applyViewSize(w, h) {
  VIEW_W = Math.max(1, Math.floor(w));
  VIEW_H = Math.max(1, Math.floor(h));
}
