import Phaser from 'phaser';
import { W, H } from './layout.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { LoadingScene } from './scenes/LoadingScene.js';
import { PlayScene } from './scenes/PlayScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { HighscoreScene } from './scenes/HighscoreScene.js';
import { CreditsScene } from './scenes/CreditsScene.js';
import { DangerScene } from './scenes/DangerScene.js';
import { AuthorsScene } from './scenes/AuthorsScene.js';

/** Integer zoom 1× or 2× only; center with black letterbox. */
function applyIntegerZoom(game) {
  const parent = document.getElementById('game');
  const canvas = game.canvas;
  if (!parent || !canvas) return;

  const pw = parent.clientWidth || window.innerWidth;
  const ph = parent.clientHeight || window.innerHeight;
  const z = Math.min(2, Math.max(1, Math.floor(Math.min(pw / W, ph / H))));
  const dw = W * z;
  const dh = H * z;
  const ml = Math.floor((pw - dw) / 2);
  const mt = Math.floor((ph - dh) / 2);

  canvas.style.width = `${dw}px`;
  canvas.style.height = `${dh}px`;
  canvas.style.marginLeft = `${ml}px`;
  canvas.style.marginTop = `${mt}px`;

  game.scale.displaySize.setSize(dw, dh);
  game.scale.displayScale.set(z, z);
  game.scale.canvasBounds.setTo(ml, mt, dw, dh);
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  fps: {
    target: 30,
    forceSetTimeOut: true,
  },
  scale: {
    mode: Phaser.Scale.NONE,
    width: W,
    height: H,
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

const refresh = () => applyIntegerZoom(game);
game.events.once('ready', () => {
  refresh();
  requestAnimationFrame(refresh);
});
window.addEventListener('resize', refresh);
window.addEventListener('orientationchange', () => setTimeout(refresh, 120));
