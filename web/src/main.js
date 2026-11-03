import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { HighscoreScene } from './scenes/HighscoreScene.js';
import { CreditsScene } from './scenes/CreditsScene.js';
import { DangerScene } from './scenes/DangerScene.js';
import { AuthorsScene } from './scenes/AuthorsScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 640,
  height: 480,
  backgroundColor: '#000000',
  pixelArt: true,
  fps: {
    target: 30,
    forceSetTimeOut: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    MenuScene,
    LoadingScene,
    DangerScene,
    PlayScene,
    ShopScene,
    HighscoreScene,
    CreditsScene,
    AuthorsScene,
  ],
};

const game = new Phaser.Game(config);
window.__kosari = game;
