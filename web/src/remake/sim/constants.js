/**
 * Simulation constants. The sim is pure JS (no Phaser) and advances in fixed
 * ticks so the same code can later run on a co-op host and be replayed from inputs.
 * Units: pixels and ticks.
 */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

/** Height gravity, px/tick². */
export const GRAVITY = 0.85;
export const MAX_FALL = 24;

/** Half-width of a fighter's hurtbox along X. */
export const HURT_HALF_W = 24;
/** Bodies closer than this (x, z*2 ellipse) get pushed apart. */
export const BODY_RADIUS = 30;

/** Ticks a pressed button stays buffered waiting for a chance to act. */
export const INPUT_BUFFER = 9;
/** Ticks after a move ends where the next combo step can still be chained. */
export const CHAIN_WINDOW = 14;

/** Max enemies allowed to actively attack one player at once. */
export const ATTACK_TOKENS = 2;

/** Somersault length (ticks) on the double jump. */
export const FLIP_TICKS = 26;
