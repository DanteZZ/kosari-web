/**
 * Lane ↔ world space for the brawl view (fixed world coordinates; the cameras
 * decide where that lands on screen):
 *   feet world Y = ROAD_Y + z      (z = 0 far edge … LANE_DEPTH near edge)
 *   body world Y = feet Y − y      (jump height)
 */
export const ROAD_Y = 600;
export const LANE_DEPTH = 150;

export const stage = {
  groundY(z) {
    return ROAD_Y + z;
  },
  /** Draw depth for an object standing at z (far → behind). */
  depth(z) {
    return 100 + z;
  },
};
