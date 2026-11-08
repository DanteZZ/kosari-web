import { setTraps } from './traps.js';
import { startRace } from './race.js';
import { startTorch } from './torch.js';
import { startEntry, endEntry } from './entry.js';
import { MINIS } from './minis.js';
import { startTd, tdText } from './td.js';
import { startVotes, stopVotes } from './votes.js';
import { startStyle } from './style.js';
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
    // Stream house: you are live the whole map
    if (map.style) startStyle(world);
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

    if (this.waitEntry || (w.entry && w.entry.cfg.early)) {
      const e = w.entry;
      // Headless runs (tests) have no scene to play the intro
      if (e && w.autoEntry) {
        e.used = true;
        e.go = true;
      }
      if (e?.go) {
        const pend = this.waitEntry;
        this.waitEntry = null;
        endEntry(w);
        if (pend) this._begin(pend.a, pend.b);
        else if (w.mini) w.mini.standby = false;
      }
      if (this.waitEntry || w.entry) return;
    }
    if (this.meetMini) {
      const f = w.fighters.find((x) => x.kind === this.meetMini.afterMeet && !x.dead);
      if (f?.waiting) f.metWait = true;
      else if (f?.metWait || (f && w.autoEntry)) {
        // He said his lines: now the contest, with him standing right there
        f.waiting = true;
        MINIS[this.meetMini.type].start(w, this.box || a, { ...this.meetMini, rivalId: f.id });
        this.meetMini = null;
        this.waitMiniLive = f.id;
      }
    }
    if (this.waitMiniLive != null) {
      if (w.mini && !w.mini.done) return;
      const f = w.fighters.find((x) => x.id === this.waitMiniLive);
      if (f) f.waiting = false;
      w.mini = null;
      this.waitMiniLive = null;
    }
    if (this.raft) {
      const r = this.raft;
      r.x += r.speed;
      w.raftBox = { xMin: r.x, xMax: r.x + r.w };
      w.enemyBox = w.raftBox;
      w.playerBounds = { ...w.raftBox };
      this.box = { left: r.x, right: r.x + r.w };
      // Everyone on board drifts with the raft
      for (const f of w.fighters) if (!f.dead && !FIGHTERS[f.kind]?.prop) f.x += r.speed;
      w.raftX = r.x;
      if (r.x + r.w >= r.end) {
        // Landed: whoever is left jumps into the water
        for (const f of w.fighters) if (this.arenaIds.includes(f.id) && !f.dead) {
          f.dead = true;
          f.removed = true;
        }
        this.raft = null;
        w.raftBox = null;
        w.enemyBox = null;
        w.raftX = null;
        this.landNext = true;
        w.events.push({ type: 'raftEnd' });
        this._clear(a);
        return;
      }
      // The banks keep sending people until we land
      if (this.queue.length === 0 && this.wave === a.waves.length - 1 && this._alive(this.waveIds) === 0) {
        this.goal = this.goal || { looped: true };
        this.goal.looped = true;
        this._startWave(Math.max(0, a.waves.length - 2));
      }
    }
    if (this.waitTd) {
      if (w.td?.phase === 'fight') {
        this.waitTd = false;
        this._startWave(0);
      }
      return;
    }
    // Chat called more viewers in
    if (w.swarmReq) {
      const pool = (w.roster || []).filter((k) => !FIGHTERS[k]?.boss);
      const kinds = pool.length ? pool : ['nikita'];
      for (let k = 0; k < w.swarmReq; k += 1) this.queue.push({ at: this.t + 10 + k * 25, kind: kinds[k % kinds.length], from: 'both', k, elite: 1 });
      this.queue.sort((p, q) => p.at - q.at);
      w.swarmReq = 0;
    }
    if (this.waitMini) {
      if (w.mini?.done) {
        const mn = w.mini;
        w.mini = null;
        this.waitMini = false;
        if (mn.skipWaves) {
          this._clear(a);
          return;
        }
        // Guards who raised the alarm fight as part of the arena
        if (mn.guards) for (const id of mn.guards) this.arenaIds.push(id);
        this._startWave(0);
        if (w.miniResult && !w.miniResult.win && !w.miniResult.draw) {
          // Lost the penalties: Дед's mates are angry
          for (let k = 0; k < 2; k += 1) this.queue.push({ at: 60 + k * 40, kind: 'ded', from: 'both', k, elite: 1 });
          this.queue.sort((p, q) => p.at - q.at);
        }
      }
      return;
    }
    if (this.waitTorch) {
      if (w.torch?.done) {
        w.torch = null;
        this.waitTorch = false;
        this._startWave(0);
      }
      return;
    }
    if (a.race) {
      if (w.race?.done) {
        w.race = null;
        this._clear(a);
      }
      return;
    }
    const wv = a.waves[this.wave];
    const g = this.goal;
    if (g) this._goalStep(a, g);
    if (this.state !== 'locked') return;
    const lim = g && g.type === 'survive' && !g.done ? 3 : wv.nextAt ?? 0;
    if (this.queue.length === 0 && this._alive(this.waveIds) <= lim) {
      const nw = a.waves[this.wave + 1];
      if (nw && nw.bossHpBelow && !this._bossBelow(nw.bossHpBelow) && this._alive(this.arenaIds) > 0) return;
      if (nw) this._startWave(this.wave + 1);
      else if (g && !g.done && (g.type === 'survive' || g.type === 'destroy')) {
        // Survive / destroy: the waves keep coming until the goal is met
        g.looped = true;
        this._startWave(Math.max(0, a.waves.length - 2));
        if (g.type === 'survive') {
          // Hold-out arenas: a bigger crowd every time
          const pool = (w.roster || []).filter((k) => !FIGHTERS[k]?.boss);
          const extra = 3 + Math.min(4, Math.floor((g.loops = (g.loops || 0) + 1) / 2));
          for (let k = 0; k < extra; k += 1) this.queue.push({ at: 30 + k * 22, kind: pool[k % pool.length] || 'nikita', from: 'both', k, elite: 1 });
          this.queue.sort((p, q) => p.at - q.at);
        }
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
      const o = w.spawn('objective', w.entryX ?? Math.min(b.right - 300, (p ? p.x : mid) + 380), w.bounds.zMin + 18);
      w.entryX = null;
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
    if (this.raft) {
      const r = this.raft;
      const a = this.arena;
      const k = Math.max(0, Math.min(1, (r.x - a.left) / (r.end - r.w - a.left)));
      return `Сплав по реке: ${Math.round(k * 100)}% · рыбаки прыгают с мостов — не дай столкнуть себя`;
    }
    const tdt = tdText(this.world);
    if (tdt) return tdt;
    const mn = this.world.mini;
    if (mn && !mn.done) return MINIS[mn.type].text(mn);
    const tc = this.world.torch;
    if (tc && !tc.done) return `Найди пробки: ${tc.got}/${tc.need} · свети на Пахома!`;
    const r = this.world.race;
    if (r && !r.done) {
      const p = this.world.players().find((f) => f.driving);
      const k = p ? Math.max(0, Math.min(1, (p.x - r.x0) / (r.x1 - r.x0))) : 0;
      return `Гони к шаурмичной: ${Math.round(k * 100)}% · ${Math.round(r.v * 6)} км/ч`;
    }
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
    w.events.push({ type: 'arenaStart', index: this.idx, boss: !!a.boss, left: b.left, right: b.right, race: !!a.race });
    setTraps(w, a.traps);
    if (a.entry) {
      // Walk up to the car / raft / lift / desk and press J — then the mode begins
      startEntry(w, b, a.entry);
      if (a.entry.early) {
        this._begin(a, b);
        if (w.mini) w.mini.standby = true;
      } else this.waitEntry = { a, b };
      return;
    }
    this._begin(a, b);
  }

  /** The arena's mode: minigame, raft, lift, dark basement, race, goal + waves. */
  _begin(a, b) {
    const w = this.world;
    if (a.mini?.afterMeet) {
      // The contest comes after his meeting scene (bench press with Руки, rap with 1Kla$)
      this.meetMini = a.mini;
    } else if (a.mini) {
      // Minigame first (penalties, bench press, stealth...), then the waves
      MINIS[a.mini.type].start(w, b, a.mini);
      this.waitMini = true;
      return;
    }
    if (a.raft) {
      // River: the arena is a raft drifting downstream; enemies jump on from the banks
      const r = { x: b.left + 60, w: a.raft.w || 1100, speed: a.raft.speed || 3, end: b.right };
      this.raft = r;
      w.raftEndX = r.end;
      w.raftBox = { xMin: r.x, xMax: r.x + r.w };
      w.enemyBox = w.raftBox;
      w.playerBounds = { ...w.raftBox };
      this.box = { left: r.x, right: r.x + r.w };
      for (const p of w.players()) p.x = Math.min(r.x + r.w - 100, Math.max(r.x + 100, p.x));
      w.events.push({ type: 'raftStart', x: r.x, w: r.w });
    }
    if (a.elevator) {
      // Office: the fight is in a lift — a narrow box, a new crowd on every floor
      const mid = (b.left + b.right) / 2;
      const half = a.elevator.w ? a.elevator.w / 2 : 520;
      this.box = { left: mid - half, right: mid + half };
      w.playerBounds = { xMin: mid - half, xMax: mid + half };
      w.enemyBox = { ...w.playerBounds };
      w.elevator = { left: mid - half, right: mid + half, floor: 0, floors: a.waves.length };
      for (const p of w.players()) p.x = Math.min(mid + half - 100, Math.max(mid - half + 100, p.x));
      w.events.push({ type: 'elevatorStart', left: mid - half, right: mid + half });
    }
    if (a.dark) {
      // Basement in the dark: fuses first, then the waves
      startTorch(w, b, a.dark);
      this.waitTorch = true;
      return;
    }
    if (a.race) {
      // Highway race: no waves, drive to the end of the arena
      const p = w.players()[0];
      if (p) startRace(w, p, b.left, b.right - 260);
      return;
    }
    this._setupGoal(a, b);
    if (a.votes) startVotes(w, a.votes);
    if (a.td) {
      // Panelki: set the traps first, the gopniks come after
      startTd(w, a.td);
      this.waitTd = true;
      return;
    }
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
    const lift = this.world.elevator;
    if (lift) {
      lift.floor = i + 1;
      this.world.events.push({ type: 'elevatorFloor', floor: lift.floor * 4 + 3, n: i + 1, total: a.waves.length });
    } else if (!this.goal?.looped) this.world.events.push({ type: 'wave', n: i + 1, total: a.waves.length, banner: wv.banner || null, boss: !!a.boss });
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
    // Very tough debuts (×3 health) don't hit harder than the usual elite
    if (q.elite > 3) scale.hpMul = (1 + k) * q.elite;
    const def = FIGHTERS[q.kind];
    // Village penalties decide how fresh Дед is
    if (def?.boss && w.bossHpMul) {
      scale.hpMul *= w.bossHpMul;
      w.bossHpMul = null;
    }
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
    } else if (q.from === 'drop' || this.raft) {
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
    w.entryX = null;
    setTraps(w, null);
    w.td = null;
    if (w.elevator) {
      w.elevator = null;
      w.enemyBox = null;
      this.landNext = true;
    }
    stopVotes(w);
    this.idx += 1;
    this.wave = -1;
    this.queue = [];
    if (this.landNext) {
      // Off the raft onto the bank / out of the lift onto the floor: straight to the next stretch
      this.landNext = false;
      const nx = this.map.arenas[this.idx];
      if (nx) {
        w.playerBounds = null;
        for (const p of w.players()) {
          p.x = p.px = nx.left - 220;
          p.vx = 0;
        }
        w.events.push({ type: 'landed', x: nx.left - 220 });
      }
    }
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
