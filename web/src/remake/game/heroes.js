/**
 * Playable heroes. Until their own part sheets are drawn, the new heroes wear
 * an existing rig (skin) with a clothes tint — swap `skin` for their own parts later.
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
    skin: 'nikita',
    tint: 0x6f7f9a,
    scale: 0.94,
    hp: 0.85,
    speed: 1.18,
    dmg: 0.95,
  },
  pistoletov: {
    id: 'pistoletov',
    label: 'Александр Пистолетов',
    blurb: 'Стартует с пистолетом, бьёт сильнее.',
    skin: 'buiniy',
    tint: 0x9a3a3a,
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
    skin: 'buiniy',
    tint: 0x3f3f3f,
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
