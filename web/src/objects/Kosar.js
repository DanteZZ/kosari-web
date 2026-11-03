import Phaser from 'phaser';

/** Falling sickle(s). `pack` 1/5/10 changes score value and sprite. */
export class Kosar extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, pack = 1) {
    const tex = pack >= 10 ? '10 kosarei_0' : pack >= 5 ? '5 kosarei_0' : 'kosar_0';
    super(scene, x, y, tex);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0, 0);
    this.pack = pack;
    this.value = pack * 1000;
    this.fallSpeed = 6;
    this.body.setAllowGravity(false);
    if (pack === 1) {
      this.body.setSize(42, 17);
      this.body.setOffset(13, 5);
    } else {
      this.body.setSize(Math.max(40, this.width - 10), Math.max(20, this.height - 8));
    }
  }

  step() {
    this.y += this.fallSpeed;
    this.body.reset(this.x, this.y);
    if (this.y > 520) this.destroy();
  }
}
