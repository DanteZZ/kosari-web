import Phaser from 'phaser';
import { menu as L } from '../layout.js';
import { GameState, SaveLoad } from '../state/GameState.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');

    if (this.textures.exists('logo_0')) {
      this.add.image(L.logo.x, L.logo.y, 'logo_0').setOrigin(0.5, 0).setDepth(1);
    }

    if (GameState.musicPlay) {
      this.sound.stopAll();
      this.sound.play('menu1', { loop: true, volume: 0.55 });
    }

    const y0 = L.row0;
    const y1 = L.row0 + L.rowGap;
    const y2 = L.row0 + L.rowGap * 2;

    this.makeButton(L.colLeft, y0, 'sprite_new_game', 'sprite_new_game_ch', () => {
      this.sound.stopAll();
      GameState.resetRun();
      this.scene.start('Danger');
    }).setDepth(3);

    this.makeButton(L.colRight, y0, 'achievements', 'achievements_ch', () => {
      this.sound.stopAll();
      this.scene.start('Shop');
    }).setDepth(2);

    this.makeButton(L.colLeft, y1, 'sprite_highscore', 'sprite_highscore_ch', () => {
      this.sound.stopAll();
      this.scene.start('Highscore', { mode: 'view', bg: 'bg_highscores' });
    }).setDepth(2);

    this.addMenuAction(L.colRight, y1, 'load', 'load_ch', () => {
      if (SaveLoad.load()) {
        this.sound.play('save_load', { volume: 0.6 });
        this.scene.start('Loading');
      } else {
        this.sound.play('warning');
      }
    });

    this.addMenuAction(L.colLeft, y2, 'autors', 'autors_ch', () => {
      this.sound.stopAll();
      this.scene.start('Authors');
    });

    this.addMenuAction(L.colRight, y2, 'save', 'save_ch', () => {
      SaveLoad.save();
      this.sound.play('save_load', { volume: 0.6 });
    });

    this.makeButton(L.exit.x, L.exit.y, 'sprite_exit', 'sprite_exit_ch', () => {
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

    for (const hint of L.hints) {
      this.add
        .text(hint.x, hint.y, hint.text, {
          fontFamily: 'Consolas, monospace',
          fontSize: '12px',
          color: '#dddddd',
        })
        .setDepth(10);
    }

    this.add
      .text(L.copyright.x, L.copyright.y, L.copyright.text, {
        fontFamily: 'Consolas, monospace',
        fontSize: '11px',
        color: '#888888',
      })
      .setOrigin(0.5, 0.5)
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
