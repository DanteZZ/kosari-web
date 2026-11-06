import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';

/** Simplified boss_1/2/3 — walks, throws, takes punch/gun damage. */
export class Boss extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, tier = 1) {
    const tex = scene.textures.exists('boss1_stand_0') ? 'boss1_stand_0' : 'nikita_0';
    super(scene, x, y, tex);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0, 0);
    this.tier = tier;
    this.hp = tier === 1 ? 500 : tier === 2 ? 1500 : 3000;
    this.maxHp = this.hp;
    this.speed = tier === 3 ? 2 : 1.5;
    this.dir = -1;
    this.throwCd = 90;
    this.body.setAllowGravity(false);
    this.body.setSize(Math.max(50, this.width * 0.55), Math.max(80, this.height * 0.75));
    if (scene.anims.exists('boss_walk') === false && scene.textures.exists('boss1_go_0')) {
      // single-frame fallback handled by texture swap
    }
  }

  step() {
    if (!this.active) return;
    this.x += this.speed * this.dir;
    if (this.x < 40) this.dir = 1;
    if (this.x > 520) this.dir = -1;
    this.body.reset(this.x, this.y);

    this.throwCd -= 1;
    if (this.throwCd <= 0) {
      this.throwCd = 70 + this.tier * 20;
      this.scene.spawnBossThrow(this);
      if (this.textures.exists('boss_throw_0')) this.setTexture('boss_throw_0');
      this.scene.time.delayedCall(300, () => {
        if (this.active && this.textures.exists('boss1_stand_0')) this.setTexture('boss1_stand_0');
      });
    }

    if (this.hp <= 0) this.die();
  }

  hurt(amount) {
    this.hp -= amount;
    this.setTint(0xff5555);
    this.scene.time.delayedCall(80, () => this.clearTint());
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.active) return;
    const bonus = this.tier * 50000;
    GameState.score += bonus;
    GameState.moneyScore += bonus;
    this.scene.sound.play('explosion2', { volume: 0.6 });
    if (this.scene.textures.exists('explosion_0')) {
      const ex = this.scene.add.image(this.x, this.y, 'explosion_0').setOrigin(0);
      this.scene.time.delayedCall(400, () => ex.destroy());
    }
    this.scene.onBossDefeated?.(this);
    this.destroy();
  }
}
