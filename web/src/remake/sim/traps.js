/**
 * Environment traps of a locked arena (map arena `traps: [...]`). They hit
 * everyone — players and enemies alike — so luring the crowd into them pays.
 *
 *   { type: 'traffic', every: [min, max] }  a car crosses the road along a lane
 *                                           (red lane warning first; jump over it)
 *   { type: 'drop', tex, every: [min, max] } something falls off a balcony near a
 *                                           player (red landing mark)
 */

const CAR = {
  kind: 'car',
  tex: 'car_lada',
  speed: 24,
  gravity: 0,
  life: 600,
  dmg: 24,
  hitstun: 0,
  kb: 16,
  knockdown: true,
  pierce: true,
  hitsAll: true,
  halfW: 175,
  halfZ: 18,
  hitH: 110,
  muzzle: { x: 0, y: 0 },
};

const dropSpec = (tex) => ({
  kind: 'drop',
  tex,
  speed: 0,
  gravity: 0.55,
  life: 400,
  dmg: 14,
  hitstun: 20,
  kb: 4,
  knockdown: true,
  hitsAll: true,
  marker: true,
  muzzle: { x: 0, y: 0 },
});

/** River: a log floating down at the raft (jump over it). */
const LOG = { ...CAR, kind: 'log', tex: 'river_log', speed: 9, dmg: 14, kb: 10, halfW: 100, halfZ: 16, hitH: 60 };

const WARN_T = 70;

export function setTraps(world, list) {
  world.traps = list ? list.map((t) => ({ ...t, cd: world.rng.int(t.every[0], t.every[1]) })) : null;
  world.trapQueue = [];
}

export function stepTraps(world) {
  const traps = world.traps;
  if (!traps || world.race) return;
  const ps = world.players();
  if (!ps.length) return;
  const pb = world.playerBounds || world.bounds;
  const b = world.bounds;
  for (const t of traps) {
    if (--t.cd > 0) continue;
    t.cd = world.rng.int(t.every[0], t.every[1]);
    const p = ps[world.rng.int(0, ps.length - 1)];
    if (t.type === 'logs') {
      const z = world.rng.chance(0.6) ? p.z : world.rng.range(b.zMin + 20, b.zMax - 20);
      const half = (world.viewW || 1920) / 2;
      const x = p.x + half + 200;
      world.trapQueue.push({ t: WARN_T, fire: () => world._spawnProj({ id: -1, team: 'hazard', x, z, y: 0, facing: -1, dmgMul: 1 }, LOG, { x, z, y: 0 }) });
      world.events.push({ type: 'laneWarn', z, dir: -1, t: WARN_T, what: 'БРЕВНО' });
    } else if (t.type === 'traffic') {
      // Aim at a player's lane most of the time
      const z = world.rng.chance(0.7) ? p.z : world.rng.range(b.zMin + 20, b.zMax - 20);
      const dir = world.rng.chance(0.5) ? 1 : -1;
      const half = (world.viewW || 1920) / 2;
      const x = dir > 0 ? Math.min(pb.xMin, p.x - half) - 260 : Math.max(pb.xMax, p.x + half) + 260;
      world.trapQueue.push({ t: WARN_T, fire: () => world._spawnProj({ id: -1, team: 'hazard', x, z, y: 0, facing: dir, dmgMul: 1 }, CAR, { x, z, y: 0 }) });
      world.events.push({ type: 'laneWarn', z, dir, t: WARN_T });
    } else if (t.type === 'drop') {
      const x = Math.min(pb.xMax - 40, Math.max(pb.xMin + 40, p.x + world.rng.range(-220, 220)));
      const z = Math.min(b.zMax - 10, Math.max(b.zMin + 10, p.z + world.rng.range(-30, 30)));
      const pr = world._spawnProj({ id: -1, team: 'hazard', x, z, y: 0, facing: 1, dmgMul: 1 }, dropSpec(t.tex || 'brick'), { x, z, y: 620 });
      pr.tx = x;
      pr.tz = z;
    }
  }
  if (world.trapQueue.length) {
    for (const q of world.trapQueue) if (--q.t <= 0) q.fire();
    world.trapQueue = world.trapQueue.filter((q) => q.t > 0);
  }
}
