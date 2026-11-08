import { arenaAt, lengthFor, joinBefore } from './geom.js';
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
  world: [{ theme: 'forest', to: joinBefore(1) }, { theme: 'highway', to: joinBefore(3) }, { theme: 'shawarma' }],
  length: lengthFor(4),
  start: { x: 260, z: 80 },
  scaling: 0.1,
  loading: {
    title: 'Опушка',
    art: 'povar',
    text: [
      'Борщ остался в лесу, а слухи пошли дальше: за опушкой, у самого шоссе, стоит шаурмичная, и заведует ею Повар.',
      'Повар не любит гостей. Кастрюли у него летают по дуге, сковородки — над самой землёй, а когда дела идут плохо, он уходит, и с неба начинают падать вилки.',
      'Над опушкой то и дело проплывает дирижабль. Что он сбрасывает — лучше не проверять головой.',
    ],
    tip: 'Повара ранит только его собственная посуда. Отбей кастрюлю или сковородку ударом, а в дождь из вилок следи за красными метками.',
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
      id: 'o2',
      ...arenaAt(1),
      reward: [{ kind: 'heal', amount: 60 }],
      waves: [
        { nextAt: 2, spawns: [{ kind: 'thrower', count: 3, from: 'both', every: 40 }, { kind: 'blocker', count: 2, from: 'left', every: 60 }] },
        { banner: 'Толпа!', spawns: [{ kind: 'nikita', count: 9, from: 'both', every: 12 }, { kind: 'buiniy', count: 2, from: 'both', every: 70 }] },
      ],
    },
    {
      id: 'o3',
      ...arenaAt(2),
      reward: [{ kind: 'heal', amount: 80 }],
      waves: [
        { nextAt: 2, spawns: [{ kind: 'runner', count: 4, from: 'both', every: 24 }, { kind: 'blocker', count: 2, from: 'both', every: 50 }] },
        { banner: 'Перед Поваром', spawns: [{ kind: 'nikita', count: 5, from: 'drop', every: 18 }, { kind: 'thrower', count: 2, from: 'right', every: 60 }, { kind: 'buiniy', count: 2, from: 'left', every: 60 }] },
      ],
    },
    {
      id: 'boss',
      boss: true,
      ...arenaAt(3),
      waves: [{ banner: 'Повар', spawns: [{ kind: 'povar', count: 1, from: 'right' }] }],
    },
  ],
};
