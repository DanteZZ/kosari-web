import { clear } from './ui/dom.js';
import { renderSplash } from './ui/Splash.js';
import { renderMenu, stopMenuMusic } from './ui/Menu.js';
import { renderShop } from './ui/Shop.js';
import { renderDanger } from './ui/Danger.js';
import { renderHighscores } from './ui/Highscores.js';
import { startGame, startBoneEditor, startAnimEditor, startBrawl, stopGame } from './game/createGame.js';

export function createApp() {
  const uiRoot = document.getElementById('ui-root');
  const gameShell = document.getElementById('game-shell');
  const gameStage = document.getElementById('game-stage');

  let cleanup = null;
  let pendingScore = null;

  const setGameVisible = (visible) => {
    gameShell.classList.toggle('hidden', !visible);
    gameShell.setAttribute('aria-hidden', visible ? 'false' : 'true');
    uiRoot.classList.toggle('hidden', visible);
  };

  const updateHud = () => {};

  const go = (screen, opts = {}) => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    clear(uiRoot);
    stopGame();
    setGameVisible(false);

    if (screen === 'splash') {
      cleanup = renderSplash(uiRoot, { onDone: () => go('menu') }) || null;
      return;
    }
    if (screen === 'menu') {
      pendingScore = null;
      cleanup = renderMenu(uiRoot, { go }) || null;
      return;
    }
    if (screen === 'shop') {
      renderShop(uiRoot, { go });
      return;
    }
    if (screen === 'danger') {
      stopMenuMusic();
      cleanup = renderDanger(uiRoot, { go }) || null;
      return;
    }
    if (screen === 'highscores') {
      stopMenuMusic();
      renderHighscores(uiRoot, { go, submitScore: pendingScore });
      pendingScore = null;
      return;
    }
    if (screen === 'play') {
      stopMenuMusic();
      setGameVisible(true);
      startGame({
        parent: gameStage,
        onHud: updateHud,
        onExit: () => go('menu'),
        onDead: (score) => {
          pendingScore = score;
          go('highscores');
        },
      });
      return;
    }
    if (screen === 'brawl') {
      stopMenuMusic();
      setGameVisible(true);
      startBrawl({ parent: gameStage, onExit: () => go('menu'), map: opts.map });
      return;
    }
    if (screen === 'bones' || screen === 'bones-nikita') {
      stopMenuMusic();
      setGameVisible(true);
      startBoneEditor({
        parent: gameStage,
        onExit: () => go('menu'),
        skinId: screen === 'bones-nikita' ? 'nikita' : 'player',
      });
      return;
    }
    if (screen === 'anims') {
      stopMenuMusic();
      setGameVisible(true);
      startAnimEditor({
        parent: gameStage,
        onExit: () => go('menu'),
      });
    }
  };

  return { go };
}
