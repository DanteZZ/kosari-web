import Phaser from 'phaser';

export class LoadingScene extends Phaser.Scene {
  constructor() {
    super('Loading');
  }

  create() {
    this.add.image(0, 0, 'bg_loading').setOrigin(0);
    // Original waits ~50 frames at 30 FPS
    this.time.delayedCall(1600, () => {
      this.scene.start('Play');
    });
  }
}
