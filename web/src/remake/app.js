import { clear } from './ui/dom.js';
import { renderSplash } from './ui/Splash.js';
import { renderMenu, stopMenuMusic } from './ui/Menu.js';
import { renderLobby } from './ui/Lobby.js';
import { startBoneEditor, startAnimEditor, startBrawl, stopGame } from './game/createGame.js';

export function createApp() {
  const uiRoot = document.getElementById('ui-root');
  const gameShell = document.getElementById('game-shell');
  const gameStage = document.getElementById('game-stage');

  let cleanup = null;

  const setGameVisible = (visible) => {
    gameShell.classList.toggle('hidden', !visible);
    gameShell.setAttribute('aria-hidden', visible ? 'false' : 'true');
    uiRoot.classList.toggle('hidden', visible);
  };

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
      cleanup = renderMenu(uiRoot, { go }) || null;
      return;
    }
    if (screen === 'online') {
      // Sessions with friends (ui/Lobby.js): the menu music keeps playing
      cleanup = renderLobby(uiRoot, { go, join: opts.join }) || null;
      return;
    }
    if (screen === 'brawl') {
      stopMenuMusic();
      setGameVisible(true);
      // Online games end in the lobby, not the menu
      startBrawl({ parent: gameStage, onExit: () => go(opts.net ? 'online' : 'menu'), map: opts.map, arena: opts.arena, theatre: opts.theatre, net: opts.net });
      return;
    }
    if (screen === 'bones' || screen === 'bones-nikita') {
      stopMenuMusic();
      setGameVisible(true);
      startBoneEditor({
        parent: gameStage,
        onExit: () => go('menu'),
        skinId: opts.skin || (screen === 'bones-nikita' ? 'nikita' : 'player'),
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
