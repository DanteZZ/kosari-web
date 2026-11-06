import Phaser from 'phaser';
import { partTextureKey } from './parts.js';
import { getLayout, layoutState } from './layoutState.js';
import {
  idlePose,
  walkPose,
  jumpPose,
  freefallPose,
  aimPose,
  FLIP,
  RECOIL,
  HURT,
  sampleKeyframes,
} from './anims.js';

/** Clone flip frames with t=0 taken from the live walk pose. */
function flipFramesFromWalk(baseFrames, time, walkOpts = {}) {
  const src = baseFrames?.length ? baseFrames : FLIP;
  const start = walkPose(time, walkOpts);
  return src.map((f, i) => {
    if (i === 0 || f.t === 0) return { t: 0, pose: { ...start } };
    return { t: f.t, pose: { ...f.pose } };
  });
}

/** Fallback duration of one somersault turn (seconds). Editor clip overrides. */
export const FLIP_DUR = 0.85;
import { getPunchCombo, getFlipClip } from './animState.js';
import { WEAPON_DEFS, weaponAimPose } from './weapons.js';

const ANGLE_BONES = [
  'torso',
  'head',
  'arm_l_u',
  'arm_l_l',
  'arm_r_u',
  'arm_r_l',
  'leg_l_u',
  'leg_l_l',
  'leg_r_u',
  'leg_r_l',
];

export class BonePuppet {
  /**
   * @param {Phaser.Scene} scene
   * @param {Phaser.GameObjects.Container} parent
   * @param {{
   *   fit?: boolean,
   *   animate?: boolean,
   *   layout?: object,
   *   texKey?: (partName: string) => string,
   *   targetH?: number,
   * }} opts
   */
  constructor(scene, parent, opts = {}) {
    this.scene = scene;
    this.root = parent;
    this.nodes = {};
    this.restAngles = {};
    this.time = 0;
    this.clip = 'idle';
    this.oneshot = null;
    this.facing = 1;
    this.weaponImage = null;
    this.weaponId = 0;
    this.animate = opts.animate !== false;
    this.doFit = opts.fit !== false;
    this.layoutOverride = opts.layout || null;
    this.texKeyFn = opts.texKey || partTextureKey;
    this.targetHOverride = opts.targetH ?? null;

    this._build();
  }

  _layout() {
    return this.layoutOverride || getLayout();
  }

  _build() {
    const layout = this._layout();
    const hipsCfg = layout.hips || { x: 0, y: -95 };
    const hips = this.scene.add.container(hipsCfg.x, hipsCfg.y);
    this.root.add(hips);
    this.nodes.hips = hips;
    this.hipsRestY = hipsCfg.y;

    for (const [name, cfg] of Object.entries(layout)) {
      if (name === 'hips') continue;
      const node = this.scene.add.container(cfg.x || 0, cfg.y || 0);
      node.setAngle(cfg.angle || 0);
      this.restAngles[name] = cfg.angle || 0;
      this.nodes[name] = node;
      node.boneName = name;
      if (cfg.tex) {
        const key = this.texKeyFn(cfg.tex);
        if (this.scene.textures.exists(key)) {
          const spr = this.scene.add.image(0, 0, key);
          spr.setOrigin(cfg.originX ?? 0.5, cfg.originY ?? 0.5);
          spr.boneName = name;
          node.add(spr);
          node.sprite = spr;
        }
      }
    }

    for (const [name, cfg] of Object.entries(layout)) {
      if (name === 'hips') continue;
      const parent = this.nodes[cfg.parent] || hips;
      parent.add(this.nodes[name]);
    }

    // Paint order: L-arm behind, L-leg under R-leg, torso, R-arm in front
    this._restack(hips, ['arm_l_u', 'leg_l_u', 'leg_r_u', 'torso', 'arm_r_u']);
    this._restack(this.nodes.torso, ['head']);
    this._restack(this.nodes.leg_r_u, ['leg_r_l']);
    this._restack(this.nodes.leg_l_u, ['leg_l_l']);
    this._restack(this.nodes.arm_r_u, ['arm_r_l']);
    this._restack(this.nodes.arm_l_u, ['arm_l_l']);
    this._restack(this.nodes.arm_r_l, ['hand_r']);
    this._restack(this.nodes.arm_l_l, ['hand_l']);

    this.root.setScale(1);
    if (this.doFit) this._fitToGround();
    else {
      this.baseScale = 1;
      this.root.setScale(1);
    }
  }

  /** Rebuild from current layoutState (editor). */
  rebuild() {
    const keepX = this.root.x;
    const keepY = this.root.y;
    const keepFace = this.facing;
    this.root.removeAll(true);
    this.nodes = {};
    this.restAngles = {};
    this.weaponImage = null;
    this._build();
    this.root.setPosition(keepX, keepY);
    this.setFacing(keepFace === -1 ? 0 : 1);
  }

  _fitToGround() {
    this.root.setScale(1);
    const bounds = this.root.getBounds();
    const targetH = this.targetHOverride || layoutState.targetH || 210;
    if (!bounds.height) {
      this.baseScale = 0.7;
      this.root.setScale(this.baseScale);
      return;
    }
    const s = targetH / bounds.height;
    this.baseScale = s;
    this.root.setScale(s);
    const b2 = this.root.getBounds();
    const dy = (this.root.y - b2.bottom) / s;
    if (this.nodes.hips) {
      this.nodes.hips.y += dy;
      this.hipsRestY = this.nodes.hips.y;
      const layout = getLayout();
      if (layout.hips) layout.hips.y = this.hipsRestY;
    }
  }

  _restack(parent, childNames) {
    if (!parent) return;
    for (const n of childNames) {
      const c = this.nodes[n];
      if (c && c.parentContainer === parent) parent.bringToTop(c);
    }
  }

  setFacing(dir) {
    this.facing = dir === 0 ? -1 : 1;
    const s = this.baseScale || Math.abs(this.root.scaleY) || 1;
    this.root.setScale(s * this.facing, s);
  }

  setClip(name) {
    if (this.oneshot) return;
    if (
      name === 'aim' ||
      name === 'idle' ||
      name === 'walk' ||
      name === 'jump' ||
      name === 'fall'
    ) {
      this.clip = name;
    }
  }

  /**
   * One full somersault (tuck + 360°), then onDone → freefall.
   * @param {1|-1} facing spin direction
   * @param {() => void} [onDone]
   */
  playFlip(facing = 1, onDone, walkOpts = {}) {
    const flip = getFlipClip();
    const base = flip.frames?.length ? flip.frames : FLIP;
    // Start from current stride so the salto grows out of the run
    this.oneshot = {
      style: 'flip',
      frames: flipFramesFromWalk(base, this.time, walkOpts),
      t: 0,
      dur: flip.dur || FLIP_DUR,
      facing: facing < 0 ? -1 : 1,
      onDone: onDone || null,
    };
    this.clip = 'flip';
    return { dur: this.oneshot.dur };
  }

  /** 0..1 linear progress of the flip oneshot, or 0. */
  flipProgress() {
    if (this.oneshot?.style !== 'flip') return 0;
    return Math.min(1, this.oneshot.t);
  }

  isFlipping() {
    return this.oneshot?.style === 'flip';
  }

  /**
   * @param {'z'|'x'} kind
   * @param {number} step combo index
   * @param {() => void} [onDone]
   * @returns {{ hand: string, style: string, dur: number }}
   */
  playPunch(kind, step = 0, onDone) {
    const combo = getPunchCombo(kind);
    const move = combo[step % combo.length];
    this.oneshot = {
      frames: move.frames,
      t: 0,
      dur: move.dur,
      onDone,
      style: move.style,
      hand: move.hand,
    };
    return { hand: move.hand, style: move.style, dur: move.dur };
  }

  /** Fist punches (not kicks) — can keep run legs underneath. */
  isHandStrike(style = this.oneshot?.style) {
    return style === 'punch' || style === 'upper';
  }

  playRecoil() {
    this.oneshot = { frames: RECOIL, t: 0, dur: 0.12, onDone: null, keepClip: true };
  }

  /**
   * Heavy hit crumple; cancels current punch oneshot.
   * @param {() => void} [onDone]
   * @param {number} [dur]
   * @param {{ mirror?: boolean }} [opts] mirror = fold the other way
   */
  playHurt(onDone, dur = 0.45, opts = {}) {
    let frames = HURT;
    if (opts.mirror) {
      frames = HURT.map((f) => {
        const pose = { ...f.pose };
        for (const k of Object.keys(pose)) {
          if (k === 'hipsY') continue;
          if (typeof pose[k] === 'number') pose[k] = -pose[k];
        }
        return { t: f.t, pose };
      });
    }
    this.oneshot = {
      frames,
      t: 0,
      dur,
      onDone: onDone || null,
      style: 'hurt',
    };
  }

  /**
   * Mount gun on torso under the whole right arm (fist is painted on arm_r_l).
   * Z: torso art → weapon → arm_r_u (hand on top of grip) → head.
   * @param {number|string} weaponIdOrKey GameState weapon id (1..4) or texture key
   */
  attachWeapon(weaponIdOrKey) {
    const torso = this.nodes.torso;
    if (!torso) return;
    if (this.weaponImage) {
      this.weaponImage.destroy();
      this.weaponImage = null;
    }
    this.weaponDef = null;
    this.weaponId = 0;

    let def = null;
    let key = null;
    let id = 0;
    if (typeof weaponIdOrKey === 'number') {
      id = weaponIdOrKey;
      def = WEAPON_DEFS[weaponIdOrKey];
      key = def?.key;
    } else {
      key = weaponIdOrKey;
      const entry = Object.entries(WEAPON_DEFS).find(([, d]) => d.key === key);
      if (entry) {
        id = Number(entry[0]);
        def = entry[1];
      }
    }
    if (!key || !this.scene.textures.exists(key)) return;

    const w = this.scene.add.image(0, 0, key);
    w.setOrigin(def?.originX ?? 0.25, def?.originY ?? 0.7);
    w.setScale(def?.scale ?? 0.5);
    w.setAngle(0);
    torso.add(w);
    this.weaponImage = w;
    this.weaponDef = def;
    this.weaponId = id;
    this._stackForWeapon(true);
    this._syncWeaponMount();
  }

  clearWeapon() {
    if (this.weaponImage) {
      this.weaponImage.destroy();
      this.weaponImage = null;
    }
    this.weaponDef = null;
    this.weaponId = 0;
    this._stackForWeapon(false);
  }

  /**
   * Armed Z-order on torso:
   * body → gun → left arm (support) → right arm (trigger / fist on top) → head
   * Unarmed: left arm back on hips behind torso.
   */
  _stackForWeapon(armed) {
    const hips = this.nodes.hips;
    const torso = this.nodes.torso;
    const armL = this.nodes.arm_l_u;
    const armR = this.nodes.arm_r_u;
    if (!hips || !torso || !armL) return;

    if (armed) {
      if (armL.parentContainer !== torso) {
        // hips-local → torso-local (torso at hips origin ≈ 0)
        const layout = this._layout().arm_l_u || {};
        const torsoLay = this._layout().torso || {};
        armL.x = (layout.x ?? armL.x) - (torsoLay.x ?? 0);
        armL.y = (layout.y ?? armL.y) - (torsoLay.y ?? 0);
        torso.add(armL);
      }
      this._restack(hips, ['leg_l_u', 'leg_r_u', 'torso']);
      // Depth: body → left support → gun → head → right arm (fist on grip)
      if (torso.sprite) torso.sprite.setDepth(0);
      if (armL) armL.setDepth(1);
      if (this.weaponImage) this.weaponImage.setDepth(2);
      if (this.nodes.head) this.nodes.head.setDepth(3);
      if (armR) armR.setDepth(4);
      torso.sort('depth');
      // Ensure list order matches after sort
      if (armR) torso.bringToTop(armR);
    } else {
      if (armL.parentContainer !== hips) {
        const layout = this._layout().arm_l_u || {};
        armL.x = layout.x ?? 29;
        armL.y = layout.y ?? -115;
        hips.add(armL);
      }
      this._restack(hips, ['arm_l_u', 'leg_l_u', 'leg_r_u', 'torso']);
      this._restack(torso, ['arm_r_u', 'head']);
    }

    this._restack(this.nodes.arm_r_u, ['arm_r_l']);
    this._restack(this.nodes.arm_r_l, ['hand_r']);
    this._restack(this.nodes.arm_l_u, ['arm_l_l']);
    this._restack(this.nodes.arm_l_l, ['hand_l']);
  }

  /**
   * Snap grip to right-hand bone + keep barrel world-horizontal.
   */
  _syncWeaponMount() {
    if (!this.weaponImage || !this.weaponDef) return;
    const torso = this.nodes.torso;
    const hand = this.nodes.hand_r;
    if (!torso || !hand) return;

    const world = new Phaser.Math.Vector2();
    hand.getWorldTransformMatrix().transformPoint(0, 0, world);

    const local = new Phaser.Math.Vector2();
    if (typeof torso.getLocalPoint === 'function') {
      torso.getLocalPoint(world.x, world.y, local);
    } else {
      const mat = torso.getWorldTransformMatrix();
      const inv = new Phaser.GameObjects.Components.TransformMatrix();
      inv.copyFrom(mat);
      inv.invert();
      inv.transformPoint(world.x, world.y, local);
    }

    this.weaponImage.x = local.x + (this.weaponDef.x ?? 0);
    this.weaponImage.y = local.y + (this.weaponDef.y ?? 0);

    let boneRot = 0;
    let n = torso;
    while (n && n !== this.root) {
      boneRot += n.rotation;
      n = n.parentContainer;
    }
    const bias = Phaser.Math.DegToRad(this.weaponDef.angle ?? 0);
    this.weaponImage.rotation = -boneRot + bias;
  }

  /** Resolve aim pose for current weapon (two-hand grips). */
  _aimPoseForWeapon() {
    const base = aimPose();
    const custom = weaponAimPose(this.weaponId);
    if (!custom) return base;
    return {
      ...base,
      ...custom,
      leg_l_u: base.leg_l_u,
      leg_l_l: base.leg_l_l,
      leg_r_u: base.leg_r_u,
      leg_r_l: base.leg_r_l,
    };
  }

  getMuzzleWorld() {
    const hand = this.nodes.hand_r || this.nodes.hand_l;
    if (!hand) return { x: this.root.x, y: this.root.y - 80 };
    const out = new Phaser.Math.Vector2();
    if (this.weaponImage) {
      const wm = this.weaponImage.getWorldTransformMatrix();
      const ox = this.weaponDef?.originX ?? 0.2;
      const oy = this.weaponDef?.originY ?? 0.55;
      const w = this.weaponImage.width || 40;
      const h = this.weaponImage.height || 20;
      // Local tip at muzzle (right edge of sprite, mid barrel)
      const tipX = (1 - ox) * w * 0.92;
      const tipY = (0.42 - oy) * h;
      wm.transformPoint(tipX, tipY, out);
      return { x: out.x, y: out.y };
    }
    const m = hand.getWorldTransformMatrix();
    m.transformPoint(36, 0, out);
    return { x: out.x, y: out.y };
  }

  getHandWorld(side = 'l') {
    const hand = this.nodes[side === 'l' ? 'hand_l' : 'hand_r'];
    if (!hand) return { x: this.root.x, y: this.root.y - 60 };
    const m = hand.getWorldTransformMatrix();
    const out = new Phaser.Math.Vector2();
    m.transformPoint(0, 0, out);
    return { x: out.x, y: out.y };
  }

  /** World position near the kicking foot tip. */
  getFootWorld(side = 'l') {
    const foot = this.nodes[side === 'l' ? 'leg_l_l' : 'leg_r_l'];
    if (!foot) return { x: this.root.x, y: this.root.y - 20 };
    const m = foot.getWorldTransformMatrix();
    const out = new Phaser.Math.Vector2();
    m.transformPoint(8, 70, out);
    return { x: out.x, y: out.y };
  }

  /** Sync node transforms back into layoutState (after editor nudges). */
  writeLayoutFromNodes() {
    const layout = this._layout();
    for (const [name, node] of Object.entries(this.nodes)) {
      if (name === 'hips') {
        layout.hips = layout.hips || {};
        layout.hips.x = Math.round(node.x * 10) / 10;
        layout.hips.y = Math.round(node.y * 10) / 10;
        this.hipsRestY = node.y;
        continue;
      }
      const prev = layout[name] || {};
      const next = { ...prev };
      next.x = Math.round(node.x * 10) / 10;
      next.y = Math.round(node.y * 10) / 10;
      next.angle = Math.round(node.angle * 10) / 10;
      if (node.sprite) {
        next.originX = Math.round(node.sprite.originX * 1000) / 1000;
        next.originY = Math.round(node.sprite.originY * 1000) / 1000;
      }
      layout[name] = next;
      this.restAngles[name] = next.angle;
    }
  }

  tick(
    dt,
    {
      moving = false,
      airborne = false,
      aiming = false,
      falling = false,
      walkAmp = 1,
      walkSpeed = 1,
    } = {},
  ) {
    if (!this.animate) return;
    this.time += dt;
    let pose;
    const walkOpts = { speed: walkSpeed, amp: walkAmp };

    if (this.oneshot?.style === 'flip') {
      this.oneshot.t += dt / this.oneshot.dur;
      const raw = Math.min(1, this.oneshot.t);
      this.clip = 'flip';
      // Linear spin + tuck (no easing)
      pose = sampleKeyframes(this.oneshot.frames || FLIP, raw, { ease: false });
      this._applyPose(pose);
      if (raw >= 1) {
        const done = this.oneshot.onDone;
        this.oneshot = null;
        done?.();
        // onDone may set clip to fall/idle; don't leave 'flip' stuck
      }
      return;
    }

    if (this.oneshot) {
      this.oneshot.t += dt / this.oneshot.dur;
      const u = Math.min(1, this.oneshot.t);
      pose = sampleKeyframes(this.oneshot.frames, u);
      if (moving && !airborne && this.isHandStrike(this.oneshot.style)) {
        const walk = walkPose(this.time, walkOpts);
        pose.leg_l_u = walk.leg_l_u;
        pose.leg_l_l = walk.leg_l_l;
        pose.leg_r_u = walk.leg_r_u;
        pose.leg_r_l = walk.leg_r_l;
        pose.hipsY = walk.hipsY;
        this.clip = 'walk';
      } else if (airborne && this.isHandStrike(this.oneshot.style)) {
        const jp = jumpPose();
        pose.leg_l_u = jp.leg_l_u;
        pose.leg_l_l = jp.leg_l_l;
        pose.leg_r_u = jp.leg_r_u;
        pose.leg_r_l = jp.leg_r_l;
      }
      if (u >= 1) {
        const done = this.oneshot.onDone;
        const keep = this.oneshot.keepClip;
        this.oneshot = null;
        done?.();
        if (!keep) this.clip = moving ? 'walk' : aiming ? 'aim' : 'idle';
      }
    } else {
      if (falling && airborne) this.clip = 'fall';
      else if (airborne) this.clip = 'jump';
      else if (moving) this.clip = 'walk';
      else if (aiming) this.clip = 'aim';
      else this.clip = 'idle';

      if (this.clip === 'walk') {
        pose = walkPose(this.time, walkOpts);
        if (aiming) {
          const aim = this._aimPoseForWeapon();
          pose.arm_l_u = aim.arm_l_u;
          pose.arm_l_l = aim.arm_l_l;
          pose.arm_r_u = aim.arm_r_u;
          pose.arm_r_l = aim.arm_r_l;
          pose.torso = (pose.torso || 0) * 0.4 + (aim.torso || 0) * 0.6;
          if (aim.head != null) pose.head = aim.head;
        }
      } else if (this.clip === 'fall') pose = freefallPose();
      else if (this.clip === 'jump') pose = jumpPose();
      else if (this.clip === 'aim') pose = this._aimPoseForWeapon();
      else pose = idlePose(this.time);
    }

    this._applyPose(pose || {});
    this._syncWeaponMount();
  }

  _applyPose(pose) {
    const hipsRest = this.hipsRestY ?? this._layout().hips?.y ?? -95;
    // Walk/run needs snappier follow so knees don't look laggy/stiff
    const runUnderPunch =
      this.oneshot && this.isHandStrike(this.oneshot.style) && this.clip === 'walk';
    const snap =
      this.oneshot && !runUnderPunch
        ? 0.9
        : this.clip === 'flip'
          ? 0.92
          : this.clip === 'walk'
            ? 1
            : this.clip === 'aim'
              ? 0.55
              : 0.32;
    const snapPunch = 0.9;
    if (pose.hipsY != null && this.nodes.hips) {
      this.nodes.hips.y = Phaser.Math.Linear(
        this.nodes.hips.y,
        hipsRest + pose.hipsY,
        runUnderPunch ? 0.4 : this.oneshot ? 0.85 : this.clip === 'walk' ? 1 : 0.25,
      );
    } else if (this.nodes.hips) {
      this.nodes.hips.y = Phaser.Math.Linear(this.nodes.hips.y, hipsRest, 0.2);
    }

    const LEG_BONES = new Set(['leg_l_u', 'leg_l_l', 'leg_r_u', 'leg_r_l']);
    for (const bone of ANGLE_BONES) {
      const node = this.nodes[bone];
      if (!node) continue;
      const rest = this.restAngles[bone] || 0;
      const target = rest + (pose[bone] ?? 0);
      const rate = runUnderPunch && !LEG_BONES.has(bone) ? snapPunch : snap;
      node.angle = Phaser.Math.Linear(node.angle, target, rate);
    }
  }
}
