import { idlePose, walkPose } from '../game/player/anims.js';

/**
 * Cutscene body language for the bone puppets: a gesture is a pose (bone angle
 * offsets from the guard stance, see game/player/anims.js) that may move over
 * time — a wave, a nod, laughter. FighterView drives the puppet with it while
 * the fighter stands still and a gesture is set (BrawlScene.setGesture).
 *
 * The rigs see the fighter from the side: arm_l is the FRONT arm (towards
 * whoever he talks to), arm_r the one behind the body. Negative upper-arm
 * angles raise the arm forward / up; a raised back arm goes up behind the head,
 * so pointing, waving and the like use the front arm. Positive forearm angles
 * open the bent guard elbow.
 */

/** Arms down, shoulders loose: the default stance while people talk. */
const REST = { arm_r_u: 26, arm_r_l: 58, arm_l_u: 40, arm_l_l: 72, leg_l_u: -3, leg_l_l: 3, leg_r_u: 3, leg_r_l: -2 };

const S = Math.sin;
const osc = (t, hz, amp, ph = 0) => S(t * hz * Math.PI * 2 + ph) * amp;

export const GESTURES = {
  rest: () => ({ ...REST }),
  idle: (t) => idlePose(t),
  /** Hands move a little with the words (the front arm). */
  talk: (t) => ({ ...REST, arm_l_u: -18 + osc(t, 0.9, 12), arm_l_l: 30 + osc(t, 1.3, 18, 1), head: osc(t, 0.8, 3) }),
  point: (t) => ({ ...REST, arm_l_u: -75, arm_l_l: 60, torso: -4, head: -2 + osc(t, 0.5, 1) }),
  offer: (t) => ({ ...REST, arm_l_u: -45, arm_l_l: 70 + osc(t, 0.6, 4), torso: 4, head: 4 }),
  shrug: (t) => {
    const k = Math.min(1, t * 4);
    return { ...REST, arm_l_u: 10 * k, arm_l_l: -45 * k, arm_r_u: 10 * k, arm_r_l: -45 * k, head: 12 * k, torso: -2, hipsY: -2 * k };
  },
  cross: (t) => ({ ...REST, arm_l_u: 20, arm_l_l: -30, arm_r_u: 20, arm_r_l: -30, torso: -5 + osc(t, 0.4, 1), head: -4 }),
  fist: (t) => ({ ...REST, arm_l_u: -125 + osc(t, 2.4, 6), arm_l_l: -75, torso: -6, head: -6 }),
  wave: (t) => ({ ...REST, arm_l_u: -130, arm_l_l: -30 + osc(t, 2.2, 26), head: 4 }),
  facepalm: () => ({ ...REST, arm_l_u: -55, arm_l_l: -130, torso: 10, head: 22 }),
  bow: (t) => {
    const k = Math.min(1, t * 2.5);
    return { ...REST, torso: 34 * k, head: 14 * k, arm_l_u: -25 * k, arm_l_l: -45 * k, hipsY: 4 * k };
  },
  think: (t) => ({ ...REST, arm_l_u: -32, arm_l_l: -128, head: -8 + osc(t, 0.3, 3), torso: -2 }),
  flex: (t) => ({ ...REST, arm_l_u: -95, arm_l_l: -100 + osc(t, 1.4, 8), arm_r_u: -80, arm_r_l: -100 + osc(t, 1.4, 8, 1), torso: -8, head: -6, hipsY: 2 }),
  hands_up: (t) => ({ ...REST, arm_l_u: -140, arm_l_l: -40 + osc(t, 3, 5), arm_r_u: -130, arm_r_l: -40 + osc(t, 3, 5, 1), torso: -6, head: -6, hipsY: -3 }),
  laugh: (t) => ({ ...REST, arm_l_u: -8, arm_l_l: -66, arm_r_u: -10, arm_r_l: -70, torso: -10 + osc(t, 4.5, 5), head: -16 + osc(t, 4.5, 6, 0.5), hipsY: osc(t, 4.5, 2) }),
  nod: (t) => ({ ...REST, head: t < 1.3 ? Math.abs(osc(t, 1.6, 14)) : 0 }),
  shake: (t) => ({ ...REST, head: t < 1.4 ? osc(t, 3.2, 7) : 0, torso: t < 1.4 ? osc(t, 3.2, 2) : 0 }),
  sad: (t) => ({ ...REST, head: 22 + osc(t, 0.25, 2), torso: 9, hipsY: 3 }),
  angry: (t) => ({ ...REST, arm_l_u: 10, arm_l_l: -88, arm_r_u: 14, arm_r_l: -92, torso: 10 + osc(t, 7, 1.5), head: 6 + osc(t, 7, 1.5) }),
  cheer: (t) => ({ ...REST, arm_l_u: -150, arm_l_l: 30 + osc(t, 2, 10), arm_r_u: -140, arm_r_l: 30 + osc(t, 2, 10, 1), torso: -8, head: -12, hipsY: -Math.abs(osc(t, 2, 8)) }),
  phone: (t) => ({ ...REST, arm_l_u: -45, arm_l_l: -112, head: 16 + osc(t, 0.4, 2), torso: 4 }),
  sing: (t) => ({ ...REST, arm_l_u: -95 + osc(t, 0.7, 14), arm_l_l: 40, head: -14 + osc(t, 1.1, 4), torso: -8 }),
  clap: (t) => ({ ...REST, arm_l_u: -50, arm_l_l: -62 + Math.abs(osc(t, 2.6, 22)), arm_r_u: -45, arm_r_l: -66 + Math.abs(osc(t, 2.6, 22)), head: -4 }),
  eat: (t) => ({ ...REST, arm_l_u: -42, arm_l_l: -122 + Math.abs(osc(t, 1.5, 16)), head: 6 + osc(t, 3, 3), torso: 3 }),
  guard: () => ({ arm_r_u: -40, arm_r_l: -95, arm_l_u: -30, arm_l_l: -100, torso: -4, head: 10, hipsY: 6, leg_l_u: 12, leg_l_l: 16, leg_r_u: -12, leg_r_l: 18 }),
  salute: () => ({ ...REST, arm_l_u: -112, arm_l_l: -132, head: -4, torso: -4 }),
  walk: (t) => walkPose(t, { amp: 0.55, speed: 0.75 }),
};

export const GESTURE_NAMES = Object.keys(GESTURES);

/** Pose of a gesture `t` seconds after it started (breathing on top). */
export function gesturePose(name, t) {
  const g = GESTURES[name] || GESTURES.rest;
  const p = g(t);
  if (name === 'walk' || name === 'idle') return p;
  const b = S(t * 2.1) * 1.2;
  return { ...p, torso: (p.torso || 0) + b, hipsY: (p.hipsY || 0) + b * 0.3 };
}
