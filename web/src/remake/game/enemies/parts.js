/**
 * Bone-puppet part packs for bots + boss.
 * Layout mirrors the player so the same BonePuppet / walkPose work.
 */
import { CHAR_TARGET_H } from '../constants.js';
import { PART_LAYOUT as PLAYER_LAYOUT, PUPPET_TARGET_H } from '../player/parts.js';

const PART_NAMES = [
  'head',
  'torso',
  'arm_r_u',
  'arm_r_l',
  'arm_l_u',
  'arm_l_l',
  'leg_l_u',
  'leg_l_l',
  'leg_r_u',
  'leg_r_l',
];

/** Same shrink as Player (native parts → CHAR_TARGET_H). */
const PLAYER_SCALE = 1 / 1.5;
/** On-screen head height ≈ head part × player scale. */
const PLAYER_HEAD_H = Math.round(116 * PLAYER_SCALE);

function cloneLayout() {
  return JSON.parse(JSON.stringify(PLAYER_LAYOUT));
}

/**
 * Scale so display height = player height + extraHeads × head height.
 * Nikita: +0.5 head taller than the player.
 */
function scaleVsPlayer(extraHeads = 0) {
  const targetH = CHAR_TARGET_H + PLAYER_HEAD_H * extraHeads;
  return PLAYER_SCALE * (targetH / CHAR_TARGET_H);
}

/** @type {Record<string, { id: string, label: string, folder: string, scale: number, layout: object, targetH: number, displayH: number }>} */
export const ENEMY_SKINS = {
  nikita: {
    id: 'nikita',
    label: 'Никита',
    folder: 'nikita',
    /** Facing: original sprite walked left; puppet faces right by default → flip in Enemy */
    defaultDir: 0,
    /** Slightly taller than player (~¼ head — was too big at ½) */
    scale: scaleVsPlayer(0.25),
    /** User-tuned pivots from bone editor (kept). Parts use uniform Desktop scale. */
    layout: {
      hips: { x: 0, y: -221.8 },
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
        originY: 0.79,
        x: 4,
        y: -147,
        angle: 0,
      },
      arm_l_u: {
        parent: 'hips',
        tex: 'arm_l_u',
        originX: 0.29,
        originY: 0.12,
        x: 34,
        y: -117,
        angle: 2,
      },
      arm_l_l: {
        parent: 'arm_l_u',
        tex: 'arm_l_l',
        originX: 0.26,
        originY: 0.21,
        x: 22,
        y: 57,
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
        originX: 0.59,
        originY: 0.14,
        x: -44,
        y: -119,
        angle: -6,
      },
      arm_r_l: {
        parent: 'arm_r_u',
        tex: 'arm_r_l',
        originX: 0.68,
        originY: 0.19,
        x: -6,
        y: 67,
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
        x: -12,
        y: 3,
        angle: 6,
      },
      leg_r_l: {
        parent: 'leg_r_u',
        tex: 'leg_r_l',
        originX: 0.78,
        originY: 0.07,
        x: -22,
        y: 68,
        angle: -4,
      },
      leg_l_u: {
        parent: 'hips',
        tex: 'leg_l_u',
        originX: 0.41,
        originY: 0.21,
        x: 20,
        y: 11,
        angle: -4,
      },
      leg_l_l: {
        parent: 'leg_l_u',
        tex: 'leg_l_l',
        originX: 0.37,
        originY: 0.07,
        x: 21,
        y: 51,
        angle: 2,
      },
    },
    targetH: PUPPET_TARGET_H,
    displayH: Math.round(CHAR_TARGET_H + PLAYER_HEAD_H * 0.25),
    maxHp: 120,
  },
  buiniy: {
    id: 'buiniy',
    label: 'Буйный',
    folder: 'buiniy',
    defaultDir: 1,
    scale: PLAYER_SCALE,
    layout: cloneLayout(),
    targetH: PUPPET_TARGET_H,
    displayH: CHAR_TARGET_H,
    maxHp: 160,
  },
  boss1: {
    id: 'boss1',
    label: 'Босс',
    folder: 'boss1',
    defaultDir: 0,
    /** Noticeably bigger than street bots */
    scale: scaleVsPlayer(1.0),
    layout: cloneLayout(),
    targetH: PUPPET_TARGET_H,
    displayH: Math.round(CHAR_TARGET_H + PLAYER_HEAD_H),
    maxHp: 500,
  },
};

export function enemyPartTextureKey(skinId, partName) {
  return `enemy_${skinId}_${partName}`;
}

export function listEnemyPartLoads() {
  const loads = [];
  for (const skin of Object.values(ENEMY_SKINS)) {
    for (const name of PART_NAMES) {
      loads.push({
        key: enemyPartTextureKey(skin.id, name),
        url: `assets/enemies/${skin.folder}/parts/${name}.png`,
      });
    }
  }
  return loads;
}

export function getEnemySkin(id) {
  return ENEMY_SKINS[id] || ENEMY_SKINS.nikita;
}
