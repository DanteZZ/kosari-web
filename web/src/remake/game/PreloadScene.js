import Phaser from 'phaser';
import { preloadGameAssets, createGameAnimations } from './assets.js';
import { showLoading } from '../ui/LoadingScreen.js';
import { MAPS, DEFAULT_MAP } from '../maps/index.js';
import { preloadThemes } from '../brawl/world/ThemeWorld.js';
import { storyText, storyVoice, HERO_GOALS } from '../story.js';
import { GameState } from '../state/GameState.js';
import { getHero } from './heroes.js';
import { preloadVoices } from '../brawl/Voices.js';

/**
 * Loads every asset behind the Witcher-style loading screen (DOM overlay),
 * then waits for a key before the fight; editors start straight away.
 */
/** Whose face turns on the medallion (the boss / newcomer of the map). */
const FACE = {
  forest: 'boss1', opushka: 'povar', village: 'ded', dacha: 'pahom', panelki: 'mongol', pc_club: 'glad',
  gym: 'ruki', museum: 'ponasenkov', river: 'reka', sigma_gym: 'gigachad', stream_house: 'papich',
  office: 'gitelman', concert: 'klas',
};

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
      // Narration depends on the hero: same road, a different reason to walk it
      story: map?.loading && {
        ...map.loading,
        text: storyText(map.id, getHero(GameState.hero).id) || map.loading.text,
        voice: storyVoice(map.id, getHero(GameState.hero).id),
        bg: `assets/loading/scenes/${map.baseId || map.id}.jpg`,
        chapter: map.chapter || '',
        face: `assets/enemies/${FACE[map.baseId || map.id] || 'nikita'}/parts/head.png`,
        goal: `${getHero(GameState.hero).label} · цель: ${HERO_GOALS[getHero(GameState.hero).id] || HERO_GOALS.pocik}`,
      },
      interactive: next === 'Brawl',
    });
    this.load.on('progress', (v) => this.loading.progress(v));
    this.load.on('loaderror', (file) => {
      console.warn('Missing asset', file?.key, file?.url);
    });
    preloadGameAssets(this);
    if (map) preloadVoices(this);
    if (map) preloadThemes(this, map);
  }

  create() {
    createGameAnimations(this);
    const next = this.playData.next || 'Brawl';
    this.loading.done(() => this.scene.start(next, this.playData));
  }
}
