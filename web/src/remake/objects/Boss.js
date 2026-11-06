import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';
import { CHAR_TARGET_H } from '../game/constants.js';
import { BonePuppet } from '../game/player/BonePuppet.js';
import { getEnemySkin, enemyPartTextureKey } from '../game/enemies/parts.js';

/** Boss tiers 1/2/3 — bone puppet, walks + throws. */
export class Boss extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, tier = 1) {
    const tex = scene.textures.exists('sprite_stand2_0') ? 'sprite_stand2_0' : '__DEFAULT';
    super(scene, x, y, tex);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setAlpha(0);
    this.setOrigin(0.5, 1);
    this.tier = tier;
    this.hp = tier === 1 ? 500 : tier === 2 ? 1500 : 3000;
    this.maxHp = this.hp;
    this.speed = tier === 3 ? 2 : 1.5;
    this.dir = -1;
    this.throwCd = 90;
    this.body.setAllowGravity(false);
    this.body.moves = false;

    const skin = getEnemySkin('boss1');
    this.skin = skin;
    // Bigger each tier
    const scale = skin.scale * (1 + (tier - 1) * 0.12);

    this.visual = scene.add.container(x, y).setDepth(9);
    this.puppet = new BonePuppet(scene, this.visual, {
      fit: false,
      layout: skin.layout,
      texKey: (part) => enemyPartTextureKey(skin.id, part),
      targetH: skin.targetH,
    });
    this.puppet.baseScale = scale;
    this.puppet.root.setScale(scale);

    const hips = Math.abs(this.puppet?.hipsRestY ?? skin.layout?.hips?.y ?? 222);
    const bodyH = Math.max(CHAR_TARGET_H, Math.round(hips * Math.abs(scale) * 2.05));
    const bodyW = Math.round(48 * (bodyH / CHAR_TARGET_H));
    this.body.setSize(bodyW, bodyH, false);
    this.body.setOffset(this.displayOriginX - bodyW / 2, this.displayOriginY - bodyH);

    this.y = scene.groundY ?? y;
    this.x = x;
    this.puppet.setFacing(this.dir < 0 ? 0 : 1);
    this.body.updateFromGameObject();
  }

  step() {
    if (!this.active) return;
    this.x += this.speed * this.dir;
    const left = (this.scene.cameras?.main?.scrollX ?? 0) + 80;
    const right = left + (this.scene.scale.width || 960) - 160;
    if (this.x < left) this.dir = 1;
    if (this.x > right) this.dir = -1;

    this.y = this.scene.groundY ?? this.y;
    this.body.updateFromGameObject();
    this.visual.setPosition(this.x, this.y);
    this.puppet.setFacing(this.dir < 0 ? 0 : 1);
    this.puppet.tick(1 / 30, { moving: true, airborne: false, aiming: false });

    this.throwCd -= 1;
    if (this.throwCd <= 0) {
      this.throwCd = 70 + this.tier * 20;
      this.scene.spawnBossThrow(this);
    }

    if (this.hp <= 0) this.die();
  }

  hurt(amount, opts = {}) {
    this.hp -= amount;
    this.visual?.setAlpha(0.5);
    this.scene.time.delayedCall(80, () => this.visual?.setAlpha(1));
    if (opts.knockback) {
      const dir = opts.facing >= 0 ? 1 : -1;
      this.x += dir * opts.knockback;
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.active) return;
    const bonus = this.tier * 50000;
    GameState.addScore(bonus);
    GameState.addMoney(Math.floor(bonus * 0.25));
    this.scene.sound.play('explosion2', { volume: 0.6 });
    if (this.scene.textures.exists('explosion_0')) {
      const ex = this.scene.add.image(this.x, this.y - 100, 'explosion_0').setOrigin(0.5);
      this.scene.time.delayedCall(400, () => ex.destroy());
    }
    this.scene.onBossDefeated?.(this);
    this.destroy();
  }

  destroy(fromScene) {
    this.visual?.destroy(true);
    super.destroy(fromScene);
  }
}
