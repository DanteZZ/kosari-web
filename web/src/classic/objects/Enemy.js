import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';

/** Walking threats: nikita (left) / buiniy (right). Punch or shoot to kill. */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, kind = 'nikita') {
    super(scene, x, y, `${kind}_0`);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0, 0);
    this.kind = kind;
    this.hp = 100;
    this.speed = kind === 'nikita' ? -3 : 3;
    this.body.setAllowGravity(false);
    this.body.setSize(Math.max(40, this.width * 0.6), Math.max(60, this.height * 0.8));
    const anim = kind === 'nikita' ? 'nikita_walk' : 'buiniy_walk';
    if (scene.anims.exists(anim)) this.anims.play(anim, true);
    this.hurtCooldown = 0;
  }

  step() {
    if (!this.active) return;
    if (this.hurtCooldown > 0) this.hurtCooldown -= 1;
    this.x += this.speed;
    this.body.reset(this.x, this.y);
    if (this.x < -120 || this.x > 760) this.destroy();
    if (this.hp <= 0) this.die();
  }

  hurt(amount) {
    if (this.hurtCooldown > 0) return false;
    this.hp -= amount;
    this.hurtCooldown = 8;
    this.setTint(0xff6666);
    this.scene.time.delayedCall(80, () => this.clearTint());
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    if (!this.active) return;
    const { x, y } = this;
    this.destroy();
    for (let i = 0; i < 4; i += 1) {
      const bit = this.scene.add.sprite(x + Phaser.Math.Between(-10, 30), y + Phaser.Math.Between(0, 40), 'kosar_die_0');
      bit.setOrigin(0);
      if (this.scene.anims.exists('kosar_die')) bit.play('kosar_die');
      bit.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => bit.destroy());
    }
    if (this.scene.anims.exists('blood_anim')) {
      const blood = this.scene.add.sprite(x + 20, y + 40, 'blood_0').setOrigin(0);
      blood.play('blood_anim');
      blood.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => blood.destroy());
    }
    if (this.scene.textures.exists('die_s_0') && Phaser.Math.Between(1, 4) === 1) {
      const fat = this.scene.add.image(x, y - 20, 'die_s_0').setOrigin(0);
      this.scene.tweens.add({
        targets: fat,
        alpha: 0,
        y: fat.y - 30,
        duration: 900,
        onComplete: () => fat.destroy(),
      });
    }
    GameState.score += this.kind === 'nikita' ? 5000 : 8000;
    GameState.moneyScore += this.kind === 'nikita' ? 5000 : 8000;
    this.scene.sound.play('hit', { volume: 0.55 });
  }
}
