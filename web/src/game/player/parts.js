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
 * Rest = user-tuned guard stance.
 */
export const PART_LAYOUT = {
  hips: {
    x: 0,
    y: -221.8,
  },
  torso: {
    parent: 'hips',
    tex: 'torso',
    originX: 0.5,
    originY: 0.94,
    x: -1,
    y: 0,
    angle: 0,
  },
  head: {
    parent: 'torso',
    tex: 'head',
    originX: 0.5,
    originY: 0.92,
    x: 2,
    y: -144,
    angle: 0,
  },
  arm_l_u: {
    parent: 'hips',
    tex: 'arm_l_u',
    originX: 0.29,
    originY: 0.12,
    x: 29,
    y: -115,
    angle: 2,
  },
  arm_l_l: {
    parent: 'arm_l_u',
    tex: 'arm_l_l',
    originX: 0.55,
    originY: 0.01,
    x: 20,
    y: 50,
    angle: -48,
  },
  hand_l: {
    parent: 'arm_l_l',
    tex: null,
    originX: 0.5,
    originY: 0.5,
    x: 4,
    y: 64,
    angle: 0,
  },
  arm_r_u: {
    parent: 'torso',
    tex: 'arm_r_u',
    originX: 0.55,
    originY: 0.12,
    x: -47,
    y: -111,
    angle: -6,
  },
  arm_r_l: {
    parent: 'arm_r_u',
    tex: 'arm_r_l',
    originX: 0.37,
    originY: 0,
    x: -8,
    y: 63,
    angle: -62,
  },
  hand_r: {
    parent: 'arm_r_l',
    tex: null,
    originX: 0.5,
    originY: 0.5,
    x: 0,
    y: 66,
    angle: 0,
  },
  leg_r_u: {
    parent: 'hips',
    tex: 'leg_r_u',
    originX: 0.69,
    originY: 0.16,
    x: -5,
    y: 11,
    angle: 0,
  },
  leg_r_l: {
    parent: 'leg_r_u',
    tex: 'leg_r_l',
    originX: 0.72,
    originY: 0.07,
    x: -24,
    y: 78,
    angle: 2,
  },
  leg_l_u: {
    parent: 'hips',
    tex: 'leg_l_u',
    originX: 0.41,
    originY: 0.13,
    x: 25,
    y: 11,
    angle: -4,
  },
  leg_l_l: {
    parent: 'leg_l_u',
    tex: 'leg_l_l',
    originX: 0.4,
    originY: 0.06,
    x: 23,
    y: 69,
    angle: 2,
  },
};

/**
 * Native standing height ≈ |hips.y| with part textures at scale 1.
 * Used for physics body; visual scale is 1:1 (no fit-down).
 */
export const PUPPET_TARGET_H = 222;
