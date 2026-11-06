/**
 * Canvas = full browser stage. 1 CSS px = 1 game px (Scale.RESIZE).
 *
 * World art is TALLER than the viewport on purpose (beat-em-up framing):
 * bottom-align so the forest road stays on screen; sky/crowns may extend above.
 */
export const LAYER_W = 3600;
export const LAYER_H = 1180;
/** Walk line on the raised forest road (see compose_world.py). */
/** Walk line on the road (center band + 32px lower than geometric mid). */
export const PATH_ROW = 792;

export let VIEW_W = 960;
export let VIEW_H = 720;
export let LAYER_Y = 0;
export let GROUND_Y = PATH_ROW;
export let WORLD_H = 720;

export const WORLD_W = 7200;

export const PLAYER_FEET = 193;
export const CHAR_TARGET_H = 210;

/** Extra downward shift of the whole world + walk line (px). */
export const WORLD_Y_SHIFT = 200;

/**
 * Fight-debug: no auto-spawn / game over, manual N/M spawn, no life loss.
 * Off for normal session combat-loop.
 */
export const DEBUG_FIGHT = false;

/** Call whenever the game canvas size changes. */
export function applyViewSize(w, h) {
  VIEW_W = Math.max(1, Math.floor(w));
  VIEW_H = Math.max(1, Math.floor(h));
  // Bottom-align, then nudge world + floor down.
  LAYER_Y = VIEW_H - LAYER_H + WORLD_Y_SHIFT;
  GROUND_Y = LAYER_Y + PATH_ROW;
  WORLD_H = VIEW_H;
}
