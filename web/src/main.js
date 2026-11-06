import { createApp } from './app.js';
import { SaveLoad, GameState } from './state/GameState.js';

// Restore shop unlocks if any
SaveLoad.load();

const app = createApp();

/** Dev shortcuts: ?play=1 skips splash/menu into the arena; ?flip=1 auto-tests somersault. */
const params = new URLSearchParams(window.location.search);
if (params.has('play') || params.has('flip')) {
  GameState.resetRun?.();
  app.go('play');
  if (params.has('flip')) {
    window.__KOSARI_FLIP_TEST = true;
  }
} else {
  app.go('splash');
}
