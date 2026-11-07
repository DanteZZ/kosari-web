import forest from './forest.js';
import opushka from './opushka.js';
import { ERA_MAPS } from './eras.js';

/** All playable maps by id, in story order. Add new maps here. */
export const MAPS = {
  [forest.id]: forest,
  [opushka.id]: opushka,
  ...Object.fromEntries(ERA_MAPS.map((m) => [m.id, m])),
};

export const DEFAULT_MAP = forest.id;
