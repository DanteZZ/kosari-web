/**
 * Playable heroes. Поцык uses the player rig; the others wear their own cut
 * rigs (enemies/parts.js skins of the same id).
 *
 * Stats are multipliers on the base `player` fighter (sim/fighters.js).
 */
export const HEROES = {
  pocik: {
    id: 'pocik',
    label: 'Поцык',
    blurb: 'Сбалансированный. Ловит косари с 2011 года.',
    skin: null,
    hp: 1,
    speed: 1,
    dmg: 1,
  },
  svidetel: {
    id: 'svidetel',
    label: 'Свидетель из Фрязино',
    blurb: 'Быстрый: появляется там, где его не ждут.',
    skin: 'svidetel',
    tint: null,
    scale: 0.94,
    hp: 0.85,
    speed: 1.18,
    dmg: 0.95,
  },
  pistoletov: {
    id: 'pistoletov',
    label: 'Александр Пистолетов',
    blurb: 'Стартует с пистолетом, бьёт сильнее.',
    skin: 'pistoletov',
    tint: null,
    scale: 1,
    hp: 1,
    speed: 0.95,
    dmg: 1.15,
    /** Starts with the pistol (weapon slot 1) and this much ammo. */
    startWeapon: 1,
    startAmmo: 24,
  },
  kama: {
    id: 'kama',
    label: 'Кама Пуля',
    blurb: 'Танк: много здоровья, тяжёлый удар.',
    skin: 'kama',
    tint: null,
    scale: 1.08,
    hp: 1.3,
    speed: 0.88,
    dmg: 1.2,
  },
};

export const HERO_IDS = Object.keys(HEROES);

export function getHero(id) {
  return HEROES[id] || HEROES.pocik;
}
