import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';

/** Ground money pile — pick up on overlap. */
export class Coin extends Phaser.GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {number} value
   */
  constructor(scene, x, y, value = 500) {
    super(scene, x, y);
    scene.add.existing(this);
    this.value = value;
    this.setDepth(8);

    const body = scene.add.rectangle(0, 0, 18, 12, 0xf0c040).setOrigin(0.5, 1);
    const shine = scene.add.rectangle(-3, -8, 4, 3, 0xfff2a0).setOrigin(0.5);
    this.add([body, shine]);

    scene.physics.add.existing(this);
    this.body.setAllowGravity(false);
    this.body.setSize(22, 16);
    this.body.setOffset(-11, -16);

    this.vy = -Phaser.Math.Between(4, 9);
    this.vx = Phaser.Math.FloatBetween(-2.5, 2.5);
    this.groundY = scene.groundY ?? 464;
    this.life = 60 * 20; // ~20s at 30fps

    scene.tweens.add({
      targets: this,
      scaleX: 1.08,
      scaleY: 1.08,
      yoyo: true,
      duration: 400,
      repeat: -1,
    });
  }

  step() {
    if (!this.active) return;
    this.life -= 1;
    if (this.life <= 0) {
      this.destroy();
      return;
    }
    if (this.y < this.groundY) {
      this.vy += 0.55;
      this.x += this.vx;
      this.y += this.vy;
      if (this.y >= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        this.vx *= 0.5;
      }
    }
    this.body?.reset(this.x, this.y);
  }

  collect() {
    if (!this.active) return 0;
    const v = this.value;
    GameState.addMoney(v);
    this.scene.sound.play('cash', { volume: 0.4 });
    this.destroy();
    return v;
  }
}
