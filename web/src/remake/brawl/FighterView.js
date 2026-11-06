import { BonePuppet } from '../game/player/BonePuppet.js';
import { getEnemySkin, enemyPartTextureKey } from '../game/enemies/parts.js';
import { getClip, getFlipClip } from '../game/player/animState.js';
import { sampleKeyframes, jumpPose } from '../game/player/anims.js';
import { MOVES, moveTotal } from '../sim/moves.js';
import { FLIP_TICKS } from '../sim/constants.js';
import { stage } from './stage.js';
import { CLIP_IMPACT } from './clips.js';

const SQUASH_MS = 130;

const PLAYER_SCALE = 1 / 1.5;

/**
 * Renders one sim fighter with the existing bone puppet.
 * Reads state only — never writes back into the sim.
 *
 * visual (feet, screen pos) → spin (rotation pivot) → mount (puppet root, mirrored)
 */
export class FighterView {
  constructor(scene, f) {
    this.scene = scene;
    this.id = f.id;
    this.kind = f.kind;
    this.seenSeq = f.animSeq;

    this.shadow = scene.add.ellipse(0, 0, 74, 18, 0x000000, 0.3).setDepth(99);
    this.visual = scene.add.container(f.x, 0);
    this.spin = scene.add.container(0, 0);
    this.mount = scene.add.container(0, 0);
    this.visual.add(this.spin);
    this.spin.add(this.mount);

    if (f.kind === 'player') {
      this.puppet = new BonePuppet(scene, this.mount, { fit: false });
      this.puppet.baseScale = PLAYER_SCALE;
      this.puppet.root.setScale(PLAYER_SCALE);
    } else {
      const skin = getEnemySkin(f.kind);
      this.puppet = new BonePuppet(scene, this.mount, {
        fit: false,
        layout: skin.layout,
        texKey: (part) => enemyPartTextureKey(skin.id, part),
        targetH: skin.targetH,
      });
      this.puppet.baseScale = skin.scale;
      this.puppet.root.setScale(skin.scale);
    }
    const s = Math.abs(this.puppet.baseScale || PLAYER_SCALE);
    this.hipsH = Math.abs(this.puppet.hipsRestY ?? 222) * s;
    // Feet → top of head on screen (hips sit at ~65% of the height for these rigs)
    this.bodyH = this.hipsH * 1.52;

    this.sprites = Object.values(this.puppet.nodes)
      .map((n) => n.sprite)
      .filter(Boolean);
    this.flashT = 0;
    this.squashT = 0;
    this.squashAmt = 0;
    this.rot = 0;
    this.knockDir = 1;

    this.hpBar = null;
    if (f.team !== 'player') {
      this.hpBar = scene.add.graphics().setDepth(1500).setVisible(false);
    }
  }

  flash(ms = 70) {
    this.flashT = ms;
    for (const s of this.sprites) s.setTintFill(0xffffff);
  }

  /**
   * @param {object} f sim fighter
   * @param {number} alpha interpolation between previous and current tick
   * @param {number} dt seconds to advance animation (0 while frozen)
   * @param {number} frameMs real frame time (for flash timers)
   */
  render(f, alpha, dt, frameMs) {
    const x = f.px + (f.x - f.px) * alpha;
    const z = f.pz + (f.z - f.pz) * alpha;
    const y = f.py + (f.y - f.py) * alpha;
    const gy = stage.groundY(z);

    this.shadow.setPosition(x, gy);
    const lift = Math.min(1, y / 220);
    this.shadow.setScale(1 - lift * 0.45, 1 - lift * 0.45);
    this.shadow.setAlpha(0.3 * (1 - lift * 0.5));

    this.visual.setPosition(Math.round(x), Math.round(gy - y));
    this.visual.setDepth(stage.depth(z));

    // New one-shot (attack / hurt) started in the sim
    if (f.animSeq !== this.seenSeq) {
      this.seenSeq = f.animSeq;
      this._startAnim(f);
    }

    // Squash & stretch on take-off / landing (pivot at the feet)
    if (this.squashT > 0) {
      this.squashT = Math.max(0, this.squashT - frameMs);
      const k = this.squashT / SQUASH_MS;
      const a = this.squashAmt * k;
      this.visual.setScale(1 + a, 1 - a);
    } else {
      this.visual.setScale(1, 1);
    }

    const flipU = f.state === 'jump' && f.flip ? Math.min(1, Math.max(0, (f.flipT - 1 + alpha) / FLIP_TICKS)) : 1;

    if (f.state === 'attack' && f.move) {
      this._resetSpin();
      this.puppet.setFacing(f.facing > 0 ? 1 : 0);
      this._driveMove(f, alpha, dt);
    } else if (flipU < 1) {
      this._flip(f, flipU, dt);
    } else {
      // Body rotation: knockdown fall, lying, getting up
      let targetRot = 0;
      let snap = 1 - Math.exp(-dt * 18);
      if (f.state === 'airhit') {
        targetRot = this.knockDir * 55;
      } else if (f.state === 'down' || f.state === 'dead') {
        targetRot = this.knockDir * 86;
        snap = 1 - Math.exp(-dt * 24);
      } else if (f.state === 'getup') {
        snap = 1 - Math.exp(-dt * 12);
      }
      if (Math.abs(this.rot) > 180) this.rot = 0;
      this.rot += (targetRot - this.rot) * snap;
      this.spin.setPosition(0, 0);
      this.mount.setPosition(0, 0);
      this.spin.setAngle(this.rot);

      this.puppet.setFacing(f.facing > 0 ? 1 : 0);
      this.puppet.tick(dt, {
        moving: f.state === 'walk' || f.state === 'dash',
        airborne: f.y > 2 && f.state !== 'airhit',
        falling: f.state === 'jump' && (f.flip || f.vy < 0),
        walkAmp: f.state === 'dash' ? 1.2 : 1,
        walkSpeed: f.team === 'player' ? 1.2 : 0.95,
        dtBlend: true,
      });
    }

    // Dead enemies fade out before removal
    if (f.state === 'dead' && f.team !== 'player') {
      const a = Math.min(1, f.removeT / 30);
      this.visual.setAlpha(a);
      this.shadow.setAlpha(0.3 * a);
    } else if (f.iframes > 0 && (f.state === 'getup' || f.state === 'dash')) {
      this.visual.setAlpha(0.65 + 0.35 * Math.sin(f.st * 0.9));
    } else {
      this.visual.setAlpha(1);
    }

    if (this.flashT > 0) {
      this.flashT -= frameMs;
      if (this.flashT <= 0) for (const s of this.sprites) s.clearTint();
    }

    if (this.hpBar) {
      const show = f.hp < f.maxHp && !f.dead;
      this.hpBar.setVisible(show);
      if (show) {
        const w = 56;
        const bx = Math.round(x - w / 2);
        const by = Math.round(gy - y - this.bodyH - 14);
        this.hpBar.clear();
        this.hpBar.fillStyle(0x000000, 0.6).fillRect(bx - 1, by - 1, w + 2, 7);
        this.hpBar.fillStyle(0xe2463b, 1).fillRect(bx, by, Math.max(0, (w * f.hp) / f.maxHp), 5);
      }
    }
  }

  /** Take-off / landing squash (called from scene events). */
  squash(amount) {
    this.squashAmt = amount;
    this.squashT = SQUASH_MS;
  }

  _resetSpin() {
    this.rot = 0;
    this.spin.setAngle(0);
    this.spin.setPosition(0, 0);
    this.mount.setPosition(0, 0);
    this.mount.setAngle(0);
  }

  /**
   * Attack pose straight from the sim tick: the clip's impact key is pinned
   * to the first active tick, so wind-up and follow-through stretch around it.
   */
  _driveMove(f, alpha, dt) {
    const m = MOVES[f.move];
    const clip = getClip(m.clip);
    const total = moveTotal(m);
    const impact = CLIP_IMPACT[m.clip] ?? 0.4;
    const t = Math.min(total, Math.max(0, f.mt - 1 + alpha));
    const u =
      t <= m.startup
        ? (t / Math.max(1, m.startup)) * impact
        : impact + ((t - m.startup) / Math.max(1, total - m.startup)) * (1 - impact);
    const pose = sampleKeyframes(clip?.frames || [], u, { ease: false });
    this.puppet.drive(dt, pose, { snap: 0.88 });

    if (m.sweep) {
      // Spinning kick: paper-turn the whole body 360° around the impact
      const s0 = 0.08;
      const s1 = 0.82;
      const w = Math.min(1, Math.max(0, (u - s0) / (s1 - s0)));
      const turn = w * w * (3 - 2 * w);
      const c = Math.cos(turn * Math.PI * 2);
      const sc = Math.abs(this.puppet.baseScale || 1);
      const sx = Math.sign(c || 1) * Math.max(0.08, Math.abs(c));
      this.mount.setScale(sc * f.facing * sx, sc);
    }
  }

  /**
   * Double-jump somersault: tucked pose from the flip clip, 360° spin around
   * the live neck joint (head pivot), facing locked for the whole turn.
   */
  _flip(f, u, dt) {
    const clip = getFlipClip();
    const frames = (clip.frames || []).map((k, i) => (i === 0 ? { t: 0, pose: jumpPose() } : k));
    const pose = sampleKeyframes(frames, u, { ease: false });

    this.visual.setScale(1, 1);
    this._resetSpin();
    this.puppet.setFacing(f.facing > 0 ? 1 : 0);
    this.puppet.drive(dt, pose, { snap: 0.92 });

    const head = this.puppet.nodes.head;
    let ox = 0;
    let oy = -this.hipsH * 1.25;
    if (head) {
      const mat = head.getWorldTransformMatrix();
      ox = mat.tx - this.visual.x;
      oy = mat.ty - this.visual.y;
    }
    this.spin.setPosition(ox, oy);
    this.mount.setPosition(-ox, -oy);
    this.spin.setAngle(u * 360 * f.facing);
    this.rot = 0;
  }

  _startAnim(f) {
    const a = f.anim;
    if (!a) return;
    if (a.type === 'move') {
      // Posed every frame in _driveMove from the sim tick
    } else if (a.type === 'hurt') {
      this.knockDir = a.dir || 1;
      const dur = a.reaction === 'flinch' ? 0.3 : 0.5;
      this.puppet.playHurt(null, dur, { mirror: false });
      this.flash(a.reaction === 'kill' ? 110 : 70);
    }
  }

  destroy() {
    this.shadow.destroy();
    this.visual.destroy(true);
    this.hpBar?.destroy();
  }
}

