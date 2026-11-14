import { Session } from './Session.js';
import { capture, diff, patch } from './sync.js';

/**
 * Online play inside the fight (BrawlScene), host-authoritative:
 *
 *   host  — runs the sim for everybody: guests' buttons arrive through the
 *           sessions service and drive their own player slots; every other
 *           frame the world (diffed against the last one), the events of the
 *           frame, the cutscene's screen state and a few effects go out.
 *   guest — does not step the sim: patches its world copy from the host,
 *           replays the events (sounds, hits, cards), mirrors the cutscene
 *           and sends its buttons.
 */
const SEND_EVERY = 2;
const KEYFRAME_MS = 3000;

/** Guests stand next to the host at the start of a map. */
const SPREAD = [[0, 0], [-90, -36], [-160, 30], [-60, 48]];

export class NetHost {
  constructor(scene) {
    this.scene = scene;
    this.queues = new Map();
    this.cur = new Map();
    this.prev = null;
    this.frame = 0;
    this.events = [];
    this.fx = [];
    this.keyAt = 0;
    this.off = Session.on((m) => this.onMsg(m));
  }

  /** Every occupied seat but the host's gets a player fighter on its slot. */
  spawnGuests(start, zMax, applyHero) {
    const w = this.scene.world;
    const room = Session.room;
    if (!room) return;
    this.scene.player.netName = room.seats[0]?.name || 'Хост';
    room.seats.forEach((s, i) => {
      if (!s || i === 0) return;
      const [dx, dz] = SPREAD[i];
      const f = w.spawn('player', Math.max(60, start.x + dx), Math.max(10, Math.min(zMax - 10, start.z + dz)), { slot: i });
      applyHero(f, s.hero);
      f.netName = s.name;
    });
  }

  onMsg(m) {
    if (m.t === 'in') {
      const q = this.queues.get(m.seat) || [];
      q.push(m.bits);
      // A guest who lags must not replay seconds of old presses
      if (q.length > 8) q.splice(0, q.length - 8);
      this.queues.set(m.seat, q);
    } else if (m.t === 'gone') {
      const f = this.scene.world.fighters.find((x) => x.kind === 'player' && x.slot === m.seat);
      if (f) {
        f.dead = true;
        f.removed = true;
        this.scene.world.events.push({ type: 'puff', x: f.x, z: f.z });
        this.scene.banner(`${f.netName || 'Игрок'} вышел`, '', 1400);
      }
    } else if (m.t === 'sync') {
      this.prev = null;
    } else if (m.t === 'room' && m.room.state !== 'game') {
      // Somebody's room message while the map runs: nothing to do
    }
  }

  /** Before each sim tick: one queued button state per guest (a tap is never lost). */
  beforeTick() {
    for (const [seat, q] of this.queues) {
      if (q.length) this.cur.set(seat, q.shift());
      this.scene.world.setInput(seat, this.cur.get(seat) ?? 0);
    }
  }

  /** The frame's events, before the scene drains them. */
  collect(evs) {
    for (const e of evs) this.events.push(capture(e));
  }

  /** A visual effect the guests cannot get from the events (cutscene titles...). */
  effect(name, args) {
    this.fx.push([name, capture(args)]);
  }

  ctl(msg) {
    Session.send({ t: 'ctl', ...msg });
  }

  /** End of the frame: every other frame, the world goes out. */
  send() {
    this.frame += 1;
    if (this.frame % SEND_EVERY) return;
    const sc = this.scene;
    const state = capture({ w: sc.world, d: sc.director, c: sc.cine.netState(), g: [...sc.gestures].map(([id, g]) => [id, g.name, Math.round(sc.time.now - g.t0), Math.round(g.dx || 0)]), lock: sc.lock || null });
    const now = performance.now();
    // The map travels with every frame: a guest still loading never ends up on the wrong one
    const msg = { t: 'snap', m: sc.map?.id || null, e: this.events, fx: this.fx };
    if (!this.prev || now - this.keyAt > KEYFRAME_MS) {
      msg.k = state;
      this.keyAt = now;
    } else {
      msg.d = diff(this.prev, state) || null;
    }
    this.prev = state;
    this.events = [];
    this.fx = [];
    Session.send(msg);
  }

  destroy() {
    this.off();
  }
}

export class NetGuest {
  constructor(scene) {
    this.scene = scene;
    this.pending = [];
    this.ctls = [];
    this.got = false;
    this.lastBits = -1;
    this.lastSend = 0;
    this.appliedAt = 0;
    this.interval = 33;
    this.box = null;
    this.off = Session.on((m) => {
      if (m.t === 'snap') this.pending.push(m);
      else if (m.t === 'ctl') this.ctls.push(m);
      else if (m.t === 'closed' || (m.t === 'room' && m.room.state !== 'game')) this.ctls.push({ k: 'leave' });
    });
    // Ask for a full picture right away
    Session.send({ t: 'sync' });
  }

  /** This guest's buttons → the host (on change, and now and then anyway). */
  sendInput(bits) {
    const now = performance.now();
    if (bits === this.lastBits && now - this.lastSend < 250) return false;
    this.lastBits = bits;
    this.lastSend = now;
    Session.send({ t: 'in', bits });
    return true;
  }

  /** Control messages (next map, ending, the session over) for the scene. */
  takeCtls() {
    return this.ctls.splice(0);
  }

  /**
   * Apply what arrived since the last frame. Returns the events to drain and
   * the effects to replay; positions are set up for interpolation (px → x).
   */
  apply() {
    const sc = this.scene;
    const out = { events: [], fx: [] };
    if (!this.pending.length) return out;
    // Where everybody is drawn now: the new snapshot interpolates from here
    const was = new Map();
    for (const list of [sc.world.fighters, sc.world.projectiles, sc.world.pickups]) {
      for (const o of list || []) was.set(`${list === sc.world.fighters ? 'f' : list === sc.world.projectiles ? 'p' : 'k'}${o.id}`, [o.x, o.y, o.z]);
    }
    for (const m of this.pending.splice(0)) {
      if (m.m && m.m !== sc.map?.id) {
        // The host is on another map already: follow him there
        this.pending.length = 0;
        if (!this.ctls.some((c) => c.k === 'goto')) this.ctls.push({ k: 'goto', map: m.m });
        return out;
      }
      if (m.k) {
        this.keyframe(m.k);
        this.got = true;
      } else if (m.d && this.got) {
        this.box = patch(this.box, m.d);
      }
      if (this.got) {
        out.events.push(...(m.e || []));
        out.fx.push(...(m.fx || []));
      }
    }
    if (!this.got) return out;
    const now = performance.now();
    this.interval = Math.max(16, Math.min(120, (now - (this.appliedAt || now - 33)) * 0.5 + this.interval * 0.5));
    this.appliedAt = now;
    const tag = { f: sc.world.fighters, p: sc.world.projectiles, k: sc.world.pickups };
    for (const [t, list] of Object.entries(tag)) {
      for (const o of list || []) {
        const prev = was.get(`${t}${o.id}`);
        o.px = prev ? prev[0] : o.x;
        o.py = prev ? prev[1] : o.y;
        o.pz = prev ? prev[2] : o.z;
      }
    }
    sc.lock = this.box.lock || null;
    sc.cine.applyNet(this.box.c);
    sc.gestures.clear();
    for (const [id, name, age, dx] of this.box.g || []) sc.gestures.set(id, { name, t0: sc.time.now - age, dx });
    const me = sc.world.fighters.find((f) => f.kind === 'player' && f.slot === Session.seat);
    if (me) sc.player = me;
    return out;
  }

  /** How far between the last two snapshots we are (0..1). */
  alpha() {
    return Math.min(1, (performance.now() - this.appliedAt) / this.interval);
  }

  /** A full picture: replace the world copy (views get rebuilt). */
  keyframe(state) {
    const sc = this.scene;
    const w = sc.world;
    const old = new Map(w.fighters.map((f) => [f.id, f]));
    for (const [k, v] of Object.entries(state.w)) {
      if (k === 'fighters') continue;
      w[k] = JSON.parse(JSON.stringify(v));
    }
    // Keep the objects of fighters we already show (their views stay)
    w.fighters = state.w.fighters.map((nf) => {
      const f = old.get(nf.id);
      if (f && f.kind === nf.kind) {
        for (const k of Object.keys(f)) if (!(k in nf)) delete f[k];
        return Object.assign(f, JSON.parse(JSON.stringify(nf)));
      }
      return JSON.parse(JSON.stringify(nf));
    });
    for (const [k, v] of Object.entries(state.d || {})) sc.director[k] = JSON.parse(JSON.stringify(v));
    // Later diffs patch this box in place: w / d are the live objects
    this.box = { w, d: sc.director, c: state.c, g: state.g, lock: state.lock };
    // First picture: the views built for the local placeholder world go
    if (!this.got) {
      for (const v of sc.views.values()) v.destroy();
      sc.views.clear();
    }
  }

  destroy() {
    this.off();
  }
}
