import Phaser from 'phaser';
import { VIEW_W, VIEW_H, applyViewSize } from './constants.js';
import { PreloadScene } from './PreloadScene.js';
import { PlayScene } from './PlayScene.js';
import { BoneEditorScene } from './BoneEditorScene.js';
import { AnimEditorScene } from './AnimEditorScene.js';
import { BrawlScene } from '../brawl/BrawlScene.js';

let game = null;

function stageSize(parent) {
  const el = typeof parent === 'string' ? document.getElementById(parent) : parent;
  const w = Math.max(1, Math.floor(el?.clientWidth || window.innerWidth));
  const h = Math.max(1, Math.floor(el?.clientHeight || window.innerHeight));
  applyViewSize(w, h);
  return { w: VIEW_W, h: VIEW_H };
}

/**
 * @param {{ legacy30?: boolean }} [opts] legacy30 — old frame-based scenes run at a fixed 30 fps.
 */
function makeGame(parent, opts = {}) {
  const { w, h } = stageSize(parent);
  const g = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: w,
    height: h,
    backgroundColor: '#7ec8f0',
    pixelArt: false,
    roundPixels: true,
    // Old scenes step logic per frame at 30 fps; the brawl core is fixed-tick + interpolated
    fps: opts.legacy30 === false ? { smoothStep: false } : { target: 30, forceSetTimeOut: true },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false,
      },
    },
    // RESIZE: canvas buffer = parent size → 1 CSS px = 1 game px, fills window.
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: w,
      height: h,
    },
    scene: [],
  });

  g.scale.on('resize', (gameSize) => {
    applyViewSize(gameSize.width, gameSize.height);
    g.events.emit('remake-resize', { w: VIEW_W, h: VIEW_H });
  });

  return g;
}

export function startGame({ parent, onHud, onExit, onDead }) {
  stopGame();
  game = makeGame(parent);
  const data = { onHud, onExit, onDead };
  game.scene.add('Preload', PreloadScene, true, data);
  game.scene.add('Play', PlayScene, false);

  game.events.on('remake-pause', (paused) => {
    const overlay = document.getElementById('pause-overlay');
    if (overlay) overlay.classList.toggle('hidden', !paused);
  });

  window.__kosariRemake = game;
  return game;
}

export function startBoneEditor({ parent, onExit, skinId = 'player' }) {
  stopGame();
  game = makeGame(parent);
  game.scene.add('Preload', PreloadScene, true, {
    onExit,
    next: 'BoneEditor',
    skinId,
  });
  game.scene.add('BoneEditor', BoneEditorScene, false);
  game.scene.add('Play', PlayScene, false);
  window.__kosariRemake = game;
  return game;
}

export function startAnimEditor({ parent, onExit }) {
  stopGame();
  game = makeGame(parent);
  game.scene.add('Preload', PreloadScene, true, {
    onExit,
    next: 'AnimEditor',
  });
  game.scene.add('AnimEditor', AnimEditorScene, false);
  game.scene.add('Play', PlayScene, false);
  window.__kosariRemake = game;
  return game;
}

/** Milestone-1 core: fixed-tick sim on a lane with depth (uncapped render). */
export function startBrawl({ parent, onExit, map }) {
  stopGame();
  game = makeGame(parent, { legacy30: false });
  game.scene.add('Preload', PreloadScene, true, { onExit, next: 'Brawl', map });
  game.scene.add('Brawl', BrawlScene, false);
  window.__kosariRemake = game;
  return game;
}

export function stopGame() {
  if (game) {
    game.destroy(true);
    game = null;
    window.__kosariRemake = null;
  }
  const overlay = document.getElementById('pause-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.getElementById('bone-editor-panel')?.classList.add('hidden');
  document.getElementById('anim-editor-panel')?.classList.add('hidden');
}
