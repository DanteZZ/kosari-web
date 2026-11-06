import forest from './forest.js';
import opushka from './opushka.js';

/** All playable maps by id. Add new maps here. */
export const MAPS = {
  [forest.id]: forest,
  [opushka.id]: opushka,
};

export const DEFAULT_MAP = forest.id;
