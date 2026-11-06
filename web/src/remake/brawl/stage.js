import { LAYER_Y } from '../game/constants.js';

/**
 * Maps sim lane coordinates to screen space for the forest road art
 * (see web/scripts/compose_world.py: ROAD_TOP 620 … ROAD_BOT 900, wavy edges).
 *   feet screen Y = LAYER_Y + LANE_TOP_ROW + z
 *   body screen Y = feet Y − y (jump height)
 */
export const LANE_TOP_ROW = 700;
export const LANE_DEPTH = 150;

export const stage = {
  /** Screen Y of the ground at depth z. Reads LAYER_Y live (changes on resize). */
  groundY(z) {
    return LAYER_Y + LANE_TOP_ROW + z;
  },
  /** Draw depth for an object standing at z (far → behind). */
  depth(z) {
    return 100 + z;
  },
};
