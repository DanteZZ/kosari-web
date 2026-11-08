/**
 * Shared arena geometry. Every arena is two 1920 px screens wide, so no screen
 * ever sees past its walls; arenas are separated by a gap, and the scenery
 * joins (the tall pillars between segment types) stand in the middle of a gap —
 * never inside a fight.
 *
 *   |START| arena 1 |GAP| arena 2 |GAP| arena 3 |GAP| boss / finale |
 */
export const ARENA_W = 3840;
export const GAP = 600;
export const START = 400;

/** Arena i (0-based): { left, right, trigger }. */
export function arenaAt(i) {
  const left = START + i * (ARENA_W + GAP);
  return { left, right: left + ARENA_W, trigger: left + 420 };
}

/** Map length for n arenas (the last one ends at the map's end). */
export function lengthFor(n) {
  return arenaAt(n - 1).right;
}

/** World x of the join in front of arena i (i ≥ 1): the middle of the gap. */
export function joinBefore(i) {
  return arenaAt(i).left - GAP / 2;
}
