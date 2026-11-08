/**
 * Lane ↔ world space for the brawl view (fixed world coordinates; the cameras
 * decide where that lands on screen):
 *   feet world Y = ROAD_Y + z      (z = 0 far edge … LANE_DEPTH near edge)
 *   body world Y = feet Y − y      (jump height)
 */
export const ROAD_Y = 600;
export const LANE_DEPTH = 150;

/**
 * Scenery drawn by the main camera (sets, the goal, props you walk up to) gets
 * the same grade the background camera applies, so it sits in the picture
 * instead of popping out. k = 1 for scenery, ~0.5 for props.
 */
export function gradeLikeBg(o, k = 1) {
  if (!o?.postFX) return o;
  const fx = o.postFX.addColorMatrix();
  fx.saturate(-0.45 * k);
  fx.brightness(1 - 0.12 * k, true);
  return o;
}

export const stage = {
  groundY(z) {
    return ROAD_Y + z;
  },
  /** Draw depth for an object standing at z (far → behind). */
  depth(z) {
    return 100 + z;
  },
};
