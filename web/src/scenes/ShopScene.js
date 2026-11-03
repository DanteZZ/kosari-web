import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';

/** Prices use moneyscore like the original shop objects. */
const ITEMS = [
  {
    x: 32,
    y: 64,
    label: 'Desert Eagle — 1 750 000',
    can: () => !GameState.deserteagle && GameState.moneyScore > 1749999,
    buy: () => {
      GameState.deserteagle = 1;
      GameState.deserteaglebullets += 8;
      GameState.moneyScore -= 1750000;
    },
  },
  {
    x: 368,
    y: 80,
    label: 'Патроны DE +8 — 50 000',
    can: () => GameState.deserteagle && GameState.moneyScore > 49999,
    buy: () => {
      GameState.deserteaglebullets += 8;
      GameState.moneyScore -= 50000;
    },
  },
  {
    x: 32,
    y: 144,
    label: 'Shotgun — 2 500 000',
    can: () => !GameState.shotgunbought && GameState.moneyScore > 2499000,
    buy: () => {
      GameState.shotgunbought = 1;
      GameState.shotgunbullets += 8;
      GameState.moneyScore -= 2500000;
    },
  },
  {
    x: 368,
    y: 160,
    label: 'Патроны Shotgun +8 — 65 000',
    can: () => GameState.shotgunbought && GameState.moneyScore > 64999,
    buy: () => {
      GameState.shotgunbullets += 8;
      GameState.moneyScore -= 65000;
    },
  },
  {
    x: 32,
    y: 224,
    label: 'AK-47 — 3 000 000',
    can: () => !GameState.ak47bought && GameState.moneyScore > 2999999,
    buy: () => {
      GameState.ak47bought = 1;
      GameState.ak47bullets += 30;
      GameState.moneyScore -= 3000000;
    },
  },
  {
    x: 368,
    y: 240,
    label: 'Патроны AK +30 — 50 000',
    can: () => GameState.ak47bought && GameState.moneyScore > 49999,
    buy: () => {
      GameState.ak47bullets += 30;
      GameState.moneyScore -= 50000;
    },
  },
  {
    x: 32,
    y: 304,
    label: 'RPG-7 — 5 000 000',
    can: () => !GameState.rpg7bought && GameState.moneyScore > 4999999,
    buy: () => {
      GameState.rpg7bought = 1;
      GameState.rpg7bullets += 5;
      GameState.moneyScore -= 5000000;
    },
  },
  {
    x: 368,
    y: 320,
    label: 'Ракета RPG +1 — 5 000',
    can: () => GameState.rpg7bought && GameState.moneyScore > 4999,
    buy: () => {
      GameState.rpg7bullets += 1;
      GameState.moneyScore -= 5000;
    },
  },
  {
    x: 240,
    y: 384,
    label: 'Граната — 25 000',
    can: () => GameState.moneyScore > 24999,
    buy: () => {
      GameState.grenades += 1;
      GameState.moneyScore -= 25000;
    },
  },
];

export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  create() {
    this.add.image(0, 0, 'bg_shop').setOrigin(0);

    this.hud = this.add
      .text(16, 420, '', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '15px',
        color: '#101010',
        backgroundColor: '#ffffffaa',
        padding: { x: 8, y: 6 },
      })
      .setDepth(10);

    this.buttons = ITEMS.map((item) => {
      const t = this.add
        .text(item.x, item.y, item.label, {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '14px',
          color: '#102010',
          backgroundColor: '#ffffffcc',
          padding: { x: 6, y: 4 },
        })
        .setInteractive({ useHandCursor: true });
      t.on('pointerup', () => {
        if (!item.can()) {
          this.sound.play('warning');
          return;
        }
        item.buy();
        this.sound.play('cash');
        this.refresh();
      });
      return t;
    });

    const back = this.add.image(16, 16, 'arrow_back_0').setOrigin(0).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => {
      back.setTexture('arrow_ch_0');
      this.sound.play('beep', { volume: 0.3 });
    });
    back.on('pointerout', () => back.setTexture('arrow_back_0'));
    back.on('pointerup', () => this.scene.start('Menu'));
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Menu'));

    this.refresh();
  }

  refresh() {
    this.hud.setText(
      `Деньги: ${GameState.moneyScore}  |  DE:${GameState.deserteaglebullets}  SG:${GameState.shotgunbullets}  AK:${GameState.ak47bullets}  RPG:${GameState.rpg7bullets}  G:${GameState.grenades}`,
    );
  }
}
