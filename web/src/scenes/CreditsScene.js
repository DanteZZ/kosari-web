import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';

/** Original credits room (speed 10): credits art + delayed dance, then back to menu. */
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super('Credits');
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.sound.stopByKey('game');
    this.sound.stopByKey('rain');
    this.sound.stopByKey('hulitakmalo');

    // credits @ (224, 0)
    this.add.image(224, 0, 'credits_0').setOrigin(0);

    // pre_dance @ (32, 128) — invisible until alarm
    this.dancer = this.add.sprite(32, 128, 'dance_0').setOrigin(0).setVisible(false);

    if (GameState.musicPlay) {
      this.sound.play('credits', { volume: 0.7 });
    }

    // 25 frames at room speed 10 → 2.5s
    this.time.delayedCall(2500, () => {
      this.dancer.setVisible(true);
      if (this.anims.exists('dance')) {
        this.dancer.play('dance');
      }
      this.canExit = true;
    });

    this.canExit = false;
    const leave = () => {
      if (!this.canExit) return;
      this.sound.stopByKey('credits');
      if (GameState.musicPlay) {
        this.sound.play('menu1', { loop: true, volume: 0.55 });
      }
      this.scene.start('Menu');
    };

    this.input.keyboard.on('keydown-ENTER', leave);
    this.input.keyboard.on('keydown-SPACE', leave);
    this.input.keyboard.on('keydown-ESC', leave);

    this.events.on('shutdown', () => {
      this.input.keyboard.off('keydown-ENTER', leave);
      this.input.keyboard.off('keydown-SPACE', leave);
      this.input.keyboard.off('keydown-ESC', leave);
    });
  }
}
