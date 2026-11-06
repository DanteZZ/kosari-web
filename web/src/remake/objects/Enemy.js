import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';
import { CHAR_TARGET_H, DEBUG_FIGHT, VIEW_W } from '../game/constants.js';
import { BonePuppet } from '../game/player/BonePuppet.js';
import { getEnemySkin, enemyPartTextureKey } from '../game/enemies/parts.js';

/** Strike pocket matched to fist pad reach (~hand + reach bias). */
const STRIKE_MAX = 138;
const STRIKE_MIN = 96;
const TOO_CLOSE = 78;
const CHASE_SPEED = 6.2;
const DODGE_IFRAMES = 10;

/** Walking threats: nikita / buiniy with chase–attack–dodge fight AI. */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, kind = 'nikita') {
    const tex = scene.textures.exists('sprite_stand2_0') ? 'sprite_stand2_0' : '__DEFAULT';
    super(scene, x, y, tex);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setAlpha(0);
    this.setOrigin(0.5, 1);
    this.kind = kind;

    const skin = getEnemySkin(kind);
    this.skin = skin;
    const baseHp = skin.maxHp ?? (kind === 'buiniy' ? 160 : 120);
    const progress = Math.min(1, (scene.player?.x ?? GameState.maxXReached ?? 0) / (scene.worldW || 7200));
    // Segment scaling: early / mid / late map
    const seg = progress < 0.25 ? 0 : progress < 0.5 ? 1 : progress < 0.75 ? 2 : 3;
    const hpMul = 1 + seg * 0.35 + progress * 0.5;
    this.dmgMul = 1 + seg * 0.15;
    this.hp = Math.round(baseHp * hpMul);
    this.maxHp = this.hp;
    this.aiPaused = false;

    this.hurtCooldown = 0;
    this.body.setAllowGravity(false);
    this.body.moves = false;

    this.aiState = 'chase';
    this.attackCd = Phaser.Math.Between(10, 30);
    this.dodgeT = 0;
    this.retreatT = 0;
    this.hurtT = 0;
    this.kbVx = 0;
    this.vy = 0;
    this.hx = 0;
    /** Last frame we saw player.punching — dodge only on rising edge. */
    this._sawPlayerPunch = false;
    this.dodgeCd = 0;
    this.punching = false;
    this.punchLocksMove = false;
    this.punchStep = 0;
    this.kickStep = 0;
    this.comboUntil = 0;
    this.iFrames = 0;

    this.visual = scene.add.container(x, y).setDepth(8);
    this.puppet = new BonePuppet(scene, this.visual, {
      fit: false,
      layout: skin.layout,
      texKey: (part) => enemyPartTextureKey(skin.id, part),
      targetH: skin.targetH,
    });
    this.puppet.baseScale = skin.scale;
    this.puppet.root.setScale(skin.scale);

    const hips = Math.abs(this.puppet?.hipsRestY ?? skin.layout?.hips?.y ?? 222);
    const s = Math.abs(skin.scale || 1);
    // Same as player: cover legs + torso + head (fist pads hit chest/head)
    const bodyH = Math.max(CHAR_TARGET_H, Math.round(hips * s * 2.05));
    const bodyW = Math.round(40 * (bodyH / CHAR_TARGET_H));
    this.body.setSize(bodyW, bodyH, false);
    this.body.setOffset(this.displayOriginX - bodyW / 2, this.displayOriginY - bodyH);

    const groundY = scene.groundY ?? 464;
    this.y = groundY;
    this.x = x;
    this.dir = skin.defaultDir ?? 1;
    this.puppet.setFacing(this.dir);
    this.body.updateFromGameObject();
  }

  beginPunch(kind) {
    if (this.punching || this.hurtT > 0) return;
    const now = this.scene.time.now;
    if (now > this.comboUntil) {
      this.punchStep = 0;
      this.kickStep = 0;
    }

    const step = kind === 'z' ? this.punchStep : this.kickStep;
    this.punching = true;
    this.scene.sound.play(kind === 'z' ? 'udar' : 'punch', { volume: 0.45 });

    const move = this.puppet.playPunch(kind, step, () => {
      this.punching = false;
      this.punchLocksMove = false;
      if (this.aiState === 'attack') this.aiState = 'chase';
      this.attackCd = Phaser.Math.Between(18, 32);
      // Step back after the swing so next approach isn't face-glued
      this.retreatT = Phaser.Math.Between(10, 16);
      const away = this.dir === 0 ? 1 : -1;
      this.hx = away * 4.2;
    });
    this.punchLocksMove = kind === 'x';

    if (kind === 'z') this.punchStep = (step + 1) % 3;
    else this.kickStep = (step + 1) % 2;
    this.comboUntil = now + 700;

    const facing = this.dir === 0 ? -1 : 1;
    const side = move.hand === 'r' ? 'r' : 'l';
    const limb = kind === 'x' ? 'foot' : side;
    const at =
      limb === 'foot' ? this.puppet.getFootWorld('l') : this.puppet.getHandWorld(side);
    this.scene.spawnMeleeAttack(this, facing, kind, {
      fromPuppet: true,
      followLimb: limb,
      hx: at.x,
      hy: at.y,
      style: move.style,
      team: 'enemy',
      dur: move.dur,
      untilPunchEnd: true,
    });
  }

  step() {
    if (!this.active) return;
    if (this.hurtCooldown > 0) this.hurtCooldown -= 1;
    if (this.iFrames > 0) this.iFrames -= 1;
    if (this.attackCd > 0) this.attackCd -= 1;
    if (this.dodgeCd > 0) this.dodgeCd -= 1;

    const groundY = this.scene.groundY ?? 464;
    const player = this.scene.player;

    // Boss intro / world freeze — idle stand
    if (this.aiPaused || this.scene.cutsceneActive) {
      this.hx = 0;
      this.y = groundY;
      this._syncVisual(false);
      this.puppet?.tick?.(1 / 30, { moving: false, airborne: false, aiming: false });
      return;
    }

    // --- Hurt recover ---
    if (this.hurtT > 0) {
      this.hurtT -= 1;
      this.x += this.kbVx;
      this.kbVx *= 0.72;
      if (this.hurtT <= 0) {
        this.kbVx = 0;
        if (this.hp <= 0) {
          this.die();
          return;
        }
        this.aiState = 'chase';
      }
      this.y = groundY;
      this._syncVisual(false);
      return;
    }

    // --- Dodge (only while reacting to a real player swing) ---
    if (this.aiState === 'dodge') {
      this.dodgeT -= 1;
      this.x += this.hx;
      if (this.vy) {
        this.y += this.vy;
        this.vy += 1.1;
        if (this.y >= groundY) {
          this.y = groundY;
          this.vy = 0;
        }
      } else {
        this.y = groundY;
      }
      if (this.dodgeT <= 0) {
        this.aiState = 'chase';
        this.hx = 0;
        this.y = groundY;
        // After a successful dodge, go straight for a counter
        this.attackCd = Math.min(this.attackCd, 4);
      }
      this._syncVisual(Math.abs(this.hx) > 0.4);
      return;
    }

    if (!player?.active) {
      this.y = groundY;
      this._syncVisual(false);
      return;
    }

    const dx = player.x - this.x;
    const dist = Math.abs(dx);
    const face = dx < 0 ? 0 : 1;
    this.dir = face;

    const playerSwinging = !!player.punching;
    const punchStarted = playerSwinging && !this._sawPlayerPunch;
    this._sawPlayerPunch = playerSwinging;

    // Player has a live fist/foot hitbox aimed our way?
    const playerMeleeLive = (this.scene.meleeAttacks || []).some(
      (a) => a.team === 'player' && a.owner === player && a.ttl > 0,
    );

    // Short post-swing step-back only if player is also swinging; otherwise press the attack
    if (this.retreatT > 0 && this.aiState === 'chase') {
      if (!playerSwinging) {
        this.retreatT = 0;
        this.hx = 0;
      } else {
        this.retreatT -= 1;
        this.x += this.hx;
        this.y = groundY;
        if (this.retreatT <= 0) this.hx = 0;
        this._syncVisual(Math.abs(this.hx) > 0.3);
        return;
      }
    }

    // Dodge only on the start of a player punch (or when their hitbox appears), not every idle frame
    const threatClose = dist < STRIKE_MAX + 36;
    const facingUs =
      (player.dir === 0 && dx > 0) || (player.dir === 1 && dx < 0) || dist < 40;
    if (
      this.aiState === 'chase' &&
      this.dodgeCd <= 0 &&
      threatClose &&
      facingUs &&
      (punchStarted || playerMeleeLive) &&
      Phaser.Math.Between(1, 100) <= 70
    ) {
      this.aiState = 'dodge';
      this.dodgeT = 11;
      this.dodgeCd = 22;
      this.iFrames = DODGE_IFRAMES;
      const away = dx < 0 ? 1 : -1;
      this.hx = away * 7.5;
      this.vy = -6.5;
      this._syncVisual(true);
      return;
    }

    // --- Attack (plant feet) ---
    if (this.aiState === 'attack') {
      this.hx = 0;
      this.y = groundY;
      this._syncVisual(false);
      return;
    }

    // --- Spacing + chase ---
    // Player idle: prefer offense. Only ease out if extremely glued AND we can't swing yet.
    if (dist < TOO_CLOSE && (playerSwinging || this.attackCd > 0)) {
      this.hx = -Math.sign(dx || 1) * CHASE_SPEED * 0.85;
      this.x += this.hx;
      this.y = groundY;
      this._syncVisual(true);
      return;
    }

    // Outside reach: close in
    if (dist > STRIKE_MAX) {
      this.hx = Math.sign(dx) * CHASE_SPEED;
      this.x += this.hx;
      this.y = groundY;
      this._syncVisual(true);
      return;
    }

    // In range and player not swinging → punch. Don't stand around "dodging" air.
    if (this.attackCd <= 0 && !this.punching && dist <= STRIKE_MAX) {
      this.aiState = 'attack';
      this.hx = 0;
      const kind = Phaser.Math.Between(1, 100) <= 70 ? 'z' : 'x';
      this.beginPunch(kind);
      this.y = groundY;
      this._syncVisual(false);
    } else if (dist < STRIKE_MIN && playerSwinging) {
      this.hx = -Math.sign(dx || 1) * 2.4;
      this.x += this.hx;
      this.y = groundY;
      this._syncVisual(true);
    } else if (dist > (STRIKE_MIN + STRIKE_MAX) * 0.5) {
      // Ease into pocket while waiting on cooldown
      this.hx = Math.sign(dx) * 2.2;
      this.x += this.hx;
      this.y = groundY;
      this._syncVisual(true);
    } else {
      this.hx = 0;
      this.y = groundY;
      this._syncVisual(false);
    }

    // Cull far off-camera (keep longer in debug so arena fights stay)
    const cam = this.scene.camX?.() ?? this.scene.cameras.main.scrollX;
    const margin = DEBUG_FIGHT ? 480 : 160;
    if (this.x < cam - margin || this.x > cam + VIEW_W + margin) {
      if (!DEBUG_FIGHT) this.destroy();
    }
    if (this.hp <= 0) this.die();
  }

  _syncVisual(moving) {
    this.body.updateFromGameObject();
    this.visual.setPosition(this.x, this.y);
    this.puppet.setFacing(this.dir);
    const spd = Math.abs(this.hx);
    // Retreat / micro-sway: calm steps; chase: fuller walk without wild kicks
    let walkAmp = 0.7;
    let walkSpeed = 1;
    if (this.retreatT > 0 || this.aiState === 'dodge') {
      walkAmp = 0.32;
      walkSpeed = 0.7;
    } else if (spd < 3) {
      walkAmp = 0.4;
      walkSpeed = 0.75;
    } else if (spd < CHASE_SPEED * 0.9) {
      walkAmp = 0.55;
      walkSpeed = 0.9;
    }
    this.puppet.tick(1 / 30, {
      moving: moving && !this.punchLocksMove,
      airborne: this.y < (this.scene.groundY ?? 464) - 2,
      aiming: false,
      walkAmp,
      walkSpeed,
    });
  }

  hurt(amount, opts = {}) {
    if (this.hurtCooldown > 0 || this.iFrames > 0) return false;
    this.hp -= amount;
    this.hurtCooldown = opts.knockout ? 18 : 10;
    this.visual?.setAlpha(0.55);
    this.scene.time.delayedCall(80, () => this.visual?.setAlpha(1));

    // Cancel attack into hurt
    this.punching = false;
    this.punchLocksMove = false;
    this.aiState = 'hurt';
    // Soft crumple + short slide
    this.hurtT = opts.knockout ? 18 : 12;
    const dir = opts.facing >= 0 ? 1 : -1;
    const kb = opts.knockback ?? 6;
    this.kbVx = dir * (kb / 9);
    this.hx = 0;
    const hitFromRight = dir > 0;
    const facingRight = this.dir === 1;
    const mirror = hitFromRight === facingRight;
    this.puppet.playHurt(null, opts.knockout ? 0.55 : 0.45, { mirror });

    if (this.hp <= 0) {
      // Die after crumple recovers (see step)
      this.hurtT = Math.max(this.hurtT, 14);
      return true;
    }
    return false;
  }

  die() {
    if (!this.active) return;
    const scene = this.scene;
    const { x, y } = this;
    const kind = this.kind;
    this.destroy();
    for (let i = 0; i < 4; i += 1) {
      const bit = scene.add.sprite(
        x + Phaser.Math.Between(-10, 30),
        y - Phaser.Math.Between(40, 120),
        'kosar_die_0',
      );
      bit.setOrigin(0);
      if (scene.anims.exists('kosar_die')) bit.play('kosar_die');
      bit.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => bit.destroy());
    }
    if (scene.anims.exists('blood_anim')) {
      const blood = scene.add.sprite(x, y - 80, 'blood_0').setOrigin(0.5);
      blood.play('blood_anim');
      blood.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => blood.destroy());
    }
    const score = kind === 'nikita' ? 5000 : 8000;
    GameState.addScore(score);
    // Ground money piles (session currency) — not auto wallet
    const piles = kind === 'nikita' ? 2 : 3;
    const each = kind === 'nikita' ? 800 : 1200;
    for (let i = 0; i < piles; i += 1) {
      scene.spawnCoin?.(x + Phaser.Math.Between(-20, 40), y - 20, each);
    }
    scene.sound.play('hit', { volume: 0.55 });
  }

  destroy(fromScene) {
    this.visual?.destroy(true);
    super.destroy(fromScene);
  }
}
