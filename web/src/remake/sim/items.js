/**
 * Weapons, shop and loot tables for the brawl core. Money is counted in
 * "косари" (one 1000-rouble note = 1).
 */

/**
 * Guns. `cd` = ticks between shots, `pack` = ammo per purchase / pickup.
 * muzzle = barrel tip relative to the feet when aiming (measured from the bone
 * puppet's aim pose, facing right) — projectiles start there.
 * proj: projectile spawned at the muzzle (speed px/tick, life ticks).
 */
export const WEAPONS = {
  1: {
    id: 1, muzzle: { x: 102, y: 208 }, name: 'Desert Eagle', short: 'DE', cd: 15, auto: false, pack: 24, recoil: 2, sfx: 'DE_shoot',
    proj: { kind: 'bullet', tex: 'de', speed: 26, life: 46, dmg: 20, hitstun: 18, kb: 4 },
  },
  2: {
    id: 2, muzzle: { x: 172, y: 194 }, name: 'Дробовик', short: 'Дробь', cd: 34, auto: false, pack: 12, recoil: 7, sfx: 'shotgun_shoot',
    pellets: 5, spreadZ: 30,
    proj: { kind: 'pellet', tex: 'pellet', speed: 24, life: 15, dmg: 10, hitstun: 22, kb: 7 },
  },
  3: {
    id: 3, muzzle: { x: 188, y: 194 }, name: 'АК-47', short: 'АК', cd: 6, auto: true, pack: 60, recoil: 1.2, sfx: 'DE_shoot',
    proj: { kind: 'bullet', tex: 'ak', speed: 30, life: 40, dmg: 8, hitstun: 12, kb: 2 },
  },
  4: {
    id: 4, muzzle: { x: 177, y: 210 }, name: 'РПГ-7', short: 'РПГ', cd: 52, auto: false, pack: 3, recoil: 9, sfx: 'rpg_shoot',
    proj: { kind: 'rocket', tex: 'rpg', speed: 13, life: 70, dmg: 0, explode: { radius: 150, depth: 62, dmg: 40, launch: 10, kb: 9 } },
  },
};

/** HUD / selection order: 0 = fists. */
export const WEAPON_SLOTS = [0, 1, 2, 3, 4];

/** In-run shop (B). Buying a gun you own = another ammo pack. Prices in косари. */
export const SHOP = [
  { id: 'de', weapon: 1, title: 'Desert Eagle', price: 5 },
  { id: 'shotgun', weapon: 2, title: 'Дробовик', price: 12 },
  { id: 'ak', weapon: 3, title: 'АК-47', price: 20 },
  { id: 'rpg', weapon: 4, title: 'РПГ-7', price: 35 },
  { id: 'med', heal: 80, title: 'Аптечка', price: 6 },
];

/** Косари knocked out of an enemy when it goes down: [min, max]. */
export const KILL_LOOT = {
  nikita: [1, 2],
  buiniy: [2, 4],
  runner: [1, 2],
  thrower: [1, 3],
  blocker: [2, 4],
  boss1: [18, 18],
  borsch: [25, 25],
  povar: [25, 25],
};

/** Weighted gun drop from crates. */
export const CRATE_GUNS = [
  [1, 50],
  [2, 25],
  [3, 20],
  [4, 5],
];
