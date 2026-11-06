import { createApp } from './app.js';
import { SaveLoad } from './state/GameState.js';

SaveLoad.load();

const app = createApp();

/**
 * Shortcuts: ?brawl=1 jumps straight into a fight (&map=opushka for another map,
 * ?brawl=sandbox for the endless mode); ?dev=1 shows the editors in the menu.
 */
const params = new URLSearchParams(window.location.search);
if (params.has('brawl')) app.go('brawl', { map: params.get('map') || undefined });
else app.go('splash');
