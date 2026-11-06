import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';

/** Intro "danger" room before loading/play. */
export class DangerScene extends Phaser.Scene {
  constructor() {
    super('Danger');
  }

  create() {
    this.add.image(0, 0, 'bg_danger').setOrigin(0);
    if (GameState.musicPlay) {
      this.sound.play('warning', { volume: 0.5 });
    }
    this.add
      .text(320, 440, 'Пробел / Enter — дальше', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const go = () => this.scene.start('Loading');
    this.input.keyboard.once('keydown-SPACE', go);
    this.input.keyboard.once('keydown-ENTER', go);
    this.input.keyboard.once('keydown-ESC', () => this.scene.start('Menu'));
    this.time.delayedCall(3500, go);
  }
}
