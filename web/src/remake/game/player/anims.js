/**
 * Pose clips: bone local angle offsets (degrees) from rest guard stance.
 * Rest forearms are bent (arm_r_l≈-62, arm_l_l≈-48) — punches straighten them.
 * Facing +x: forward swing on legs/arms uses negative upper-limb angles.
 * Z: right → left → uppercut  |  X: knockout → Bruce Lee
 */

export const REST = {};

export function idlePose(t) {
  const breathe = Math.sin(t * 2.1) * 1.4;
  return {
    hipsY: breathe * 0.35,
    torso: breathe,
    head: -breathe * 0.4,
    arm_l_u: breathe * 0.6,
    arm_l_l: -breathe * 0.4,
    arm_r_u: -breathe * 0.5,
    arm_r_l: breathe * 0.35,
    leg_l_u: -2,
    leg_l_l: 3,
    leg_r_u: 3,
    leg_r_l: -2,
  };
}

/**
 * Richard-Williams run on 6's — legs must SNAP between straight and deep bend.
 * leg_*_l ≈ 0 → straight; 80–110 → hard fold. Wide thigh stride on contact.
 * Facing +x: negative upper = forward. hipsY+: squash, hipsY−: air.
 */
const RUN_STEP = [
  // 0 Contact — both legs nearly straight, solid stride
  // arm_*_l positive = open from rest bend (−62/−48) → milder elbows
  {
    hipsY: 0,
    torso: 18,
    head: -8,
    leg_l_u: -48,
    leg_l_l: 4,
    leg_r_u: 48,
    leg_r_l: 10,
    arm_r_u: -46,
    arm_r_l: 28,
    arm_l_u: 40,
    arm_l_l: 22,
  },
  // 1 Down — front knee folds, hips drop
  {
    hipsY: 10,
    torso: 20,
    head: -5,
    leg_l_u: -24,
    leg_l_l: 72,
    leg_r_u: 36,
    leg_r_l: 62,
    arm_r_u: -34,
    arm_r_l: 26,
    arm_l_u: 28,
    arm_l_l: 20,
  },
  // 2 Push — plant opens, rear tucks
  {
    hipsY: 4,
    torso: 17,
    head: -7,
    leg_l_u: -6,
    leg_l_l: 20,
    leg_r_u: 12,
    leg_r_l: 88,
    arm_r_u: -12,
    arm_r_l: 24,
    arm_l_u: 8,
    arm_l_l: 20,
  },
  // 3 Pass — plant straight, swing knee bent
  {
    hipsY: -2,
    torso: 16,
    head: -8,
    leg_l_u: 8,
    leg_l_l: 6,
    leg_r_u: -18,
    leg_r_l: 90,
    arm_r_u: 12,
    arm_r_l: 22,
    arm_l_u: -16,
    arm_l_l: 24,
  },
  // 4 Up — airborne beat
  {
    hipsY: -9,
    torso: 17,
    head: -9,
    leg_l_u: 30,
    leg_l_l: 12,
    leg_r_u: -40,
    leg_r_l: 52,
    arm_r_u: 34,
    arm_r_l: 24,
    arm_l_u: -38,
    arm_l_l: 26,
  },
  // 5 Fall — lead straightens for contact
  {
    hipsY: -4,
    torso: 18,
    head: -8,
    leg_l_u: 44,
    leg_l_l: 10,
    leg_r_u: -50,
    leg_r_l: 4,
    arm_r_u: 44,
    arm_r_l: 22,
    arm_l_u: -46,
    arm_l_l: 26,
  },
];

const RUN_KEYS = [
  'hipsY',
  'torso',
  'head',
  'leg_l_u',
  'leg_l_l',
  'leg_r_u',
  'leg_r_l',
  'arm_l_u',
  'arm_l_l',
  'arm_r_u',
  'arm_r_l',
];

/** Swap L/R limbs for the opposite step. */
function mirrorRunPose(pose) {
  return {
    hipsY: pose.hipsY,
    torso: pose.torso,
    head: pose.head,
    leg_l_u: pose.leg_r_u,
    leg_l_l: pose.leg_r_l,
    leg_r_u: pose.leg_l_u,
    leg_r_l: pose.leg_l_l,
    arm_l_u: pose.arm_r_u,
    arm_l_l: pose.arm_r_l,
    arm_r_u: pose.arm_l_u,
    arm_r_l: pose.arm_l_l,
  };
}

function lerpRunPose(a, b, u) {
  const out = {};
  for (const k of RUN_KEYS) out[k] = a[k] + (b[k] - a[k]) * u;
  return out;
}

/** Soften torso/arms with amp; keep leg straighten/bend contrast full strength. */
function scaleRunPose(pose, amp) {
  if (amp >= 0.98) return pose;
  const a = Math.max(0.55, amp);
  const out = { ...pose };
  out.hipsY *= a;
  out.torso *= a;
  out.head *= a;
  out.arm_l_u *= a;
  out.arm_l_l *= a;
  out.arm_r_u *= a;
  out.arm_r_l *= a;
  // Legs: only slightly damp thighs, never collapse knee extremes
  out.leg_l_u *= 0.5 + 0.5 * a;
  out.leg_r_u *= 0.5 + 0.5 * a;
  return out;
}

/**
 * Locomotion cycle — vital run on 6's.
 * @param {number} t
 * @param {number|{speed?:number, amp?:number}} [opts] speed=cadence, amp=leg/arm swing (0..1)
 */
export function walkPose(t, opts = 1) {
  const speed = typeof opts === 'number' ? opts : opts.speed ?? 1;
  const amp = typeof opts === 'number' ? 1 : Math.max(0.15, opts.amp ?? 1);

  // 4 steps/sec at speed=1 (reference “normal run on 6's”)
  const stepsPerSec = 4 * speed;
  const stepPhase = ((t * stepsPerSec) % 1 + 1) % 1; // 0..1 within one step
  const stepIndex = Math.floor(t * stepsPerSec);
  const odd = stepIndex % 2 === 1;

  const n = RUN_STEP.length;
  const frame = stepPhase * n;
  const i0 = Math.floor(frame) % n;
  const i1 = (i0 + 1) % n;
  const u = frame - Math.floor(frame); // linear between keys

  let a = RUN_STEP[i0];
  let b = RUN_STEP[i1];
  // Wrap from fall → next contact: next contact is mirrored
  if (i0 === n - 1) b = mirrorRunPose(RUN_STEP[0]);

  let pose = lerpRunPose(a, b, u);
  if (odd) pose = mirrorRunPose(pose);
  return scaleRunPose(pose, amp);
}

export function jumpPose() {
  return {
    torso: -6,
    head: 3,
    arm_l_u: -28,
    arm_l_l: -18,
    arm_r_u: 28,
    arm_r_l: 18,
    leg_l_u: -22,
    leg_l_l: 34,
    leg_r_u: 14,
    leg_r_l: 24,
  };
}

/**
 * Peak tuck — knees to chest, arms on shins, head in (ref frames 2–3).
 * Spin axis is the neck; these are limb offsets only.
 */
export const FLIP_TUCK = {
  torso: 55,
  head: 28,
  arm_l_u: 42,
  arm_l_l: -78,
  arm_r_u: 8,
  arm_r_l: 18,
  leg_l_u: -118,
  leg_l_l: 128,
  leg_r_u: -105,
  leg_r_l: 150,
  hipsY: 28,
};

/**
 * Realistic tucked salto — 5 poses matching the classic flip strip.
 * Runtime replaces t=0 with the live walk pose so the flip starts from the run.
 * World 360° is applied separately around the neck.
 */
export const FLIP = [
  {
    // 0 — walk mid-stride placeholder (overwritten at playFlip)
    t: 0,
    pose: {
      torso: 16,
      head: -7,
      arm_l_u: -22,
      arm_l_l: -16,
      arm_r_u: 22,
      arm_r_l: 16,
      leg_l_u: 28,
      leg_l_l: 44,
      leg_r_u: -28,
      leg_r_l: 18,
      hipsY: -4,
    },
  },
  {
    // 1 — tuck locks in (≈90° of spin)
    t: 0.22,
    pose: {
      torso: 52,
      head: 26,
      arm_l_u: 39,
      arm_l_l: -70,
      arm_r_u: 3,
      arm_r_l: 14,
      leg_l_u: -115,
      leg_l_l: 124,
      leg_r_u: -100,
      leg_r_l: 157,
      hipsY: 24,
    },
  },
  {
    // 3 — peak cannonball (inverted in the strip)
    t: 0.48,
    pose: { ...FLIP_TUCK },
  },
  {
    // 4 — still ball, slight open
    t: 0.74,
    pose: {
      torso: 48,
      head: 18,
      arm_l_u: 32,
      arm_l_l: -62,
      arm_r_u: 6,
      arm_r_l: 16,
      leg_l_u: -100,
      leg_l_l: 118,
      leg_r_u: -92,
      leg_r_l: 140,
      hipsY: 20,
    },
  },
  {
    // 5 — open toward landing crouch
    t: 1,
    pose: {
      torso: 14,
      head: 6,
      arm_l_u: -28,
      arm_l_l: -24,
      arm_r_u: 32,
      arm_r_l: 20,
      leg_l_u: -36,
      leg_l_l: 52,
      leg_r_u: -18,
      leg_r_l: 48,
      hipsY: 10,
    },
  },
];

/** @deprecated use FLIP keyframes via animState — kept for quick sample */
export function flipPose() {
  return { ...FLIP_TUCK };
}

/** After the flip clip — free-fall until landing. */
export function freefallPose() {
  return {
    torso: 8,
    head: -4,
    arm_l_u: -40,
    arm_l_l: -20,
    arm_r_u: 40,
    arm_r_l: 20,
    leg_l_u: -18,
    leg_l_l: 28,
    leg_r_u: 12,
    leg_r_l: 22,
    hipsY: 2,
  };
}

/**
 * Hit reaction — heavy crumple: torso folds away from the blow,
 * arms flail, knees buckle. Not a light flinch.
 */
export const HURT = [
  { t: 0, pose: { torso: 0, head: 0, hipsY: 0 } },
  {
    // Impact snap — fold hard
    t: 0.14,
    pose: {
      torso: -38,
      head: -42,
      arm_l_u: 55,
      arm_l_l: -28,
      arm_r_u: -52,
      arm_r_l: 30,
      hipsY: 18,
      leg_l_u: 22,
      leg_l_l: 16,
      leg_r_u: -18,
      leg_r_l: 20,
    },
  },
  {
    // Hold the bend (reads as real damage)
    t: 0.4,
    pose: {
      torso: -32,
      head: -34,
      arm_l_u: 40,
      arm_l_l: -18,
      arm_r_u: -38,
      arm_r_l: 22,
      hipsY: 14,
      leg_l_u: 16,
      leg_l_l: 12,
      leg_r_u: -12,
      leg_r_l: 14,
    },
  },
  {
    t: 0.72,
    pose: {
      torso: -14,
      head: -16,
      arm_l_u: 16,
      arm_r_u: -14,
      hipsY: 6,
      leg_l_u: 6,
      leg_r_u: -4,
    },
  },
  {
    t: 1,
    pose: {
      torso: 0,
      head: 0,
      hipsY: 0,
      arm_l_u: 0,
      arm_l_l: 0,
      arm_r_u: 0,
      arm_r_l: 0,
      leg_l_u: 0,
      leg_l_l: 0,
      leg_r_u: 0,
      leg_r_l: 0,
    },
  },
];

/** Fallback aim stance; per-gun grips come from WEAPON_DEFS.pose via BonePuppet. */
export function aimPose() {
  return {
    torso: 4,
    head: -4,
    arm_l_u: 18,
    arm_l_l: -22,
    arm_r_u: -48,
    arm_r_l: 42,
    leg_l_u: -5,
    leg_l_l: 5,
    leg_r_u: 7,
    leg_r_l: -3,
  };
}

/**
 * Hand punches: wind up opposite, then commit torso toward the striking side.
 * Facing +x — positive torso opens the right shoulder forward; negative opens left.
 */
/** Right cross — torso leans into the right hand. */
export const PUNCH_R = [
  {
    t: 0,
    pose: { arm_r_u: 0, arm_r_l: 0, arm_l_u: 0, torso: 0, hipsY: 0 },
  },
  {
    t: 0.12,
    pose: {
      arm_r_u: 22,
      arm_r_l: 10,
      arm_l_u: 8,
      // coil: load off the right, lean slightly left
      torso: -14,
      head: 6,
      hipsY: 3,
    },
  },
  {
    t: 0.32,
    pose: {
      arm_r_u: -88,
      arm_r_l: 64,
      arm_l_u: 14,
      arm_l_l: -6,
      // drive: whole torso tips into the right cross
      torso: 22,
      head: -10,
      hipsY: -6,
    },
  },
  {
    t: 0.55,
    pose: {
      arm_r_u: -55,
      arm_r_l: 40,
      torso: 12,
      head: -5,
      hipsY: -2,
    },
  },
  {
    t: 1,
    pose: {
      arm_r_u: 0,
      arm_r_l: 0,
      arm_l_u: 0,
      arm_l_l: 0,
      torso: 0,
      head: 0,
      hipsY: 0,
    },
  },
];

/** Left cross — torso leans into the left hand. */
export const PUNCH_L = [
  {
    t: 0,
    pose: { arm_l_u: 0, arm_l_l: 0, arm_r_u: 0, torso: 0, hipsY: 0 },
  },
  {
    t: 0.12,
    pose: {
      arm_l_u: 24,
      arm_l_l: 12,
      arm_r_u: -6,
      // coil: load off the left, lean slightly right
      torso: 14,
      head: -6,
      hipsY: 3,
    },
  },
  {
    t: 0.34,
    pose: {
      arm_l_u: -92,
      arm_l_l: 52,
      arm_r_u: 12,
      arm_r_l: -8,
      // drive: torso tips into the left cross
      torso: -22,
      head: 10,
      hipsY: -6,
    },
  },
  {
    t: 0.58,
    pose: {
      arm_l_u: -50,
      arm_l_l: 28,
      torso: -12,
      head: 5,
      hipsY: -2,
    },
  },
  {
    t: 1,
    pose: {
      arm_l_u: 0,
      arm_l_l: 0,
      arm_r_u: 0,
      arm_r_l: 0,
      torso: 0,
      head: 0,
      hipsY: 0,
    },
  },
];

/** Right uppercut — crouch coil, then torso drives up with the right. */
export const PUNCH_UPPER_R = [
  {
    t: 0,
    pose: { arm_r_u: 0, arm_r_l: 0, torso: 0, hipsY: 0, leg_r_u: 0, head: 0 },
  },
  {
    t: 0.16,
    pose: {
      arm_r_u: 48,
      arm_r_l: -8,
      arm_l_u: 14,
      arm_l_l: -6,
      // sit into the right hip
      torso: 18,
      head: 8,
      hipsY: 16,
      leg_r_u: 12,
      leg_l_u: -4,
    },
  },
  {
    t: 0.38,
    pose: {
      arm_r_u: -118,
      arm_r_l: 72,
      arm_l_u: 22,
      arm_l_l: -10,
      // explode upward — torso still committed to the right side
      torso: 16,
      head: -4,
      hipsY: -18,
      leg_r_u: -8,
      leg_l_u: 4,
    },
  },
  {
    t: 0.58,
    pose: {
      arm_r_u: -85,
      arm_r_l: 50,
      arm_l_u: 12,
      torso: 10,
      head: 2,
      hipsY: -8,
    },
  },
  {
    t: 1,
    pose: {
      arm_r_u: 0,
      arm_r_l: 0,
      arm_l_u: 0,
      arm_l_l: 0,
      torso: 0,
      head: 0,
      hipsY: 0,
      leg_r_u: 0,
      leg_l_u: 0,
    },
  },
];

/**
 * Knockout left kick — high forward (negative = toward facing).
 */
export const KICK_KNOCKOUT = [
  {
    t: 0,
    pose: { leg_l_u: 0, leg_l_l: 0, torso: 0, arm_l_u: 0, hipsY: 0 },
  },
  {
    t: 0.16,
    pose: {
      // load: chamber knee toward facing
      leg_l_u: -42,
      leg_l_l: 70,
      torso: -8,
      arm_l_u: 16,
      arm_r_u: -10,
      head: 2,
      hipsY: 4,
      leg_r_u: 6,
    },
  },
  {
    t: 0.38,
    pose: {
      // whip high forward — straightened shin
      leg_l_u: -105,
      leg_l_l: 8,
      torso: 16,
      arm_l_u: -22,
      arm_r_u: 18,
      head: -12,
      hipsY: -10,
      leg_r_u: -10,
    },
  },
  {
    t: 0.58,
    pose: {
      leg_l_u: -70,
      leg_l_l: 16,
      torso: 8,
      hipsY: -4,
    },
  },
  {
    t: 1,
    pose: {
      leg_l_u: 0,
      leg_l_l: 0,
      torso: 0,
      head: 0,
      arm_l_u: 0,
      arm_r_u: 0,
      hipsY: 0,
      leg_r_u: 0,
    },
  },
];

/**
 * Bruce Lee left side/snap kick — chamber then thrust FORWARD.
 */
export const KICK_BRUCE_L = [
  {
    t: 0,
    pose: { leg_l_u: 0, leg_l_l: 0, torso: 0, hipsY: 0, arm_l_u: 0 },
  },
  {
    t: 0.12,
    pose: {
      leg_l_u: -28,
      leg_l_l: 75,
      torso: -6,
      arm_l_u: 22,
      arm_r_u: -16,
      hipsY: 6,
      head: 2,
    },
  },
  {
    t: 0.28,
    pose: {
      leg_l_u: -58,
      leg_l_l: 98,
      torso: -10,
      arm_l_u: 30,
      arm_r_u: -22,
      hipsY: 8,
      head: 4,
    },
  },
  {
    t: 0.45,
    pose: {
      // thrust forward, leg almost straight
      leg_l_u: -98,
      leg_l_l: 5,
      torso: 14,
      arm_l_u: -26,
      arm_r_u: 24,
      head: -10,
      hipsY: -10,
      leg_r_u: -8,
    },
  },
  {
    t: 0.62,
    pose: {
      leg_l_u: -55,
      leg_l_l: 30,
      torso: 6,
      hipsY: -2,
    },
  },
  {
    t: 0.78,
    pose: {
      leg_l_u: -30,
      leg_l_l: 55,
      torso: -2,
      hipsY: 2,
    },
  },
  {
    t: 1,
    pose: {
      leg_l_u: 0,
      leg_l_l: 0,
      torso: 0,
      head: 0,
      arm_l_u: 0,
      arm_r_u: 0,
      hipsY: 0,
      leg_r_u: 0,
    },
  },
];

// ---------------------------------------------------------------------------
// Brawl-core strikes. Each clip has one "impact" key — the brawl view lines it
// up with the first active tick of the move, so the limb lands exactly when
// the hitbox does (see brawl/clips.js).
// Facing +x: negative thigh angle = leg forward/up; negative torso = lean back.

/** K1 — fast front snap kick with the right leg, mid height. */
export const KICK_SNAP_R = [
  { t: 0, pose: { leg_r_u: 0, leg_r_l: 0, torso: 0, hipsY: 0 } },
  {
    t: 0.24,
    pose: {
      leg_r_u: -72, leg_r_l: 100, leg_l_u: 4, leg_l_l: 10,
      torso: -6, head: 2, hipsY: 3,
      arm_l_u: 22, arm_l_l: -14, arm_r_u: -18, arm_r_l: 24,
    },
  },
  {
    t: 0.42,
    pose: {
      leg_r_u: -96, leg_r_l: 2, leg_l_u: 8, leg_l_l: 2,
      torso: -16, head: 8, hipsY: -7,
      arm_l_u: 34, arm_l_l: -22, arm_r_u: -34, arm_r_l: 34,
    },
  },
  {
    t: 0.62,
    pose: {
      leg_r_u: -62, leg_r_l: 86, leg_l_u: 4, leg_l_l: 6,
      torso: -6, head: 2, hipsY: 2,
      arm_l_u: 18, arm_r_u: -14,
    },
  },
  { t: 1, pose: { leg_r_u: 0, leg_r_l: 0, leg_l_u: 0, leg_l_l: 0, torso: 0, head: 0, hipsY: 0, arm_l_u: 0, arm_l_l: 0, arm_r_u: 0, arm_r_l: 0 } },
];

/** K2 — Bruce Lee high kick to the head: knee chambers high, leg snaps up near vertical, torso leans back. */
export const KICK_HEAD_R = [
  { t: 0, pose: { leg_r_u: 0, leg_r_l: 0, torso: 0, hipsY: 0 } },
  {
    t: 0.18,
    pose: {
      leg_r_u: -108, leg_r_l: 118, leg_l_u: 4, leg_l_l: 8,
      torso: -10, head: 4, hipsY: 5,
      arm_l_u: 36, arm_l_l: -32, arm_r_u: -26, arm_r_l: 42,
    },
  },
  {
    t: 0.36,
    pose: {
      leg_r_u: -152, leg_r_l: -4, leg_l_u: 10, leg_l_l: 0,
      torso: -32, head: 16, hipsY: -12,
      arm_l_u: 58, arm_l_l: -18, arm_r_u: -42, arm_r_l: 18,
    },
  },
  {
    t: 0.6,
    pose: {
      leg_r_u: -142, leg_r_l: 6, leg_l_u: 8, leg_l_l: 2,
      torso: -27, head: 13, hipsY: -9,
      arm_l_u: 50, arm_l_l: -16, arm_r_u: -36, arm_r_l: 20,
    },
  },
  {
    t: 0.8,
    pose: {
      leg_r_u: -80, leg_r_l: 96, leg_l_u: 4, leg_l_l: 6,
      torso: -10, head: 4, hipsY: 2,
      arm_l_u: 20, arm_r_u: -16,
    },
  },
  { t: 1, pose: { leg_r_u: 0, leg_r_l: 0, leg_l_u: 0, leg_l_l: 0, torso: 0, head: 0, hipsY: 0, arm_l_u: 0, arm_l_l: 0, arm_r_u: 0, arm_r_l: 0 } },
];

/** Spinning hook kick (the view turns the body 360° around it). */
export const KICK_SPIN_R = [
  { t: 0, pose: { leg_r_u: 0, leg_r_l: 0, torso: 0, hipsY: 0 } },
  {
    t: 0.18,
    pose: {
      leg_r_u: -24, leg_r_l: 56, leg_l_u: 6, leg_l_l: 14,
      torso: 10, head: -4, hipsY: 9,
      arm_l_u: 34, arm_l_l: -30, arm_r_u: -30, arm_r_l: 36,
    },
  },
  {
    t: 0.4,
    pose: {
      leg_r_u: -108, leg_r_l: 2, leg_l_u: 10, leg_l_l: 2,
      torso: -20, head: 9, hipsY: -9,
      arm_l_u: 64, arm_l_l: -8, arm_r_u: -54, arm_r_l: 10,
    },
  },
  {
    t: 0.72,
    pose: {
      leg_r_u: -100, leg_r_l: 8, leg_l_u: 8, leg_l_l: 4,
      torso: -17, head: 7, hipsY: -6,
      arm_l_u: 56, arm_l_l: -10, arm_r_u: -46, arm_r_l: 12,
    },
  },
  { t: 1, pose: { leg_r_u: 0, leg_r_l: 0, leg_l_u: 0, leg_l_l: 0, torso: 0, head: 0, hipsY: 0, arm_l_u: 0, arm_l_l: 0, arm_r_u: 0, arm_r_l: 0 } },
];

/** Flying kick: lead leg spears forward-down, rear leg tucked. Held until landing. */
export const KICK_FLY_R = [
  {
    t: 0,
    pose: {
      leg_r_u: -30, leg_r_l: 60, leg_l_u: -20, leg_l_l: 70,
      torso: -4, head: 2, arm_l_u: -20, arm_r_u: 20,
    },
  },
  {
    t: 0.22,
    pose: {
      leg_r_u: -72, leg_r_l: 0, leg_l_u: -34, leg_l_l: 118,
      torso: -16, head: 8, hipsY: -4,
      arm_l_u: 44, arm_l_l: -40, arm_r_u: -32, arm_r_l: 52,
    },
  },
  {
    t: 1,
    pose: {
      leg_r_u: -66, leg_r_l: 4, leg_l_u: -30, leg_l_l: 112,
      torso: -14, head: 7, hipsY: -4,
      arm_l_u: 40, arm_l_l: -36, arm_r_u: -28, arm_r_l: 48,
    },
  },
];

/** Dash punch: whole body flies behind a straight right. */
export const PUNCH_SUPERMAN_R = [
  { t: 0, pose: { arm_r_u: 0, arm_r_l: 0, torso: 0, hipsY: 0 } },
  {
    t: 0.2,
    pose: {
      arm_r_u: -96, arm_r_l: 8, arm_l_u: 42, arm_l_l: -30,
      torso: 28, head: -12, hipsY: -10,
      leg_l_u: 34, leg_l_l: 46, leg_r_u: -28, leg_r_l: 22,
    },
  },
  {
    t: 0.55,
    pose: {
      arm_r_u: -86, arm_r_l: 18, arm_l_u: 34, arm_l_l: -24,
      torso: 22, head: -9, hipsY: -6,
      leg_l_u: 24, leg_l_l: 30, leg_r_u: -18, leg_r_l: 14,
    },
  },
  { t: 1, pose: { arm_r_u: 0, arm_r_l: 0, arm_l_u: 0, arm_l_l: 0, torso: 0, head: 0, hipsY: 0, leg_l_u: 0, leg_l_l: 0, leg_r_u: 0, leg_r_l: 0 } },
];

/** Holding a grabbed enemy: both arms forward on their collar. */
export const GRAB_HOLD = [
  {
    t: 0,
    pose: {
      arm_r_u: -62, arm_r_l: 34, arm_l_u: -54, arm_l_l: 30,
      torso: 10, head: -4, hipsY: 4,
      leg_l_u: 10, leg_l_l: 12, leg_r_u: -14, leg_r_l: 16,
    },
  },
  {
    t: 1,
    pose: {
      arm_r_u: -62, arm_r_l: 34, arm_l_u: -54, arm_l_l: 30,
      torso: 10, head: -4, hipsY: 4,
      leg_l_u: 10, leg_l_l: 12, leg_r_u: -14, leg_r_l: 16,
    },
  },
];

/** Knee strike to a held enemy (arms keep the hold). */
export const KNEE_R = [
  { t: 0, pose: { ...GRAB_HOLD[0].pose } },
  {
    t: 0.3,
    pose: {
      arm_r_u: -48, arm_r_l: 46, arm_l_u: -42, arm_l_l: 44,
      torso: 18, head: -8, hipsY: -6,
      leg_r_u: -96, leg_r_l: 92, leg_l_u: 6, leg_l_l: 2,
    },
  },
  {
    t: 0.6,
    pose: {
      arm_r_u: -56, arm_r_l: 38, arm_l_u: -50, arm_l_l: 34,
      torso: 14, head: -6, hipsY: 0,
      leg_r_u: -50, leg_r_l: 60, leg_l_u: 8, leg_l_l: 8,
    },
  },
  { t: 1, pose: { ...GRAB_HOLD[0].pose } },
];

/** Throw: dip and heave the held body up and forward. */
export const THROW_HEAVE = [
  { t: 0, pose: { ...GRAB_HOLD[0].pose } },
  {
    t: 0.3,
    pose: {
      arm_r_u: -20, arm_r_l: 40, arm_l_u: -16, arm_l_l: 36,
      torso: 26, head: -6, hipsY: 18,
      leg_l_u: 24, leg_l_l: 50, leg_r_u: -30, leg_r_l: 56,
    },
  },
  {
    t: 0.5,
    pose: {
      arm_r_u: -150, arm_r_l: 10, arm_l_u: -140, arm_l_l: 12,
      torso: -18, head: 10, hipsY: -12,
      leg_l_u: 18, leg_l_l: 4, leg_r_u: -20, leg_r_l: 6,
    },
  },
  {
    t: 0.72,
    pose: {
      arm_r_u: -110, arm_r_l: 20, arm_l_u: -100, arm_l_l: 20,
      torso: -6, head: 4, hipsY: -4,
    },
  },
  { t: 1, pose: { arm_r_u: 0, arm_r_l: 0, arm_l_u: 0, arm_l_l: 0, torso: 0, head: 0, hipsY: 0, leg_l_u: 0, leg_l_l: 0, leg_r_u: 0, leg_r_l: 0 } },
];

/** Rage special: crouch and gather, then explode outward. */
export const RAGE_STOMP = [
  { t: 0, pose: { torso: 0, hipsY: 0 } },
  {
    t: 0.3,
    pose: {
      torso: 24, head: 12, hipsY: 26,
      arm_r_u: 30, arm_r_l: -70, arm_l_u: 30, arm_l_l: -70,
      leg_l_u: 40, leg_l_l: 70, leg_r_u: -44, leg_r_l: 76,
    },
  },
  {
    t: 0.42,
    pose: {
      torso: -14, head: -18, hipsY: -14,
      arm_r_u: -150, arm_r_l: 0, arm_l_u: 150, arm_l_l: 0,
      leg_l_u: 34, leg_l_l: 4, leg_r_u: -36, leg_r_l: 4,
    },
  },
  {
    t: 0.7,
    pose: {
      torso: -10, head: -12, hipsY: -10,
      arm_r_u: -140, arm_r_l: 6, arm_l_u: 140, arm_l_l: 6,
      leg_l_u: 30, leg_l_l: 6, leg_r_u: -32, leg_r_l: 6,
    },
  },
  { t: 1, pose: { torso: 0, head: 0, hipsY: 0, arm_r_u: 0, arm_r_l: 0, arm_l_u: 0, arm_l_l: 0, leg_l_u: 0, leg_l_l: 0, leg_r_u: 0, leg_r_l: 0 } },
];

/** Z: right → left → uppercut right */
export const PUNCH_Z_COMBO = [
  { frames: PUNCH_R, dur: 0.32, hand: 'r', style: 'punch' },
  { frames: PUNCH_L, dur: 0.34, hand: 'l', style: 'punch' },
  { frames: PUNCH_UPPER_R, dur: 0.42, hand: 'r', style: 'upper' },
];

/** X: knockout → Bruce Lee */
export const PUNCH_X_COMBO = [
  { frames: KICK_KNOCKOUT, dur: 0.42, hand: 'l', style: 'knockout' },
  { frames: KICK_BRUCE_L, dur: 0.5, hand: 'l', style: 'bruce' },
];

export const PUNCH_Z = PUNCH_R;
export const PUNCH_X = KICK_KNOCKOUT;
export const KICK_L = KICK_KNOCKOUT;

export const RECOIL = [
  { t: 0, pose: { arm_r_u: -78, arm_r_l: 58 } },
  { t: 0.25, pose: { arm_r_u: -62, arm_r_l: 48, torso: -5 } },
  { t: 1, pose: { arm_r_u: -78, arm_r_l: 58, torso: 0 } },
];

/**
 * Soft ease-in-out (sine): mild slow→fast→slow, less whip in the middle than cubic.
 */
export function easeInOutSine(t) {
  const x = Math.max(0, Math.min(1, t));
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

/** @deprecated alias — punches use sine now */
export function easeInOutCubic(t) {
  return easeInOutSine(t);
}

/** Ease-out cubic: fast start → slow end. */
export function easeOutCubic(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

/** Smoothstep between two keyframe poses (secondary blend). */
function smoothstep(u) {
  return u * u * (3 - 2 * u);
}

/**
 * @param {Array<{t:number,pose:object}>} frames
 * @param {number} t linear 0..1 clip time
 * @param {{ ease?: boolean|((n:number)=>number) }} [opts]
 *   ease=true → ease-in-out; false → linear; fn → custom curve
 */
export function sampleKeyframes(frames, t, opts = {}) {
  if (!frames?.length) return {};
  let te = Math.max(0, Math.min(1, t));
  if (typeof opts.ease === 'function') te = opts.ease(te);
  else if (opts.ease !== false) te = easeInOutSine(te);
  if (te <= frames[0].t) return { ...frames[0].pose };
  if (te >= frames[frames.length - 1].t) return { ...frames[frames.length - 1].pose };
  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = frames[i];
    const b = frames[i + 1];
    if (te >= a.t && te <= b.t) {
      const u = (te - a.t) / (b.t - a.t || 1);
      const blend = smoothstep(u);
      const pose = {};
      const keys = new Set([...Object.keys(a.pose), ...Object.keys(b.pose)]);
      for (const k of keys) {
        const va = a.pose[k] ?? 0;
        const vb = b.pose[k] ?? 0;
        pose[k] = va + (vb - va) * blend;
      }
      return pose;
    }
  }
  return {};
}
