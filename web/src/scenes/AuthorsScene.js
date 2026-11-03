import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';

export class AuthorsScene extends Phaser.Scene {
  constructor() {
    super('Authors');
  }

  create() {
    if (this.textures.exists('bg_authors_bck')) {
      this.add.image(0, 0, 'bg_authors_bck').setOrigin(0);
    } else {
      this.cameras.main.setBackgroundColor('#101010');
    }
    if (this.textures.exists('autors_0')) {
      this.add.image(120, 80, 'autors_0').setOrigin(0);
    }
    this.add
      .text(320, 420, 'Esc — меню', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '16px',
        color: '#eeeeee',
      })
      .setOrigin(0.5);

    if (GameState.musicPlay) {
      this.sound.stopAll();
      this.sound.play('credits', { volume: 0.45 });
    }
    this.input.keyboard.once('keydown-ESC', () => {
      this.sound.stopByKey('credits');
      this.scene.start('Menu');
    });
  }
}
