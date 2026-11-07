import LAYOUT from './layout.json';

/** Pocik cut parts from Desktop/pocik — clean RGBA limbs. */

export const PART_FILES = {
  head: 'pocik_0002_head.png',
  torso: 'pocik_0003_body.png',
  arm_r_u: 'pocik_0001_hand_r_top.png',
  arm_r_l: 'pocik_0000_hand_r_bottom.png',
  arm_l_u: 'pocik_0005_hand_l_top.png',
  arm_l_l: 'pocik_0004_hand_l_bottom.png',
  leg_l_u: 'pocik_0007_leg_l_top.png',
  leg_l_l: 'pocik_0006_leg_l_bottom.png',
  leg_r_u: 'pocik_0009_leg_r_top.png',
  leg_r_l: 'pocik_0008_leg_r_bottom.png',
};

export function partTextureKey(name) {
  return `player_${name}`;
}
/**
 * Default local layout. Puppet origin = feet.
 * Character faces right: L = back of body (behind torso), R = front.
 * Rest = user-tuned guard stance. Edited in the bone editor («Сохранить в проект»).
 */
export const PART_LAYOUT = LAYOUT;

/**
 * Native standing height ≈ |hips.y| with part textures at scale 1.
 * Used for physics body; visual scale is 1:1 (no fit-down).
 */
export const PUPPET_TARGET_H = 222;
