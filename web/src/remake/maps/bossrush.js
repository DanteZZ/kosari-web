/**
 * «Боссы»: every boss in a row, each in his own location. Built from the story
 * maps: the same road and scenery, but only the boss arena — the player starts
 * right before it. Finishing one goes to the next (map.next).
 */
import forest from './forest.js';
import opushka from './opushka.js';
import { dacha, museum, sigmaGym, streamHouse, concert } from './eras.js';

const ORDER = [forest, opushka, dacha, museum, sigmaGym, streamHouse, concert];

export const BOSS_RUSH = ORDER.map((m, i) => {
  const arena = m.arenas.find((a) => a.boss) || m.arenas[m.arenas.length - 1];
  // Away from the join pillar; the fight starts right away
  const startX = arena.left + 320;
  const n = i + 1;
  return {
    ...m,
    id: `bossrush_${n}`,
    baseId: m.id,
    hidden: true,
    name: `Боссы · ${n}/${ORDER.length}`,
    chapter: `Режим «Боссы» · ${m.name}`,
    next: n < ORDER.length ? `bossrush_${n + 1}` : null,
    start: { x: startX, z: 80 },
    debuts: [],
    // No trash waves, no crates: just the boss and his own tricks
    crates: false,
    kosariRain: false,
    arenas: [{ ...arena, trigger: startX, reward: [] }],
    loading: {
      ...m.loading,
      title: `Боссы · ${n}/${ORDER.length}`,
      text: [`${m.name}. ${(m.loading?.text || [])[0] || ''}`, 'Режим «Боссы»: только бой с боссом, без волн. Победил — сразу следующий.'],
    },
  };
});
