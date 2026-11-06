/**
 * Side-view weapons (barrel → +X).
 * Mounted on torso: body → gun → L-arm → R-arm (fist on grip).
 * x/y = nudge from hand_r in torso space.
 */
export const WEAPON_DEFS = {
  1: {
    key: 'wpn_pistol',
    file: 'pistol.png',
    originX: 0.32,
    originY: 0.72,
    x: 6,
    y: 2,
    angle: 0,
    scale: 0.72,
    pose: {
      torso: 2,
      head: -2,
      arm_r_u: -72,
      arm_r_l: 62,
      arm_l_u: -18,
      arm_l_l: -8,
    },
  },
  2: {
    key: 'wpn_shotgun',
    file: 'shotgun.png',
    originX: 0.22,
    originY: 0.68,
    x: 4,
    y: 0,
    angle: 0,
    scale: 1.05,
    pose: {
      torso: 4,
      head: -4,
      arm_r_u: -58,
      arm_r_l: 48,
      arm_l_u: -62,
      arm_l_l: 44,
    },
  },
  3: {
    key: 'wpn_ak47',
    file: 'ak47.png',
    originX: 0.26,
    originY: 0.52,
    x: 4,
    y: 2,
    angle: 0,
    scale: 1.22,
    pose: {
      torso: 5,
      head: -5,
      arm_r_u: -64,
      arm_r_l: 52,
      arm_l_u: -66,
      arm_l_l: 48,
    },
  },
  4: {
    key: 'wpn_rpg',
    file: 'rpg.png',
    originX: 0.32,
    originY: 0.75,
    x: 2,
    y: -6,
    angle: -4,
    scale: 1.28,
    pose: {
      torso: 8,
      head: -8,
      arm_r_u: -52,
      arm_r_l: 42,
      arm_l_u: -70,
      arm_l_l: 52,
    },
  },
};

export function weaponTextureKey(id) {
  return WEAPON_DEFS[id]?.key || null;
}

export function weaponAimPose(id) {
  return WEAPON_DEFS[id]?.pose || null;
}

export const WEAPON_CYCLE = [0, 1, 2, 3, 4];
