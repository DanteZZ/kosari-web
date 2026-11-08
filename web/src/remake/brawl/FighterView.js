import Phaser from 'phaser';
import { BonePuppet } from '../game/player/BonePuppet.js';
import { getEnemySkin, enemyPartTextureKey } from '../game/enemies/parts.js';
import { getClip, getFlipClip } from '../game/player/animState.js';
import { sampleKeyframes, jumpPose, HURT } from '../game/player/anims.js';
import { MOVES, moveTotal } from '../sim/moves.js';
import { FLIP_TICKS } from '../sim/constants.js';
import { stage } from './stage.js';
import { CLIP_IMPACT } from './clips.js';
import { getHero } from '../game/heroes.js';
import { FIGHTERS } from '../sim/fighters.js';

const SQUASH_MS = 130;

/**
 * New enemy types reuse the existing rigs: skin + size + a tint on the
 * clothes (the head stays untinted so faces still read).
 */
export const VARIANTS = {
  runner: { skin: 'nikita', scale: 0.9, tint: 0x86c8ff },
  /** Arena goal «догони»: a Nikita in black with a bag of косари. */
  thief: { skin: 'nikita', scale: 0.88, tint: 0x6a6a78 },
  /** Museum guards; Руки базуки on the bench next to you. */
  guard: { skin: 'buiniy', scale: 1.02, tint: 0x5a6a90 },
  rival: { skin: 'ruki', scale: 1, tint: null },
  poser: { skin: 'gigachad', scale: 1.08, tint: null },
  mc: { skin: 'klas', scale: 1.05, tint: null },
  /** Village penalties: Дед. */
  keeper: { skin: 'ded', scale: 0.98, tint: null },
  /** Dacha basement: Пахом's shadow. */
  shade: { skin: 'pahom', scale: 1.05, tint: 0x5a6a50 },
  thrower: { skin: 'buiniy', scale: 0.95, tint: 0xb3c79a },
  blocker: { skin: 'nikita', scale: 1.12, tint: 0x7f93b8 },
  /** Original boss 1 uses the masked-hoodie rig. */
  borsch: { skin: 'boss1', scale: 1, tint: null },
  // Meme-era bosses: their own rigs
  ded: { skin: 'ded', scale: 0.98, tint: null },
  pahom: { skin: 'pahom', scale: 1.05, tint: null },
  glad: { skin: 'glad', scale: 1.02, tint: null },
  mongol: { skin: 'mongol', scale: 1.12, tint: null },
  papich: { skin: 'papich', scale: 1.04, tint: null },
  vertuha: { skin: 'vertuha', scale: 1, tint: null },
  ruki: { skin: 'ruki', scale: 1.2, tint: null },
  ponasenkov: { skin: 'ponasenkov', scale: 1.02, tint: null },
  reka: { skin: 'reka', scale: 1, tint: null },
  gigachad: { skin: 'gigachad', scale: 1.22, tint: null },
  zubarev: { skin: 'zubarev', scale: 1.05, tint: null },
  gitelman: { skin: 'gitelman', scale: 1, tint: null },
  klas: { skin: 'klas', scale: 1.15, tint: null },
};

const PLAYER_SCALE = 1 / 1.5;

/**
 * Levitating (1Kla$, the enlightened Маэстро): a flying pose posed by hand
 * in the bone editor («Поза полёта (H)»), body leaning into the flight.
 * Offsets from the rig's rest angles (degrees).
 */
export const HOVER_POSE = {
  torso: 12.8, head: 12,
  arm_r_u: 40, arm_r_l: 30, arm_l_u: -19.1, arm_l_l: 47,
  leg_r_u: 10.9, leg_r_l: -5.5, leg_l_u: -19.7, leg_l_l: 69.7,
  hipsY: 0,
};

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

    const hero = f.kind === 'player' ? getHero(f.hero) : null;
    if (f.kind === 'player' && !hero.skin) {
      this.puppet = new BonePuppet(scene, this.mount, { fit: false });
      this.puppet.baseScale = PLAYER_SCALE;
      this.puppet.root.setScale(PLAYER_SCALE);
    } else {
      // Heroes without their own parts yet wear an existing rig
      const variant = hero ? { skin: hero.skin, scale: hero.scale ?? 1, tint: hero.tint ?? null } : VARIANTS[f.kind];
      const skin = getEnemySkin(variant?.skin || f.kind);
      this.puppet = new BonePuppet(scene, this.mount, {
        fit: false,
        layout: skin.layout,
        texKey: (part) => enemyPartTextureKey(skin.id, part),
        targetH: skin.targetH,
      });
      const sc = skin.scale * (variant?.scale ?? 1);
      this.puppet.baseScale = sc;
      this.puppet.root.setScale(sc);
      this.variant = variant || null;
    }
    // Thin dark outline so fighters read against the busy forest; a second,
    // coloured glow is the boss aura (1Kla$, the enlightened Маэстро, Гигачад's pose)
    try {
      this.ally = f.team === 'ally';
      // Summoned helpers glow green so you can tell them from the crowd
      this.visual.postFX.addGlow(f.team === 'player' ? 0x101820 : f.team === 'ally' ? 0x36ff6a : 0x1a0f0f, f.team === 'ally' ? 4 : 2.2, 0, false, 0.1, 5);
      this.aura = true;
    } catch (_) {
      /* Canvas renderer: no FX */
    }
    this.auraT = 0;
    const s = Math.abs(this.puppet.baseScale || PLAYER_SCALE);
    this.hipsH = Math.abs(this.puppet.hipsRestY ?? 222) * s;
    // Feet → top of head on screen (hips sit at ~65% of the height for these rigs)
    this.bodyH = this.hipsH * 1.52;
    // Feet on the ground: rigs cut from different pictures end a little above
    // or below their origin — measure the lowest part at rest and shift
    this.footFix = 0;
    try {
      let bottom = -Infinity;
      for (const n of Object.values(this.puppet.nodes)) {
        if (n.sprite) bottom = Math.max(bottom, n.sprite.getBounds().bottom);
      }
      if (Number.isFinite(bottom)) this.footFix = Math.max(-12, Math.min(60, this.visual.y - bottom));
    } catch (_) {
      this.footFix = 0;
    }

    if (f.kind === 'thief') {
      const tex = scene.textures.exists('item_thief_bag') ? 'item_thief_bag' : 'item_money_pack';
      this.bag = scene.add.image(-34, -150, tex).setOrigin(0.5, 0.5);
      this.bag.setScale(70 / Math.max(this.bag.width, this.bag.height)).setAngle(-14);
      this.mount.addAt(this.bag, 0);
    }
    const gun = f.team !== 'player' ? FIGHTERS[f.kind]?.weapon : 0;
    if (gun) {
      this.puppet.attachWeapon(gun);
      const wi = this.puppet.weaponImage;
      // Gun art is sized for the player rig: bring it to this rig's scale
      if (wi) wi.setScale(wi.scaleX * (PLAYER_SCALE / Math.abs(this.puppet.baseScale || PLAYER_SCALE)));
    }
    this.sprites = Object.values(this.puppet.nodes)
      .map((n) => n.sprite)
      .filter(Boolean);
    this._baseTint();
    this.flashT = 0;
    this.shownWeapon = 0;
    this.squashT = 0;
    this.squashAmt = 0;
    this.jolt = 0;
    this.telegraphT = 0;
    this.warn = null;
    if (f.team !== 'player') {
      this.warn = scene.add
        .text(0, 0, '!', {
          fontFamily: 'Russo One, Impact, sans-serif',
          fontSize: '30px',
          color: '#ffdd33',
          stroke: '#000000',
          strokeThickness: 5,
        })
        .setOrigin(0.5, 1)
        .setDepth(1600)
        .setVisible(false);
    }
    this.rot = 0;
    this.knockDir = 1;

    this.hpBar = null;
    if (f.team !== 'player') {
      this.hpBar = scene.add.graphics().setDepth(1500).setVisible(false);
    }
  }

  /** Clothes tint for variants (restored after hit flashes). */
  _baseTint() {
    for (const s of this.sprites) {
      if (this.variant?.tint && s.boneName !== 'head') s.setTint(this.variant.tint);
      else s.clearTint();
    }
  }

  /** In the shadow of a statue (museum stealth): the whole puppet goes dark. */
  shade(on) {
    if (this.shaded === on) return;
    this.shaded = on;
    if (on) for (const s of this.sprites) s.setTint(0x3c4458);
    else this._baseTint();
  }

  /** Pooling: hide while unused. */
  park() {
    this.visual.setVisible(false);
    this.shadow.setVisible(false);
    this.hpBar?.setVisible(false);
    this.warn?.setVisible(false);
  }

  /** Pooling: take over a new sim fighter of the same kind. */
  reset(f) {
    this.id = f.id;
    this.seenSeq = f.animSeq;
    this.flashT = 0;
    this.squashT = 0;
    this.jolt = 0;
    this.telegraphT = 0;
    this.rot = 0;
    this.knockDir = 1;
    this.puppet.oneshot = null;
    this._baseTint();
    this._resetSpin();
    this.visual.setVisible(true).setAlpha(1).setScale(1);
    this.shadow.setVisible(true);
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
    const scene = this.scene;
    const x = f.px + (f.x - f.px) * alpha;
    const z = f.pz + (f.z - f.pz) * alpha;
    const y = f.py + (f.y - f.py) * alpha;
    const gy = stage.groundY(z);

    this.shadow.setPosition(x, gy);
    const lift = Math.min(1, y / 220);
    this.shadow.setScale(1 - lift * 0.45, 1 - lift * 0.45);
    this.shadow.setAlpha(0.3 * (1 - lift * 0.5));

    this.visual.setPosition(Math.round(x), Math.round(gy - y + this.footFix));
    if (this.aura) {
      if (!this.halo) {
        if (!scene.textures.exists('fx_halo')) {
          const t = scene.textures.createCanvas('fx_halo', 256, 256);
          // v2: denser core
          const c = t.getContext();
          const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
          g.addColorStop(0.75, 'rgba(255,255,255,0.28)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g;
          c.fillRect(0, 0, 256, 256);
          t.refresh();
        }
        this.halo = scene.add.image(0, 0, 'fx_halo').setVisible(false);
      }
      this.auraT += frameMs;
      let col = 0;
      let str = 0;
      const posing = f.state === 'attack' && f.move === 'c_pose';
      if (f.kind === 'klas' && !f.dead) {
        col = 0xffd23f;
        str = 3 + Math.sin(this.auraT / 180) * 1.5;
      } else if (f.kind === 'ponasenkov' && f.y > 20 && !f.dead) {
        col = 0x7fc4ff;
        str = 4 + Math.sin(this.auraT / 120) * 1.5;
      } else if (f.kind === 'gigachad' && posing) {
        col = 0xffffff;
        str = 8;
      }
      // A soft see-through glow behind him, breathing
      this.halo.setVisible(str > 0);
      if (str > 0) {
        const size = (this.bodyH || 300) * (1.35 + str * 0.05);
        this.halo
          .setTint(col)
          .setAlpha(Math.min(0.9, 0.55 + str * 0.05))
          .setScale(size / 256)
          .setPosition(this.visual.x, this.visual.y - (this.bodyH || 300) * 0.5)
          .setDepth(this.visual.depth - 0.5);
      }
    }
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

    // Gun in hand (players)
    if (f.team === 'player' && f.weapon !== this.shownWeapon) {
      this.shownWeapon = f.weapon;
      if (f.weapon) this.puppet.attachWeapon(f.weapon);
      else this.puppet.clearWeapon();
    }

    const flipU = f.state === 'jump' && f.flip ? Math.min(1, Math.max(0, (f.flipT - 1 + alpha) / FLIP_TICKS)) : 1;

    if (f.state === 'attack' && f.move && MOVES[f.move].roll && f.mt > MOVES[f.move].startup) {
      // Дед rolls as a ball: tucked pose spinning around the belly
      this._roll(f, dt);
    } else if (f.state === 'attack' && f.move) {
      this._resetSpin();
      this.puppet.setFacing(f.facing > 0 ? 1 : 0);
      this._driveMove(f, alpha, dt);
    } else if (flipU < 1) {
      this._flip(f, flipU, dt);
    } else if (f.state === 'block' || (this.kind === 'blocker' && f.state === 'idle')) {
      this._resetSpin();
      this.puppet.setFacing(f.facing > 0 ? 1 : 0);
      this.puppet.drive(dt, sampleKeyframes(getClip('guard_high')?.frames || [], 0, { ease: false }), { snap: 0.7 });
    } else if (f.state === 'grab') {
      this._resetSpin();
      this.puppet.setFacing(f.facing > 0 ? 1 : 0);
      this.puppet.drive(dt, sampleKeyframes(getClip('grab_hold')?.frames || [], 0, { ease: false }), { snap: 0.6 });
    } else if (f.state === 'grabbed') {
      // Folded over in the hold; jolts when kneed
      this._resetSpin();
      this.puppet.setFacing(f.facing > 0 ? 1 : 0);
      const pose = sampleKeyframes(HURT, this.jolt > 0 ? 0.16 : 0.38, { ease: false });
      this.puppet.drive(dt, pose, { snap: this.jolt > 0 ? 0.9 : 0.45 });
      if (this.jolt > 0) this.jolt -= frameMs;
    } else {
      // Body rotation: knockdown fall, lying, getting up, tumbling when thrown
      let targetRot = 0;
      let snap = 1 - Math.exp(-dt * 18);
      if (f.state === 'airhit' && f.thrown) {
        this.rot = (this.rot + dt * 820 * this.knockDir) % 360;
        targetRot = this.rot;
      } else if (f.state === 'airhit') {
        targetRot = this.knockDir * 55;
      } else if (f.state === 'down' || f.state === 'dead') {
        targetRot = this.knockDir * 86;
        snap = 1 - Math.exp(-dt * 24);
      } else if (f.state === 'getup') {
        snap = 1 - Math.exp(-dt * 12);
      }
      const tumbling = f.state === 'airhit' && f.thrown;
      if (!tumbling && Math.abs(this.rot) > 180) this.rot = 0;
      this.rot += (targetRot - this.rot) * snap;
      // Thrown bodies tumble around their middle; everything else pivots at the feet
      const pivot = tumbling ? this.hipsH : 0;
      this.spin.setPosition(0, -pivot);
      this.mount.setPosition(0, pivot);
      this.spin.setAngle(this.rot);

      this.puppet.setFacing(f.facing > 0 ? 1 : 0);
      if (f.y > 25 && (f.state === 'idle' || f.state === 'walk') && f.hoverY != null) {
        // Floating: lean towards where he looks, arms and legs sway, body bobs
        this.hoverT = (this.hoverT || 0) + dt;
        const w = Math.sin(this.hoverT * 2.2);
        const w2 = Math.sin(this.hoverT * 1.6 + 1);
        const pose = { ...HOVER_POSE };
        pose.arm_r_u += w * 7;
        pose.arm_l_u -= w * 7;
        pose.arm_r_l += w2 * 6;
        pose.arm_l_l -= w2 * 6;
        pose.leg_r_u += w2 * 4;
        pose.leg_l_u -= w2 * 4;
        pose.leg_r_l += w * 3;
        pose.leg_l_l -= w * 3;
        pose.head += w2 * 2;
        this.puppet.drive(dt, pose, { snap: 0.25 });
        // The pose itself leans the torso; the whole body only tips a little
        const lean = f.facing * 3;
        this.leanRot = (this.leanRot || 0) + (lean - (this.leanRot || 0)) * (1 - Math.exp(-dt * 5));
        this.rot = 0;
        this.spin.setPosition(0, -this.hipsH);
        this.mount.setPosition(0, this.hipsH);
        this.spin.setAngle(this.leanRot);
        this.visual.y += Math.sin(this.hoverT * 1.8) * 7;
      } else this.puppet.tick(dt, {
        moving: f.state === 'walk' || f.state === 'dash',
        airborne: f.y > 2 && f.state !== 'airhit',
        falling: f.state === 'jump' && (f.flip || f.vy < 0),
        aiming: !!f.weapon && (f.state === 'idle' || f.state === 'walk'),
        walkAmp: this.stepAmp(f),
        walkSpeed: this.cadence(f),
        dtBlend: true,
      });
    }

    // Dead enemies fade out before removal; bosses between phases are off-stage
    if (f.away) {
      this.visual.setAlpha(0);
      this.shadow.setAlpha(0);
      this.hpBar?.setVisible(false);
    } else if (f.state === 'dead' && f.team !== 'player') {
      const a = Math.min(1, f.removeT / 30);
      this.visual.setAlpha(a);
      this.shadow.setAlpha(0.3 * a);
    } else if (f.kind === 'shade') {
      // Пахом's shadow: only the beam shows him (the eyes glow in the dark)
      const a = f.lit ? 1 : 0;
      this.visual.setAlpha(this.visual.alpha + (a - this.visual.alpha) * 0.25);
      this.shadow.setAlpha(0);
      this.hpBar?.setVisible(false);
    } else if (f.iframes > 0 && (f.state === 'getup' || f.state === 'dash')) {
      this.visual.setAlpha(0.65 + 0.35 * Math.sin(f.st * 0.9));
    } else {
      this.visual.setAlpha(1);
    }

    if (this.flashT > 0) {
      this.flashT -= frameMs;
      if (this.flashT <= 0) this._baseTint();
    }

    if (this.warn) {
      const on = this.telegraphT > 0 && f.state === 'attack' && !f.dead;
      if (on) {
        this.telegraphT -= frameMs;
        const pulse = 1 + 0.25 * Math.sin(this.telegraphT * 0.04);
        this.warn.setPosition(Math.round(x), Math.round(gy - y - this.bodyH - 18)).setScale(pulse);
      }
      this.warn.setVisible(on);
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

  recoil() {
    this.puppet.playRecoil();
  }

  /** World position of the gun barrel tip (null without a gun). */
  muzzle() {
    if (!this.puppet.weaponImage) return null;
    return this.puppet.getMuzzleWorld();
  }

  /** Enemy wind-up warning above the head for `ms`. */
  telegraph(ms, heavy) {
    if (!this.warn) return;
    this.telegraphT = ms;
    this.warn.setText(heavy ? '!!' : '!');
    this.warn.setColor(heavy ? '#ff4d3d' : '#ffdd33');
  }

  /**
   * Leg cadence for the walk cycle from the real ground speed: one step covers
   * ~1.5 × leg length × stride width (stepAmp), and the walk clip makes 4 steps
   * a second at cadence 1 — so the feet don't slide.
   */
  cadence(f) {
    const v = this.groundSpeed(f);
    if (f.state === 'dash') return 1.4;
    // The walk clip swings the legs ±48° at amp 1: one step ≈ 1.5 × leg length
    const stride = Math.max(40, this.hipsH * 1.5 * this.stepAmp(f));
    return Math.min(1.8, Math.max(0.3, v / (4 * stride)));
  }

  groundSpeed(f) {
    return Math.hypot(f.x - f.px, (f.z - f.pz) * 0.7) * 60;
  }

  /** Stride width: slow walkers take short steps, runners long ones. */
  stepAmp(f) {
    if (f.state === 'dash') return 1.2;
    return Math.min(1, Math.max(0.45, this.groundSpeed(f) / 500));
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
    if (m.barrage && f.mt > m.startup && f.mt <= m.startup + m.active) {
      // «Десять ударов»: left-right-left jabs at full speed
      const sub = f.mt - m.startup + alpha;
      const c = getClip(Math.floor(sub / 3) % 2 ? 'punch_l' : 'punch_r');
      const imp = CLIP_IMPACT[c?.id] ?? 0.4;
      const pose = sampleKeyframes(c?.frames || [], imp * (0.55 + ((sub % 3) / 3) * 0.45), { ease: false });
      this.puppet.drive(dt, pose, { snap: 1 });
      return;
    }
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

  /** Curled up into a ball and rolling (Дед's e_roll). */
  _roll(f, dt) {
    const clip = getFlipClip();
    const pose = sampleKeyframes(clip.frames || [], 0.5, { ease: false });
    this.puppet.setFacing(f.facing > 0 ? 1 : 0);
    this.puppet.drive(dt, pose, { snap: 0.9 });
    const c = this.hipsH * 0.75;
    this.rot = (this.rot + dt * 1100 * f.facing) % 360;
    this.spin.setPosition(0, -c);
    this.mount.setPosition(0, c);
    this.spin.setAngle(this.rot);
    this.visual.setScale(0.82, 0.82);
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
    } else if (a.type === 'hurt' && a.reaction === 'held') {
      this.jolt = 90;
      this.flash(60);
      this.telegraphT = 0;
    } else if (a.type === 'hurt') {
      this.knockDir = a.dir || 1;
      this.telegraphT = 0;
      const dur = a.reaction === 'flinch' ? 0.3 : 0.5;
      this.puppet.playHurt(null, dur, { mirror: false });
      this.flash(a.reaction === 'kill' ? 110 : 70);
    }
  }

  destroy() {
    this.halo?.destroy();
    this.shadow.destroy();
    this.visual.destroy(true);
    this.hpBar?.destroy();
    this.warn?.destroy();
  }
}

