import { FIGHTERS } from './fighters.js';

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
    // Enemy kinds of this map: bosses call their backup from these
    const kinds = new Set();
    for (const a of map.arenas) {
      for (const wv of a.waves) for (const sp of wv.spawns || []) if (!FIGHTERS[sp.kind]?.boss) kinds.add(sp.kind);
    }
    world.roster = kinds.size ? [...kinds] : ['nikita', 'buiniy'];
    /** The locked area actually used (an arena widened to the screen). */
    this.box = null;
    /** Kinds that already had their meeting scene on this map. */
    this.met = new Set();
  }

  /**
   * Arena walls never stand inside the screen: an arena narrower than the
   * visible width is widened around its centre (up to the map's ends), so the
   * walls sit at the screen edges and enemies come in from off-screen.
   */
  _box(a) {
    const vw = this.world.viewW || 0;
    const half = Math.max((a.right - a.left) / 2, vw / 2 - 20);
    const c = (a.left + a.right) / 2;
    let left = c - half;
    let right = c + half;
    if (left < 0) {
      right -= left;
      left = 0;
    }
    if (right > this.map.length) {
      left = Math.max(0, left - (right - this.map.length));
      right = this.map.length;
    }
    return { left, right };
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
      goal: this.goalText(),
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
    const g = this.goal;
    if (g) this._goalStep(a, g);
    if (this.state !== 'locked') return;
    if (this.queue.length === 0 && this._alive(this.waveIds) <= (wv.nextAt ?? 0)) {
      const nw = a.waves[this.wave + 1];
      if (nw && nw.bossHpBelow && !this._bossBelow(nw.bossHpBelow) && this._alive(this.arenaIds) > 0) return;
      if (nw) this._startWave(this.wave + 1);
      else if (g && !g.done && (g.type === 'survive' || g.type === 'destroy')) {
        // Survive / destroy: the waves keep coming until the goal is met
        g.looped = true;
        this._startWave(Math.max(0, a.waves.length - 2));
      } else if (g && !g.done && g.type === 'chase') {
        /* wait for the thief */
      } else if (this._alive(this.arenaIds) === 0) this._clear(a);
    }
  }

  /**
   * Arena goals (map arena `goal`): beyond «beat everyone».
   *   survive { ticks } — hold out; the waves loop, the rest flee at the end
   *   defend  { hp }    — a kiosk in the middle; enemies go for it
   *   chase             — a thief runs off with косари: catch him
   *   destroy { count } — break the cameras while the waves loop
   */
  _setupGoal(a, b) {
    const w = this.world;
    const G = a.goal;
    this.goal = null;
    if (!G) return;
    const g = { ...G, done: false };
    const mid = (b.left + b.right) / 2;
    const p = w.players()[0];
    const zMid = (w.bounds.zMin + w.bounds.zMax) / 2;
    if (g.type === 'survive') g.t = g.ticks || 3600;
    if (g.type === 'defend') {
      const o = w.spawn('objective', Math.min(b.right - 300, (p ? p.x : mid) + 380), w.bounds.zMin + 18);
      if (g.hp) o.hp = o.maxHp = g.hp;
      g.obj = o.id;
    }
    if (g.type === 'chase') {
      const th = w.spawn('thief', (p ? p.x : mid) + 260, zMid, { facing: 1 });
      g.thief = th.id;
      this.arenaIds.push(th.id);
    }
    if (g.type === 'destroy') {
      const n = g.count || 4;
      g.ids = [];
      for (let i = 0; i < n; i += 1) {
        const x = b.left + 260 + ((b.right - b.left - 520) * (i + 0.5)) / n;
        const c = w.spawn('target_cam', x, i % 2 ? w.bounds.zMin + 14 : w.bounds.zMax - 30);
        g.ids.push(c.id);
      }
      g.total = n;
    }
    this.goal = g;
    w.events.push({ type: 'goalStart', goal: g.type, text: this.goalText() });
  }

  _goalStep(a, g) {
    const w = this.world;
    if (g.done) return;
    if (g.type === 'survive') {
      g.t -= 1;
      if (g.t <= 0) {
        g.done = true;
        // Time's up: whoever is left runs away
        for (const f of w.fighters) if (this.arenaIds.includes(f.id) && !f.dead) {
          f.dead = true;
          f.removed = true;
        }
        w.events.push({ type: 'goalDone', goal: g.type });
        this._clear(a);
      }
    } else if (g.type === 'destroy') {
      const left = g.ids.filter((id) => w.fighters.some((f) => f.id === id && !f.dead)).length;
      g.left = left;
      if (left === 0) {
        g.done = true;
        w.events.push({ type: 'goalDone', goal: g.type });
      }
    } else if (g.type === 'chase') {
      const th = w.fighters.find((f) => f.id === g.thief);
      if (!th || th.dead) {
        g.done = true;
        if (th && th.dead && !th.removed) {
          w._spillKosari(th.x, th.z, 15, 60);
          w.events.push({ type: 'thiefCaught', id: th.id, x: th.x, z: th.z });
        }
        w.events.push({ type: 'goalDone', goal: g.type });
      }
    } else if (g.type === 'defend') {
      g.hpK = (() => {
        const o = w.fighters.find((f) => f.id === g.obj);
        return o ? o.hp / o.maxHp : 0;
      })();
    }
  }

  /** One line for the HUD about the current goal. */
  goalText() {
    const g = this.goal;
    if (!g || g.done) return '';
    if (g.type === 'survive') {
      const s = Math.max(0, Math.ceil((g.t ?? 0) / 60));
      return `Продержись: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    if (g.type === 'defend') return `Защити ларёк: ${Math.round((g.hpK ?? 1) * 100)}%`;
    if (g.type === 'chase') return 'Догони вора с косарями!';
    if (g.type === 'destroy') return `Разбей камеры: ${g.total - (g.left ?? g.total)}/${g.total}`;
    return '';
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
    const b = (this.box = this._box(a));
    w.playerBounds = { xMin: b.left, xMax: b.right };
    for (const p of w.players()) {
      p.x = Math.min(b.right - 40, Math.max(b.left + 40, p.x));
    }
    this.arenaIds = [];
    w.events.push({ type: 'arenaStart', index: this.idx, boss: !!a.boss, left: b.left, right: b.right });
    this._setupGoal(a, b);
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
        this.queue.push({ at: 20 + k * every, kind: s.kind, from: s.from || 'right', k, elite: s.elite || 1 });
      }
    }
    this.queue.sort((p, q) => p.at - q.at);
    // Goal arenas loop their waves quietly (no «Волна 2/3» again and again)
    if (!this.goal?.looped) this.world.events.push({ type: 'wave', n: i + 1, total: a.waves.length, banner: wv.banner || null, boss: !!a.boss });
  }

  _spawn(arena, q) {
    const w = this.world;
    const a = this.box || arena;
    const rng = w.rng;
    const zMin = w.bounds.zMin + 8;
    const zMax = w.bounds.zMax - 8;
    let f;
    // Later arenas hit harder and take more punishment
    const k = this.idx * (this.map.scaling ?? 0.12);
    // Elite (a meme enemy's debut): tougher and hits a bit harder
    const scale = { hpMul: (1 + k) * q.elite, dmgMul: (1 + k * 0.5) * (q.elite > 1 ? 1.2 : 1) };
    const def = FIGHTERS[q.kind];
    const meets = (def?.boss || q.elite > 1) && !this.met.has(q.kind);
    if (meets) {
      // Boss / newcomer: already standing in the arena, waits for his scene
      this.met.add(q.kind);
      // Ahead of the player, towards the far end of the arena (players come from the left)
      const p = w.players()[0];
      const px = p ? p.x : (a.left + a.right) / 2;
      const vw = w.viewW || 1280;
      const x = Math.min(a.right - 200, Math.max(px + Math.min(520, vw * 0.32), (a.left + a.right) / 2));
      const side = x >= px ? 1 : -1;
      f = w.spawn(q.kind, x, (zMin + zMax) / 2, { facing: -side, ...scale });
      f.waiting = true;
    } else if (q.from === 'drop') {
      // Drops out of the trees onto the road
      // Within sight of the player (arenas are wider than the screen)
      const pd = w.players()[0];
      const hv = (w.viewW || 1280) / 2 - 140;
      const cx = pd ? pd.x : (a.left + a.right) / 2;
      const x = rng.range(Math.max(a.left + 140, cx - hv), Math.min(a.right - 140, cx + hv));
      f = w.spawn(q.kind, x, rng.range(zMin, zMax), scale);
      f.y = f.py = rng.range(380, 460);
      f.state = 'jump';
      f.vy = 0;
      f.facing = rng.chance(0.5) ? 1 : -1;
    } else {
      const side = q.from === 'both' ? (q.k % 2 ? -1 : 1) : q.from === 'left' ? -1 : 1;
      // Just past the edge of what the camera shows (or the arena wall, whichever is nearer)
      const p = w.players()[0];
      const half = (w.viewW || 1280) / 2;
      const px = p ? p.x : (a.left + a.right) / 2;
      const edgeL = Math.max(a.left, px - half);
      const edgeR = Math.min(a.right, px + half);
      const x = side < 0 ? edgeL - 70 - rng.range(0, 120) : edgeR + 70 + rng.range(0, 120);
      f = w.spawn(q.kind, x, rng.range(zMin, zMax), { facing: -side, ...scale });
    }
    this.waveIds.push(f.id);
    this.arenaIds.push(f.id);
    w.events.push({ type: 'spawn', id: f.id, kind: q.kind, from: q.from, elite: q.elite > 1 });
  }

  _clear(a) {
    const w = this.world;
    w.events.push({ type: 'arenaClear', index: this.idx, boss: !!a.boss });
    const box = this.box || a;
    this.box = null;
    const p = w.players()[0];
    const cx = p ? p.x : (a.left + a.right) / 2;
    (a.reward || []).forEach((r, i) => {
      w.spawnPickup(r.kind, cx + 140 + i * 60, w.bounds.zMax * 0.5, r.amount);
    });
    // The kiosk stays behind, the goal is over
    if (this.goal?.obj) {
      const o = w.fighters.find((f) => f.id === this.goal.obj);
      if (o) {
        o.dead = true;
        o.removed = true;
      }
    }
    this.goal = null;
    this.idx += 1;
    this.wave = -1;
    this.queue = [];
    if (this.idx >= this.map.arenas.length) {
      this.state = 'done';
      w.playerBounds = { xMin: box.left, xMax: this.map.length };
      w.events.push({ type: 'mapComplete' });
      return;
    }
    this.state = 'travel';
    w.playerBounds = { xMin: box.left, xMax: Math.max(this.arena.right, this._box(this.arena).right) };
    w.events.push({ type: 'go' });
  }
}
