/**
 * Runs a data-driven map (see maps/forest.js) on top of the World:
 *   travel → (player passes arena.trigger) → locked: waves 1..N → clear → GO → travel → … → boss → done.
 * Pure sim code: deterministic from the world's seeded RNG, emits events for the view.
 */
export class MapDirector {
  constructor(world, map) {
    this.world = world;
    this.map = map;
    this.idx = 0;
    this.state = 'travel';
    this.wave = -1;
    this.t = 0;
    this.queue = [];
    this.waveIds = [];
    this.arenaIds = [];
    world.bounds.xMax = map.length;
    // Loot crates every ~25–40 s unless the map says otherwise
    world.crateEvery = map.crates === false ? null : map.crates || [1500, 2400];
    // Косари drizzle from the sky like in the original
    world.kosariRain = map.kosariRain === false ? null : map.kosariRain || [260, 460];
    world.anvilEvery = map.anvils || null;
    world.airshipEvery = map.airships || null;
    world.playerBounds = { xMin: 0, xMax: map.arenas[0]?.right ?? map.length };
  }

  get arena() {
    return this.map.arenas[this.idx] || null;
  }

  status() {
    const a = this.arena;
    return {
      state: this.state,
      arena: Math.min(this.idx + 1, this.map.arenas.length),
      arenas: this.map.arenas.length,
      wave: this.wave + 1,
      waves: a ? a.waves.length : 0,
      left: this._alive(this.arenaIds) + this.queue.length,
      boss: !!a?.boss,
      nextTrigger: this.state === 'travel' && a ? a.trigger : null,
    };
  }

  step() {
    const w = this.world;
    if (this.state === 'done') return;
    const a = this.arena;
    if (!a) return;

    if (this.state === 'travel') {
      if (w.players().some((p) => p.x >= a.trigger)) this._lock(a);
      return;
    }

    // Locked arena: release queued spawns of the current wave
    this.t += 1;
    while (this.queue.length && this.queue[0].at <= this.t) {
      const q = this.queue.shift();
      this._spawn(a, q);
    }

    const wv = a.waves[this.wave];
    if (this.queue.length === 0 && this._alive(this.waveIds) <= (wv.nextAt ?? 0)) {
      const nw = a.waves[this.wave + 1];
      if (nw && nw.bossHpBelow && !this._bossBelow(nw.bossHpBelow) && this._alive(this.arenaIds) > 0) return;
      if (nw) this._startWave(this.wave + 1);
      else if (this._alive(this.arenaIds) === 0) this._clear(a);
    }
  }

  _bossBelow(k) {
    return this.world.fighters.some((f) => !f.dead && this.arenaIds.includes(f.id) && f.maxHp >= 300 && f.hp / f.maxHp <= k);
  }

  _alive(ids) {
    let n = 0;
    for (const f of this.world.fighters) if (!f.dead && ids.includes(f.id)) n += 1;
    return n;
  }

  _lock(a) {
    const w = this.world;
    this.state = 'locked';
    w.playerBounds = { xMin: a.left, xMax: a.right };
    for (const p of w.players()) {
      p.x = Math.min(a.right - 40, Math.max(a.left + 40, p.x));
    }
    this.arenaIds = [];
    w.events.push({ type: 'arenaStart', index: this.idx, boss: !!a.boss, left: a.left, right: a.right });
    this._startWave(0);
  }

  _startWave(i) {
    const a = this.arena;
    const wv = a.waves[i];
    this.wave = i;
    this.t = 0;
    this.waveIds = [];
    this.queue = [];
    for (const s of wv.spawns) {
      const every = s.every ?? 30;
      for (let k = 0; k < s.count; k += 1) {
        this.queue.push({ at: 20 + k * every, kind: s.kind, from: s.from || 'right', k });
      }
    }
    this.queue.sort((p, q) => p.at - q.at);
    this.world.events.push({ type: 'wave', n: i + 1, total: a.waves.length, banner: wv.banner || null, boss: !!a.boss });
  }

  _spawn(a, q) {
    const w = this.world;
    const rng = w.rng;
    const zMin = w.bounds.zMin + 8;
    const zMax = w.bounds.zMax - 8;
    let f;
    // Later arenas hit harder and take more punishment
    const k = this.idx * (this.map.scaling ?? 0.12);
    const scale = { hpMul: 1 + k, dmgMul: 1 + k * 0.5 };
    if (q.from === 'drop') {
      // Drops out of the trees onto the road
      const x = rng.range(a.left + 140, a.right - 140);
      f = w.spawn(q.kind, x, rng.range(zMin, zMax), scale);
      f.y = f.py = rng.range(380, 460);
      f.state = 'jump';
      f.vy = 0;
      f.facing = rng.chance(0.5) ? 1 : -1;
    } else {
      const side = q.from === 'both' ? (q.k % 2 ? -1 : 1) : q.from === 'left' ? -1 : 1;
      const x = side < 0 ? a.left - 90 - rng.range(0, 160) : a.right + 90 + rng.range(0, 160);
      f = w.spawn(q.kind, x, rng.range(zMin, zMax), { facing: -side, ...scale });
    }
    this.waveIds.push(f.id);
    this.arenaIds.push(f.id);
    w.events.push({ type: 'spawn', id: f.id, kind: q.kind, from: q.from });
  }

  _clear(a) {
    const w = this.world;
    w.events.push({ type: 'arenaClear', index: this.idx, boss: !!a.boss });
    const p = w.players()[0];
    const cx = p ? p.x : (a.left + a.right) / 2;
    (a.reward || []).forEach((r, i) => {
      w.spawnPickup(r.kind, cx + 140 + i * 60, w.bounds.zMax * 0.5, r.amount);
    });
    this.idx += 1;
    this.wave = -1;
    this.queue = [];
    if (this.idx >= this.map.arenas.length) {
      this.state = 'done';
      w.playerBounds = { xMin: a.left, xMax: this.map.length };
      w.events.push({ type: 'mapComplete' });
      return;
    }
    this.state = 'travel';
    w.playerBounds = { xMin: a.left, xMax: this.arena.right };
    w.events.push({ type: 'go' });
  }
}
