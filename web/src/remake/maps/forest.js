import { arenaAt, lengthFor } from './geom.js';
/**
 * Map "Лес" — chain of locked arenas along the forest road.
 *
 * Format (all plain data, units = px / ticks @ 60 Hz):
 *   length        — road length; start — player spawn
 *   arenas[]      — in order along the road:
 *     trigger     — the camera locks when a player walks past this x
 *     left/right  — locked play area (players can't leave until the arena is clear)
 *     reward      — pickups dropped when the arena is cleared
 *     waves[]     — fought one after another:
 *       banner    — big text when the wave starts (optional)
 *       nextAt    — start the next wave once this many enemies of this wave are left (default 0)
 *       bossHpBelow — also wait until the boss is at or below this HP fraction
 *       spawns[]  — { kind, count, from: 'left'|'right'|'both'|'drop', every: ticks between spawns }
 *   boss arena    — boss: true (boss music, boss HP bar)
 *   next          — map id offered after the results screen
 *   anvils / airships / crates / kosariRain — hazard timings [min, max] ticks (false = off)
 */
export default {
  id: 'forest',
  name: 'Лес',
  chapter: 'Глава 1 · 2011',
  next: 'opushka',
  /** Loading-screen recap (narrator's voice) and tip. */
  loading: {
    title: 'Лес',
    art: 'borsch',
    text: [
      'Лес за районом всегда был тихим местом. Ровно до тех пор, пока кто-то не пустил слух, что там раздают косари.',
      'Никиты потянулись туда стаями, Буйные — по одному, но злее. А в самой чаще, говорят, сидит Влад Борщ: лица под маской не видно, зато бомбы он кидает исправно.',
      'Наш герой знал лишь одно: тот, кто вернёт Борщу его же бомбу, уйдёт из леса богаче.',
    ],
    tip: 'Влада Борща не берут ни кулаки, ни пули. Встань у бомбы на пути и ударь — она полетит обратно.',
  },
  length: lengthFor(5),
  start: { x: 260, z: 80 },
  /** Each next arena: enemies +10% HP, +5% damage. */
  scaling: 0.1,
  arenas: [
    {
      id: 'a1',
      ...arenaAt(0),
      reward: [{ kind: 'heal', amount: 40 }],
      waves: [
        { spawns: [{ kind: 'nikita', count: 3, from: 'right', every: 40 }] },
        { spawns: [{ kind: 'nikita', count: 4, from: 'both', every: 30 }] },
      ],
    },
    {
      id: 'a2',
      ...arenaAt(1),
      reward: [{ kind: 'heal', amount: 50 }],
      waves: [
        { nextAt: 1, spawns: [{ kind: 'nikita', count: 4, from: 'both', every: 24 }] },
        { banner: 'Сверху!', spawns: [{ kind: 'nikita', count: 3, from: 'drop', every: 30 }] },
        { banner: 'Шустрые!', spawns: [{ kind: 'runner', count: 3, from: 'both', every: 40 }, { kind: 'buiniy', count: 1, from: 'right' }, { kind: 'nikita', count: 2, from: 'left', every: 36 }] },
      ],
    },
    {
      id: 'a3',
      ...arenaAt(2),
      reward: [{ kind: 'heal', amount: 60 }],
      waves: [
        { nextAt: 2, spawns: [{ kind: 'nikita', count: 6, from: 'both', every: 18 }] },
        { nextAt: 1, banner: 'Бутылки!', spawns: [{ kind: 'thrower', count: 2, from: 'right', every: 50 }, { kind: 'nikita', count: 3, from: 'drop', every: 40 }, { kind: 'runner', count: 2, from: 'left', every: 60 }] },
        { banner: 'Толпа!', spawns: [{ kind: 'nikita', count: 8, from: 'both', every: 14 }, { kind: 'blocker', count: 1, from: 'right' }, { kind: 'buiniy', count: 1, from: 'left' }] },
      ],
    },
    {
      id: 'a4',
      ...arenaAt(3),
      reward: [{ kind: 'heal', amount: 80 }],
      waves: [
        { nextAt: 2, spawns: [{ kind: 'blocker', count: 2, from: 'both', every: 40 }, { kind: 'thrower', count: 2, from: 'both', every: 60 }, { kind: 'buiniy', count: 2, from: 'both', every: 40 }, { kind: 'nikita', count: 4, from: 'both', every: 20 }] },
        { banner: 'Последняя волна перед боссом', spawns: [{ kind: 'runner', count: 5, from: 'both', every: 20 }, { kind: 'nikita', count: 6, from: 'drop', every: 16 }, { kind: 'buiniy', count: 2, from: 'both', every: 60 }] },
      ],
    },
    {
      id: 'boss',
      boss: true,
      ...arenaAt(4),
      waves: [
        { banner: 'Влад Борщ', nextAt: 1, spawns: [{ kind: 'borsch', count: 1, from: 'right' }] },
      ],
    },
  ],
};
