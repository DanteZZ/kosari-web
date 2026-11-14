import { createApp } from './app.js';
import { SaveLoad, GameState } from './state/GameState.js';
import { startPadNav } from './brawl/gamepad.js';

SaveLoad.load();
// Gamepad drives menus, dialogues and pause too (as key presses)
startPadNav();

const app = createApp();

/**
 * Shortcuts: ?brawl=1 jumps straight into a fight (&map=opushka for another map,
 * ?brawl=sandbox for the endless mode, &hero=kama to pick a hero); ?dev=1 shows the editors in the menu.
 */
const params = new URLSearchParams(window.location.search);
if (params.get('hero')) GameState.hero = params.get('hero');
// ?bones or ?bones=<skin id> opens the bone editor directly
if (params.has('bones')) app.go('bones', { skin: params.get('bones') || undefined });
// ?theatre: every story scene in a row, map by map (story/theatre.js)
else if (params.has('theatre')) app.go('brawl', { map: 'forest', theatre: 0 });
else if (params.has('brawl')) {
  // &arena=N starts at that arena (test ground, see the menu's «Полигон»)
  const arena = params.has('arena') ? Number(params.get('arena')) : undefined;
  app.go('brawl', { map: params.get('map') || undefined, arena });
}
else app.go('splash');
