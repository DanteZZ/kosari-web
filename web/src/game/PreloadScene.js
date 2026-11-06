import Phaser from 'phaser';
import { preloadGameAssets, createGameAnimations } from './assets.js';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  init(data) {
    this.playData = data || {};
  }

  preload() {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 36, 'КОСАРИ', {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const bar = this.add.rectangle(width / 2 - 158, height / 2, 4, 12, 0xffffff).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 320, 18, 0x222222);
    this.load.on('progress', (value) => {
      bar.width = 4 + 312 * value;
    });
    this.load.on('loaderror', (file) => {
      console.warn('Missing asset', file?.key, file?.url);
    });
    preloadGameAssets(this);
  }

  create() {
    createGameAnimations(this);
    const next = this.playData.next || 'Play';
    this.scene.start(next, this.playData);
  }
}
