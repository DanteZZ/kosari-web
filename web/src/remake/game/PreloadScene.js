import Phaser from 'phaser';
import { preloadGameAssets, createGameAnimations } from './assets.js';
import { showLoading } from '../ui/LoadingScreen.js';
import { MAPS, DEFAULT_MAP } from '../maps/index.js';
import { preloadThemes } from '../brawl/world/ThemeWorld.js';

/**
 * Loads every asset behind the Witcher-style loading screen (DOM overlay),
 * then waits for a key before the fight; editors start straight away.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  init(data) {
    this.playData = data || {};
  }

  preload() {
    const next = this.playData.next || 'Brawl';
    const map = next === 'Brawl' ? MAPS[this.playData.map || DEFAULT_MAP] : null;
    this.loading = showLoading(document.getElementById('game-shell') || document.body, {
      story: map?.loading,
      interactive: next === 'Brawl',
    });
    this.load.on('progress', (v) => this.loading.progress(v));
    this.load.on('loaderror', (file) => {
      console.warn('Missing asset', file?.key, file?.url);
    });
    preloadGameAssets(this);
    if (map) preloadThemes(this, map);
  }

  create() {
    createGameAnimations(this);
    const next = this.playData.next || 'Brawl';
    this.loading.done(() => this.scene.start(next, this.playData));
  }
}
