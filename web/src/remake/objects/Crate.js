import Phaser from 'phaser';

/** Breakable loot crate — melee hits reduce hp, then spills coins/weapon. */
export class Crate extends Phaser.GameObjects.Container {
  constructor(scene, x, y) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setDepth(7);
    this.hp = Phaser.Math.Between(3, 5);
    this.maxHp = this.hp;
    this.hurtCd = 0;
    this.groundY = scene.groundY ?? 464;
    this.y = this.groundY;

    this.box = scene.add.rectangle(0, 0, 40, 36, 0x8b5a2b).setOrigin(0.5, 1);
    this.lid = scene.add.rectangle(0, -34, 42, 6, 0xa86b3c).setOrigin(0.5, 1);
    this.mark = scene.add
      .text(0, -18, '?', {
        fontFamily: 'Impact, sans-serif',
        fontSize: '18px',
        color: '#f5d76e',
      })
      .setOrigin(0.5);
    this.add([this.box, this.lid, this.mark]);

    scene.physics.add.existing(this);
    this.body.setAllowGravity(false);
    this.body.setSize(44, 40);
    this.body.setOffset(-22, -40);
  }

  /** @returns {boolean} destroyed */
  hit(facing = 1) {
    if (this.hurtCd > 0) return false;
    this.hurtCd = 8;
    this.hp -= 1;
    this.x += facing * 3;
    this.scene.sound.play('hit', { volume: 0.35 });
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.06,
      duration: 50,
      yoyo: true,
    });
    if (this.hp <= 0) {
      this.bust();
      return true;
    }
    return false;
  }

  bust() {
    const { x, y, scene } = this;
    this.destroy();
    scene.spawnCrateLoot?.(x, y);
    scene.sound.play('cash', { volume: 0.5 });
  }

  step() {
    if (this.hurtCd > 0) this.hurtCd -= 1;
    this.body?.reset(this.x, this.y);
  }
}
