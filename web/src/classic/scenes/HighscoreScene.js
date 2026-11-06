import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';
import { Highscores } from '../state/Highscores.js';

/**
 * Web stand-in for GM action_highscore_show.
 * data.mode: 'submit' (after death) | 'view' (from menu)
 */
export class HighscoreScene extends Phaser.Scene {
  constructor() {
    super('Highscore');
  }

  init(data = {}) {
    this.mode = data.mode || 'submit';
    this.bgKey = data.bg || (this.mode === 'view' ? 'bg_highscores' : 'bg_background4');
  }

  create() {
    this.sound.stopByKey('game');
    this.sound.stopByKey('rain');

    if (this.textures.exists(this.bgKey)) {
      this.add.image(0, 0, this.bgKey).setOrigin(0);
    } else {
      this.add.image(0, 0, 'bg_background4').setOrigin(0);
    }

    // Dim overlay like modal dialog
    this.add.rectangle(320, 240, 640, 480, 0x000000, 0.35);

    const panelX = this.mode === 'view' ? 170 : 120;
    const panelW = this.mode === 'view' ? 300 : 400;
    this.add.rectangle(panelX + panelW / 2, 240, panelW, 360, 0x111111, 0.82).setStrokeStyle(2, 0xff0000);

    this.add
      .text(panelX + panelW / 2, 80, this.mode === 'view' ? 'РЕКОРДЫ' : 'HIGH SCORE', {
        fontFamily: '"Times New Roman", Times, serif',
        fontSize: '22px',
        color: '#ff0000',
      })
      .setOrigin(0.5);

    this.listText = this.add
      .text(panelX + 24, 110, this.formatList(), {
        fontFamily: '"Times New Roman", Times, serif',
        fontSize: '16px',
        color: '#ff0000',
        lineSpacing: 6,
      })
      .setOrigin(0, 0);

    if (this.mode === 'submit') {
      if (GameState.musicPlay) {
        this.sound.play('hulitakmalo', { volume: 0.85 });
      }

      this.add
        .text(panelX + panelW / 2, 340, `Ваш счёт: ${GameState.score}`, {
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: '18px',
          color: '#ff0000',
        })
        .setOrigin(0.5);

      this.add
        .text(panelX + 24, 372, 'Имя:', {
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: '16px',
          color: '#ff0000',
        });

      this.nameValue = 'Игрок';
      this.nameText = this.add.text(panelX + 70, 372, this.nameValue + '_', {
        fontFamily: '"Times New Roman", Times, serif',
        fontSize: '16px',
        color: '#ffffff',
      });

      this.add
        .text(panelX + panelW / 2, 420, 'Enter — сохранить', {
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: '14px',
          color: '#ff6666',
        })
        .setOrigin(0.5);

      this.input.keyboard.on('keydown', this.onKey, this);
    } else {
      this.add
        .text(panelX + panelW / 2, 420, 'Esc / клик — назад', {
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: '14px',
          color: '#ff6666',
        })
        .setOrigin(0.5);

      this.input.keyboard.once('keydown-ESC', () => this.scene.start('Menu'));
      this.input.once('pointerup', () => this.scene.start('Menu'));
    }

    this.events.on('shutdown', () => {
      this.input.keyboard?.off('keydown', this.onKey, this);
    });
  }

  formatList() {
    const list = Highscores.top10();
    if (!list.length) return '1. —\n2. —\n3. —';
    return list
      .map((e, i) => `${String(i + 1).padStart(2, ' ')}. ${e.name.padEnd(12, ' ')} ${e.score}`)
      .join('\n');
  }

  onKey(event) {
    if (this.mode !== 'submit') return;
    if (event.key === 'Enter') {
      Highscores.submit(GameState.score, this.nameValue);
      GameState.livesDoubler = 0;
      this.scene.stop('Menu');
      this.scene.start('Credits');
      return;
    }
    if (event.key === 'Escape') {
      // Still go to credits like closing the dialog
      GameState.livesDoubler = 0;
      this.scene.stop('Menu');
      this.scene.start('Credits');
      return;
    }
    if (event.key === 'Backspace') {
      this.nameValue = this.nameValue.slice(0, -1);
    } else if (event.key.length === 1 && this.nameValue.length < 16) {
      this.nameValue += event.key;
    }
    this.nameText.setText(`${this.nameValue}_`);
  }
}
