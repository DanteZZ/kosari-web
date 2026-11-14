import { arenaAt, lengthFor, joinBefore } from './geom.js';

/** The highway race replaces the second arena: a long stretch of road. */
const RACE_LEN = 16000;
const RACE = { left: arenaAt(1).left, right: arenaAt(1).left + RACE_LEN, trigger: arenaAt(1).left + 40 };
const SHIFT = RACE.right - arenaAt(1).right;
const shifted = (i) => {
  const a = arenaAt(i);
  return { left: a.left + SHIFT, right: a.right + SHIFT, trigger: a.trigger + SHIFT };
};
/**
 * Map "Опушка" — second map: from the forest edge out onto the highway, ending
 * at the roadside shawarma kiosk where Повар lives (3 phases + fork rain).
 * Anvils and the airship from the original game are active the whole way.
 * Format: see forest.js.
 */
export default {
  id: 'opushka',
  name: 'Опушка',
  chapter: 'Глава 1 · 2011',
  next: 'village',
  /** Forest → highway → shawarma kiosk (brawl/world/ThemeWorld.js). */
  world: [{ theme: 'forest', to: joinBefore(1) }, { theme: 'highway', to: joinBefore(3) + SHIFT }, { theme: 'shawarma' }],
  length: lengthFor(4) + SHIFT,
  start: { x: 260, z: 80 },
  scaling: 0.1,
  loading: {
    title: 'Опушка',
    art: 'povar',
    text: [
      'Борщ остался в лесу, а слухи пошли дальше: за опушкой, у самого шоссе, стоит шаурмичная, и заведует ею Повар.',
      'Повар не любит гостей. Кастрюли у него летают по дуге, сковородки — над самой землёй, а когда дела идут плохо, он уходит, и с неба начинают падать вилки.',
      'Над опушкой то и дело проплывает дирижабль. Что он сбрасывает — лучше не проверять головой. А до шаурмичной — по трассе, в старых «Жигулях», мимо фур и Никит на мопедах.',
    ],
    tip: 'В гонке: W/S — полоса, D — газ, A — тормоз, J — врезать мопедщику. Повара ранит только его собственная посуда. Отбей кастрюлю или сковородку ударом, а в дождь из вилок следи за красными метками.',
  },
  /** Original hazards on this map: [min, max] ticks between drops / flights. */
  anvils: [520, 820],
  airships: [1500, 2200],
  arenas: [
    {
      id: 'o1',
      ...arenaAt(0),
      reward: [{ kind: 'heal', amount: 50 }],
      waves: [
        { nextAt: 1, spawns: [{ kind: 'nikita', count: 4, from: 'both', every: 26 }, { kind: 'runner', count: 2, from: 'right', every: 50 }] },
        { banner: 'Буйные!', spawns: [{ kind: 'buiniy', count: 3, from: 'both', every: 50 }, { kind: 'nikita', count: 3, from: 'drop', every: 30 }] },
      ],
    },
    {
      // Гонка по трассе: в «Жигули» и к шаурмичной
      id: 'race',
      race: true,
      entry: {
        art: 'car_lada',
        h: 175,
        at: 700,
        prompt: 'J — сесть в «Жигули»',
        intro: [
          ['hero', 'Ключи в зажигании. Хозяина нет.'],
          ['hero', 'До шаурмичной по трассе — с ветерком.'],
        ],
      },
      ...RACE,
      reward: [{ kind: 'heal', amount: 60 }],
      waves: [{ spawns: [] }],
    },
    {
      id: 'o3',
      ...shifted(2),
      // On the roadside: cars fly past — throw the crowd under them
      traps: [{ type: 'traffic', every: [240, 400] }],
      reward: [{ kind: 'heal', amount: 80 }],
      waves: [
        { nextAt: 2, spawns: [{ kind: 'runner', count: 4, from: 'both', every: 24 }, { kind: 'blocker', count: 2, from: 'both', every: 50 }] },
        { banner: 'Перед Поваром', spawns: [{ kind: 'nikita', count: 5, from: 'drop', every: 18 }, { kind: 'thrower', count: 2, from: 'right', every: 60 }, { kind: 'buiniy', count: 2, from: 'left', every: 60 }] },
      ],
    },
    {
      id: 'boss',
      boss: true,
      ...shifted(3),
      waves: [{ banner: 'Повар', spawns: [{ kind: 'povar', count: 1, from: 'right' }] }],
    },
  ],
};
