import { createApp } from './app.js';
import { SaveLoad, GameState } from './state/GameState.js';

SaveLoad.load();

const app = createApp();

/**
 * Shortcuts: ?brawl=1 jumps straight into a fight (&map=opushka for another map,
 * ?brawl=sandbox for the endless mode, &hero=kama to pick a hero); ?dev=1 shows the editors in the menu.
 */
const params = new URLSearchParams(window.location.search);
if (params.get('hero')) GameState.hero = params.get('hero');
// ?bones or ?bones=<skin id> opens the bone editor directly
if (params.has('bones')) app.go('bones', { skin: params.get('bones') || undefined });
else if (params.has('brawl')) app.go('brawl', { map: params.get('map') || undefined });
else app.go('splash');
