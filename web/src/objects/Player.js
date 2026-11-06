import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';
import { BonePuppet } from '../game/player/BonePuppet.js';
import { CHAR_TARGET_H, DEBUG_FIGHT } from '../game/constants.js';

/** On-screen puppet scale (native parts → CHAR_TARGET_H). */
const PLAY_SCALE = 1 / 1.5;

/** Player with Arcade body + Phaser bone puppet visual. */
export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    // Invisible physics proxy (feet at bottom). Texture only provides frame size for offsets.
    const tex = scene.textures.exists('sprite_stand2_0') ? 'sprite_stand2_0' : '__DEFAULT';
    super(scene, x, y, tex);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setAlpha(0);
    this.setOrigin(0.5, 1);
    this.body.setAllowGravity(false);
    this.body.setCollideWorldBounds(true);
    // We position manually each step — don't let arcade integrate velocity
    this.body.moves = false;

    this.dir = 1;
    this.run = 0;
    this.djump = 1;
    this.punching = false;
    /** True while a kick plays — plants feet; fist punches keep run. */
    this.punchLocksMove = false;
    /** Short facing-direction nudge while punching, if player isn't steering. */
    this.punchLunge = 0;
    this.punchLungeT = 0;
    this.punchStep = 0;
    this.kickStep = 0;
    this.comboUntil = 0;
    this.vy = 0;
    /** Horizontal carry velocity (px/frame) — survives air punches. */
    this.hx = 0;
    this.hurtT = 0;
    this.kbVx = 0;
    /** True only during the somersault oneshot (one 360°). */
    this.flipping = false;
    /** After flip clip — freefall pose until land. */
    this.falling = false;
    this.groundY = scene.groundY ?? 464;
    this.worldW = scene.worldW ?? 640;
    this.fireCooldown = 0;
    this.feetOffset = CHAR_TARGET_H;

    this.cursors = scene.input.keyboard.createCursorKeys();
    // WASD move / jump
    this.keyW = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    // JKL / UIO actions (DMC-style)
    this.keyJ = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.keyK = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.keyL = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.keyU = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
    this.keyI = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    this.keyO = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.O);
    // Meta
    this.keyB = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.keyM = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyP = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.keyEsc = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    // Debug / legacy
    this.keyN = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    this.key0 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO);
    this.key1 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.key4 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
    this.key5 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
    this.key6 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SIX);

    // visual (feet) → spin (rotates around body pivot) → mount/puppet.root (mirror + bones)
    // BonePuppet uses parent as root — must NOT pass spin, or angle gets wiped by setFacing/setAngle(0).
    this.visual = scene.add.container(x, y).setDepth(10);
    this.spin = scene.add.container(0, 0);
    this.visual.add(this.spin);
    this.mount = scene.add.container(0, 0);
    this.spin.add(this.mount);
    this.puppet = new BonePuppet(scene, this.mount, { fit: false });
    this.puppet.baseScale = PLAY_SCALE;
    this.puppet.root.setScale(PLAY_SCALE);
    this.syncHurtbox();
    this.syncWeapon();
  }

  /**
   * Arcade offset is from the texture top-left, not the origin.
   * Origin is feet (0.5, 1) → box from feet up through head (matches bone puppet).
   */
  /** Feet → hips (hurtbox / standing). */
  bodyPivotY() {
    const hips = Math.abs(this.puppet?.hipsRestY ?? 222);
    const s = Math.abs(this.puppet?.baseScale ?? PLAY_SCALE);
    return hips * s;
  }

  /**
   * Rest-pose estimate: feet → head joint (fallback before live sample).
   */
  neckPivotY() {
    const s = Math.abs(this.puppet?.baseScale ?? PLAY_SCALE);
    const hips = Math.abs(this.puppet?.hipsRestY ?? 222);
    const layout = this.puppet?._layout?.() || {};
    const headLocal = Math.abs(layout.head?.y ?? this.puppet?.nodes?.head?.y ?? 144);
    return (hips + headLocal) * s;
  }

  /**
   * Live head-joint offset from feet in visual space (no extra nudge).
   * @returns {{ x: number, y: number }}
   */
  sampleNeckOffset() {
    const head = this.puppet?.nodes?.head;
    if (!head) return { x: 0, y: -this.neckPivotY() };
    const mat = head.getWorldTransformMatrix();
    return {
      x: mat.tx - this.x,
      y: mat.ty - this.y,
    };
  }

  syncHurtbox() {
    const hips = Math.abs(this.puppet?.hipsRestY ?? 222);
    const s = Math.abs(this.puppet?.baseScale ?? PLAY_SCALE);
    const fullH = Math.max(CHAR_TARGET_H, Math.round(hips * s * 2.05));
    this.feetOffset = fullH;

    if (this.flipping) {
      // Prefer last live neck from applyFlipVisual
      const ox = this._flipNeck?.x ?? 0;
      const oy = this._flipNeck?.y ?? -this.neckPivotY();
      const box = 52;
      this.body.setSize(box, box, false);
      this.body.setOffset(
        this.displayOriginX - box / 2 + ox,
        this.displayOriginY - box / 2 + oy,
      );
    } else {
      const bodyW = 40;
      this.body.setSize(bodyW, fullH, false);
      this.body.setOffset(
        this.displayOriginX - bodyW / 2,
        this.displayOriginY - fullH,
      );
    }
    this.body.updateFromGameObject();
  }

  resetFlipTransform() {
    this.visual.setAngle(0);
    this.spin.setAngle(0);
    this.spin.setPosition(0, 0);
    this.mount.setAngle(0);
    this.mount.setPosition(0, 0);
    this.puppet.root.setAngle(0);
    this.puppet.root.setPosition(0, 0);
    this.puppet.setFacing(this.dir);
  }

  /**
   * World-space offset of puppet root (visual feet) under current spin orbit.
   * At non-zero spin.angle, feet leave this.x/y — must bake before clearing spin.
   */
  flipVisualFeetOffset() {
    const sx = this.spin?.x ?? 0;
    const sy = this.spin?.y ?? 0;
    const rx = this.puppet?.root?.x ?? 0;
    const ry = this.puppet?.root?.y ?? 0;
    const rad = ((this.spin?.angle ?? 0) * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return {
      x: sx + rx * c - ry * s,
      y: sy + rx * s + ry * c,
    };
  }

  /**
   * Clear spin/root without a silhouette hitch.
   * Bake spun feet world-offset into this.x/y first — camera follows the physics
   * proxy, so zeroing angle before bake yanks the body back and feels like X freeze.
   */
  settleFlipTransform() {
    const off = this.flipVisualFeetOffset();
    this.resetFlipTransform();
    if (off.x || off.y) {
      this.x += off.x;
      this.y += off.y;
    }
    return off;
  }

  /** Start somersault oneshot (one turn), then freefall. */
  beginFlip() {
    if (this.flipping || this.puppet.isFlipping()) return;
    this.flipping = true;
    this.falling = false;
    this.punching = false;
    this.punchLocksMove = false;
    this.punchLunge = 0;
    this.punchLungeT = 0;
    // Lock facing for the whole spin — mid-air turn must not mirror the pivot
    this.flipDir = this.dir;
    this._flipNeck = null;
    this.djump = 0; // salto spends the air jump
    this.syncHurtbox();
    const facing = this.flipDir === 0 ? -1 : 1;
    this.puppet.playFlip(
      facing,
      () => this.finishFlipAnim(),
      { amp: 0.85, speed: 1 },
    );
  }

  /** Flip clip finished (still airborne or landed). */
  finishFlipAnim() {
    this.flipping = false;
    this.flipDir = null;
    this._flipNeck = null;
    this.settleFlipTransform();
    this.falling = !this.isOnFloor();
    if (this.falling) this.puppet.clip = 'fall';
    else this.puppet.clip = 'idle';
    // Immediately steer from keys already held — no coast frame after spin
    this.applyAirSteerFromKeys();
    this.puppet.setFacing(this.dir);
    this.syncHurtbox();
    // Keep puppet under the settled feet this frame (camera follows physics proxy)
    this.visual.setPosition(this.x, this.y);
  }

  /** Read left/right and set hx (air) — same speed as ground run. */
  applyAirSteerFromKeys() {
    if (this.isOnFloor()) return;
    const RUN = 17;
    let input = 0;
    if (this.keyA.isDown || this.cursors.left.isDown) input = -1;
    else if (this.keyD.isDown || this.cursors.right.isDown) input = 1;
    if (input) {
      this.dir = input < 0 ? 0 : 1;
      this.hx = input * RUN;
      this.run = 1;
    }
  }

  endFlip() {
    this.flipping = false;
    this.falling = false;
    this.flipDir = null;
    this._flipNeck = null;
    if (this.puppet.oneshot?.style === 'flip') this.puppet.oneshot = null;
    this.settleFlipTransform();
    this.syncHurtbox();
  }

  flipPivotY() {
    return Math.abs(this._flipNeck?.y ?? this.neckPivotY());
  }

  /**
   * Flip: 360° around the *live* neck (head joint in current tuck pose).
   * Facing is locked at beginFlip so turning mid-air doesn't mirror the pivot.
   */
  applyFlipVisual() {
    const u = this.puppet.flipProgress();
    const faceDir = this.flipDir ?? this.dir;
    const facing = faceDir === 0 ? -1 : 1;

    this.visual.setPosition(this.x, this.y);
    this.visual.setAngle(0);

    // 1) Clear spin, pose already applied — sample neck with locked facing
    this.spin.setAngle(0);
    this.spin.setPosition(0, 0);
    this.puppet.root.setAngle(0);
    this.puppet.root.setPosition(0, 0);
    this.puppet.setFacing(faceDir);

    const neck = this.sampleNeckOffset();
    this._flipNeck = neck;
    const { x: ox, y: oy } = neck;

    // 2) Spin around that point; root counter-offset keeps the joint on the axis
    this.spin.x = ox;
    this.spin.y = oy;
    this.spin.angle = u * 360 * facing;
    this.puppet.root.x = -ox;
    this.puppet.root.y = -oy;
    this.puppet.root.angle = 0;

    // Keep hurtbox on the same live neck
    const box = 52;
    this.body.setSize(box, box, false);
    this.body.setOffset(
      this.displayOriginX - box / 2 + ox,
      this.displayOriginY - box / 2 + oy,
    );
    this.body.updateFromGameObject();
  }

  feetY() {
    return this.y;
  }

  isOnFloor() {
    // Manual hx/vy physics — ignore sticky arcade blocked/touching flags
    // (they stayed true after jump and immediately cancelled the flip clip).
    return this.feetY() >= this.groundY - 1;
  }

  getMuzzle() {
    return this.puppet.getMuzzleWorld();
  }

  beginPunch(kind) {
    if (this.punching || this.flipping || this.hurtT > 0 || GameState.weaponChoose !== 0) return;
    const now = this.scene.time.now;
    if (now > this.comboUntil) {
      this.punchStep = 0;
      this.kickStep = 0;
    }

    const step = kind === 'z' ? this.punchStep : this.kickStep;
    this.punching = true;
    this.scene.sound.play(kind === 'z' ? 'udar' : 'punch', { volume: 0.55 });

    const move = this.puppet.playPunch(kind, step, () => {
      this.punching = false;
      this.punchLocksMove = false;
      this.punchLungeT = 0;
      this.punchLunge = 0;
    });
    this.punchLocksMove = kind === 'x';

    if (kind === 'z') this.punchStep = (step + 1) % 3;
    else this.kickStep = (step + 1) % 2;
    this.comboUntil = now + 900;

    const facing = this.dir === 0 ? -1 : 1;
    // Standing strike: ease a bit into the facing direction (skip if already steering)
    const steered =
      this.cursors.left.isDown ||
      this.cursors.right.isDown ||
      this.keyA.isDown ||
      this.keyD.isDown;
    if (!steered) {
      this.punchLunge = facing * (kind === 'x' ? 1.5 : 1.1);
      this.punchLungeT = kind === 'x' ? 4 : 3;
    } else {
      this.punchLunge = 0;
      this.punchLungeT = 0;
    }
    const side = move.hand === 'r' ? 'r' : 'l';
    const limb = kind === 'x' ? 'foot' : side;
    const at =
      limb === 'foot' ? this.puppet.getFootWorld('l') : this.puppet.getHandWorld(side);
    // Active for the whole swing; each target registers at most once
    this.scene.spawnMeleeAttack(this, facing, kind, {
      fromPuppet: true,
      followLimb: limb,
      hx: at.x,
      hy: at.y,
      style: move.style,
      team: 'player',
      dur: move.dur,
      untilPunchEnd: true,
    });
  }

  /** Hit reaction: crumple stun + short heavy knockback. */
  applyHurt(opts = {}) {
    this.punching = false;
    this.punchLocksMove = false;
    this.punchLunge = 0;
    this.punchLungeT = 0;
    // Soft stun + light knockback — minimal screen jerk
    this.hurtT = opts.knockout ? 14 : 9;
    const dir = opts.facing >= 0 ? 1 : -1;
    const kb = opts.knockback ?? 5;
    this.kbVx = dir * (kb / 14);
    this.hx = 0;
    // Fold away from the blow (mirror if hit while facing the other way)
    const hitFromRight = dir > 0;
    const facingRight = this.dir === 1;
    const mirror = hitFromRight === facingRight;
    this.puppet.playHurt(null, opts.knockout ? 0.55 : 0.45, { mirror });
  }

  selectWeapon(id) {
    const idN = Number(id) || 0;
    if (idN < 0 || idN > 4 || !GameState.ownsWeapon(idN)) {
      this.scene.sound.play('beep', { volume: 0.25 });
      return;
    }
    GameState.weaponChoose = idN;
    if (typeof window !== 'undefined' && window.__KosariState) {
      window.__KosariState.weaponChoose = idN;
    }
    if (idN === 0) this.scene.sound.play('beep', { volume: 0.2 });
    else if (idN === 1) this.scene.sound.play('DE_reload', { volume: 0.5 });
    else if (idN === 2 || idN === 4) this.scene.sound.play('shotgun_reload', { volume: 0.5 });
    else if (idN === 3) this.scene.sound.play('DE_reload', { volume: 0.5 });
    this.syncWeapon();
    try {
      this.scene.pushHud?.();
    } catch (_) {
      /* HUD optional during boot */
    }
  }

  /** Cycle fists → owned guns only */
  cycleWeapon(dir = 1) {
    const slots = [0, ...GameState.ownedWeaponIds()];
    const cur = GameState.weaponChoose || 0;
    let idx = slots.indexOf(cur);
    if (idx < 0) idx = 0;
    const next = slots[(idx + (dir >= 0 ? 1 : slots.length - 1)) % slots.length];
    this.selectWeapon(next);
  }

  syncWeapon() {
    const w = GameState.weaponChoose || 0;
    if (!w) {
      this.puppet.clearWeapon();
      return;
    }
    // Pure Kenney gun sprite on hand_r bone
    this.puppet.attachWeapon(w);
  }

  onFired() {
    if (GameState.weaponChoose > 0) this.puppet.playRecoil();
  }

  step() {
    if (!this.active) return;
    if (this.fireCooldown > 0) this.fireCooldown -= 1;

    if (DEBUG_FIGHT) {
      if (Phaser.Input.Keyboard.JustDown(this.keyN)) {
        this.scene.spawnEnemyNearPlayer?.('nikita');
      }
      if (Phaser.Input.Keyboard.JustDown(this.keyM) && this.keyS.isDown) {
        this.scene.spawnEnemyNearPlayer?.('buiniy');
      }
    }

    // CS-style buy menu: B toggles side panel (combat keeps running)
    if (Phaser.Input.Keyboard.JustDown(this.keyB) && !this.scene.cutsceneActive) {
      this.scene.toggleSessionShop?.();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyEsc) && this.scene.shopOpen) {
      this.scene.toggleSessionShop?.(false);
      return;
    }
    // While buy menu open: 1–6 purchase; weapon digits deferred
    if (this.scene.shopOpen) {
      const buyKeys = [
        this.key1,
        this.key2,
        this.key3,
        this.key4,
        this.key5,
        this.key6,
      ];
      for (let i = 0; i < buyKeys.length; i += 1) {
        if (buyKeys[i] && Phaser.Input.Keyboard.JustDown(buyKeys[i])) {
          this.scene.tryBuyShopSlot?.(i + 1);
        }
      }
    }

    // Stunned by hit — short slide + crumple anim
    if (this.hurtT > 0) {
      this.hurtT -= 1;
      this.x = Phaser.Math.Clamp(this.x + this.kbVx, 40, this.worldW - 40);
      this.kbVx *= 0.72;
      if (!this.isOnFloor()) this.vy = Math.min(48, this.vy + 2.55);
      this.y += this.vy;
      if (this.feetY() > this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
      }
      if (this.hurtT <= 0) this.kbVx = 0;
      this.body.updateFromGameObject();
      this.visual.setPosition(this.x, this.y);
      this.puppet.setFacing(this.dir);
      this.puppet.tick(1 / 30, {
        moving: false,
        airborne: !this.isOnFloor(),
        aiming: false,
      });
      return;
    }

    if (!this.isOnFloor()) {
      this.vy = Math.min(48, this.vy + 2.55);
    } else {
      if (this.vy > 0) this.vy = 0;
      this.djump = 1;
      this.y = this.groundY;
      if (this.flipping || this.falling) this.endFlip();
    }

    const RUN = 17;
    // Scaled with gravity 1.65→2.55 (×1.545) — same apex/hang time as before the gravity buff
    const JUMP = -32.5;
    const JUMP_FLIP = -37;
    const JUMP_DOUBLE = -25.5;
    const onFloor = this.isOnFloor();

    let input = 0;
    if (this.keyA.isDown || this.cursors.left.isDown) input = -1;
    else if (this.keyD.isDown || this.cursors.right.isDown) input = 1;
    // During flip keep visual facing locked; still steer with hx from input
    if (input && !this.flipping) this.dir = input < 0 ? 0 : 1;

    // WASD → full run on ground and in air.
    if (input) {
      this.hx = input * RUN;
      this.run = 1;
      this.punchLungeT = 0;
      this.punchLunge = 0;
    } else if (this.punchLungeT > 0) {
      this.hx = this.punchLunge;
      this.punchLungeT -= 1;
      this.punchLunge *= 0.55;
      this.run = 0;
    } else if (this.punching && this.punchLocksMove && onFloor) {
      this.hx = 0;
      this.run = 0;
    } else if (onFloor) {
      this.hx = 0;
      this.run = 0;
    } else {
      this.run = 0;
    }

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.keyW) || Phaser.Input.Keyboard.JustDown(this.cursors.up);
    if (jumpPressed) {
      if (onFloor) {
        const movingJump = !!(this.run || input);
        this.vy = movingJump ? JUMP_FLIP : JUMP;
        if (movingJump) this.beginFlip();
      } else if (this.djump && !this.flipping) {
        const doFlip = input || Math.abs(this.hx) > 2;
        this.vy = JUMP_DOUBLE;
        this.djump = 0;
        if (doFlip) this.beginFlip();
      }
    }

    const dx = this.hx;

    if (Phaser.Input.Keyboard.JustDown(this.keyJ)) this.beginPunch('z');
    if (Phaser.Input.Keyboard.JustDown(this.keyK)) this.beginPunch('x');

    if (!this.scene.shopOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.key0)) this.selectWeapon(0);
      if (Phaser.Input.Keyboard.JustDown(this.key1)) this.selectWeapon(1);
      if (Phaser.Input.Keyboard.JustDown(this.key2)) this.selectWeapon(2);
      if (Phaser.Input.Keyboard.JustDown(this.key3)) this.selectWeapon(3);
      if (Phaser.Input.Keyboard.JustDown(this.key4)) this.selectWeapon(4);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyO)) this.cycleWeapon(1);
    if (Phaser.Input.Keyboard.JustDown(this.keyI)) this.cycleWeapon(-1);

    if (this.keyL.isDown && this.fireCooldown <= 0 && GameState.weaponChoose > 0) {
      this.scene.tryFireWeapon(this);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyU)) {
      this.scene.tryThrowGrenade(this);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyP)) {
      this.scene.pausedGame = !this.scene.pausedGame;
      this.game?.events?.emit?.('remake-pause', this.scene.pausedGame);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.scene.sound.stopAll();
      if (typeof this.scene.onExit === 'function') this.scene.onExit();
      else this.scene.scene.start('Menu');
    }

    // Track map progress for difficulty
    if (this.x > (GameState.maxXReached || 0)) GameState.maxXReached = this.x;

    this.x = Phaser.Math.Clamp(this.x + dx, 40, this.worldW - 40);
    this.y += this.vy;
    if (this.feetY() > this.groundY) {
      this.y = this.groundY;
      this.vy = 0;
      if (this.flipping || this.falling) this.endFlip();
    }
    this.body.updateFromGameObject();

    const dt = 1 / 30;
    const moving = this.run === 1 && !(this.punching && this.punchLocksMove);
    // Advance flip clip first so spin angle matches current frame
    this.puppet.tick(dt, {
      moving,
      airborne: !this.isOnFloor(),
      aiming: GameState.weaponChoose > 0 && !this.punching && !this.flipping,
      falling: this.falling,
      walkAmp: 1,
      walkSpeed: 1,
    });

    if (this.flipping || this.puppet.isFlipping()) {
      this.applyFlipVisual();
    } else {
      this.resetFlipTransform();
      this.visual.setPosition(this.x, this.y);
    }
  }

  destroy(fromScene) {
    this.visual?.destroy(true);
    super.destroy(fromScene);
  }
}
