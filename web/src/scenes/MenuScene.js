import Phaser from 'phaser';
import { GameState, SaveLoad } from '../state/GameState.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.add.image(0, 0, 'bg_menu').setOrigin(0);

    if (GameState.musicPlay) {
      this.sound.stopAll();
      this.sound.play('menu1', { loop: true, volume: 0.55 });
    }

    this.makeButton(0, 352, 'sprite_exit', 'sprite_exit_ch', () => {
      this.sound.stopAll();
      const msg = this.add
        .text(320, 200, 'Выйти хочешь — косарь должен!', {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '22px',
          color: '#ffffff',
          backgroundColor: '#000000aa',
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5)
        .setDepth(50);
      this.time.delayedCall(1600, () => msg.destroy());
    }).setDepth(1);

    this.makeButton(0, 288, 'sprite_highscore', 'sprite_highscore_ch', () => {
      this.sound.stopAll();
      this.scene.start('Highscore', { mode: 'view', bg: 'bg_highscores' });
    }).setDepth(2);

    this.makeButton(320, 256, 'achievements', 'achievements_ch', () => {
      this.sound.stopAll();
      this.scene.start('Shop');
    }).setDepth(2);

    this.makeButton(0, 256, 'sprite_new_game', 'sprite_new_game_ch', () => {
      this.sound.stopAll();
      GameState.resetRun();
      this.scene.start('Danger');
    }).setDepth(3);

    // Original positions: authors (0,320), save (320,320), load (0,288) shares row with highscores
    this.addMenuAction(0, 320, 'autors', 'autors_ch', () => {
      this.sound.stopAll();
      this.scene.start('Authors');
    });

    if (this.textures.exists('save_0')) {
      this.addMenuAction(320, 320, 'save', 'save_ch', () => {
        SaveLoad.save();
        this.sound.play('save_load', { volume: 0.6 });
      });
    }

    if (this.textures.exists('load_0')) {
      this.addMenuAction(320, 288, 'load', 'load_ch', () => {
        if (SaveLoad.load()) {
          this.sound.play('save_load', { volume: 0.6 });
          this.scene.start('Loading');
        } else {
          this.sound.play('warning');
        }
      });
    }

    this.add
      .text(8, 440, 'Enter — игра · L — загрузка · R — рекорды · Esc выход', {
        fontFamily: 'Consolas, monospace',
        fontSize: '12px',
        color: '#dddddd',
      })
      .setDepth(10);

    this.add
      .text(8, 456, '← → ходить · ↑ прыжок · Z/X удар · 0-4 оружие · A стрелять · S граната', {
        fontFamily: 'Consolas, monospace',
        fontSize: '12px',
        color: '#dddddd',
      })
      .setDepth(10);

    this.input.keyboard?.once('keydown-ENTER', () => {
      this.sound.stopAll();
      GameState.resetRun();
      this.scene.start('Danger');
    });
    this.input.keyboard?.once('keydown-L', () => {
      if (SaveLoad.load()) {
        this.sound.play('save_load');
        this.scene.start('Loading');
      }
    });
    this.input.keyboard?.once('keydown-R', () => {
      this.sound.stopAll();
      this.scene.start('Highscore', { mode: 'view', bg: 'bg_highscores' });
    });
  }

  addMenuAction(x, y, idle, hover, onClick) {
    if (!this.textures.exists(`${idle}_0`)) return null;
    return this.makeButton(x, y, idle, hover, onClick).setDepth(5);
  }

  makeButton(x, y, idleKey, hoverKey, onClick) {
    const hoverTex = this.textures.exists(`${hoverKey}_0`) ? hoverKey : idleKey;
    const btn = this.add
      .image(x, y, `${idleKey}_0`)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => {
      btn.setTexture(`${hoverTex}_0`);
      this.sound.play('beep', { volume: 0.3 });
    });
    btn.on('pointerout', () => btn.setTexture(`${idleKey}_0`));
    btn.on('pointerup', onClick);
    return btn;
  }
}
