/**
 * Projectiles of the meme-era bosses: the original boss throws (sim/hazards.js)
 * re-skinned per boss (`tex` picks the art, `kind` keeps the original behaviour
 * and sounds), plus things that rain down between phases and the brawlers'
 * ground shockwave.
 */
import { BOMB, POT, PAN, FORK } from './hazards.js';

const lob = (tex, extra = {}) => ({ ...POT, tex, ...extra });
const skim = (tex, extra = {}) => ({ ...PAN, tex, ...extra });
const bomb = (tex, extra = {}) => ({ ...BOMB, tex, ...extra });
const rain = (tex, extra = {}) => ({ ...FORK, tex, ...extra });

/** Per boss: light / heavy throw and what falls between phases. */
export const ERA_THROWS = {
  ded: { light: lob('football', { bossDmg: 1, arcSpeed: 8 }), heavy: skim('football', { bossDmg: 1, speed: 8 }) },
  pahom: { light: lob('jar'), heavy: skim('brick'), rain: rain('jar') },
  papich: { light: bomb('donation_bomb') },
  ponasenkov: { light: lob('book'), heavy: skim('book', { speed: 7.5 }), rain: rain('book') },
  reka: { light: lob('stone'), heavy: skim('stone', { speed: 7 }), rain: rain('stone') },
  zubarev: { light: bomb('money_pack', { explode: { ...BOMB.explode, dmg: 16 } }) },
  gitelman: { light: lob('coin'), heavy: skim('coin', { speed: 8 }), rain: rain('coin') },
  klas: { light: lob('music_note', { arcSpeed: 8 }), heavy: skim('money_pack', { speed: 8.5 }), rain: rain('music_note') },
};

/** Brawler bosses' ground slam: a shockwave sliding along the lane. */
export const SHOCKWAVE = {
  kind: 'wave', tex: 'shockwave', speed: 9, gravity: 0, life: 70,
  dmg: 14, hitstun: 0, kb: 8, knockdown: true, pierce: true,
  muzzle: { x: 70, y: 14 },
};

