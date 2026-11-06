import Phaser from 'phaser';

/** Falling sickle(s). Bounce once, then rest on the ground. */
export class Kosar extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, pack = 1) {
    const tex = pack >= 10 ? '10 kosarei_0' : pack >= 5 ? '5 kosarei_0' : 'kosar_0';
    super(scene, x, y, tex);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0, 0);
    this.setDepth(6);
    this.pack = pack;
    this.value = pack * 1000;
    this.vy = 3 + Math.random() * 2;
    this.vx = (Math.random() - 0.5) * 1.2;
    this.bounces = 0;
    this.grounded = false;
    this.groundLife = 520; // ~17s at 30fps
    this.body.setAllowGravity(false);
    if (pack === 1) {
      this.body.setSize(42, 17);
      this.body.setOffset(13, 5);
    } else {
      this.body.setSize(Math.max(40, this.width - 10), Math.max(20, this.height - 8));
    }
  }

  landY() {
    return (this.scene.groundY ?? 464) - this.height;
  }

  step() {
    if (!this.active) return;

    if (this.grounded) {
      this.groundLife -= 1;
      if (this.groundLife <= 0) {
        this.destroy();
        return;
      }
      // tiny idle settle
      this.body.reset(this.x, this.y);
      return;
    }

    this.vy += 0.45;
    this.x += this.vx;
    this.y += this.vy;

    const ly = this.landY();
    if (this.y >= ly) {
      this.y = ly;
      if (this.bounces < 2 && this.vy > 2) {
        this.vy = -this.vy * 0.38;
        this.vx *= 0.6;
        this.bounces += 1;
      } else {
        this.vy = 0;
        this.vx = 0;
        this.grounded = true;
      }
    }

    this.body.reset(this.x, this.y);
  }
}
