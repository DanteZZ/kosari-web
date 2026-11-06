/**
 * Milestone-1 test director: keeps a crowd coming from both sides so the core
 * can be felt. Replaced by data-driven arenas + waves in milestone 3.
 */
export class SandboxDirector {
  constructor(world, { start = 4, max = 12 } = {}) {
    this.world = world;
    this.target = start;
    this.max = max;
    this.cd = 30;
    world.crateEvery = [900, 1500];
  }

  step() {
    const w = this.world;
    this.target = Math.min(this.max, 4 + Math.floor(w.kills / 6));
    if (--this.cd > 0) return;
    this.cd = 24;
    const players = w.players();
    if (!players.length) return;
    if (w.enemiesAlive() >= this.target) return;

    const p = players[w.rng.int(0, players.length - 1)];
    const side = w.rng.chance(0.5) ? -1 : 1;
    let x = p.x + side * w.rng.range(620, 780);
    if (x < w.bounds.xMin + 40 || x > w.bounds.xMax - 40) x = p.x - side * w.rng.range(620, 780);
    const z = w.rng.range(w.bounds.zMin + 10, w.bounds.zMax - 10);
    const kind = w.kills >= 4 && w.rng.chance(0.28) ? 'buiniy' : 'nikita';
    w.spawn(kind, x, z, { facing: -side });
  }
}
