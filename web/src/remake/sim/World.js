import {
  GRAVITY,
  MAX_FALL,
  HURT_HALF_W,
  BODY_RADIUS,
  INPUT_BUFFER,
  CHAIN_WINDOW,
} from './constants.js';
import { BTN, ACTION_BTNS, axisX, axisZ } from './input.js';
import { MOVES, moveTotal } from './moves.js';
import { FIGHTERS } from './fighters.js';
import { createRng } from './rng.js';
import { thinkAll } from './ai.js';

/** States where a fighter is on the ground and free to act. */
const FREE = new Set(['idle', 'walk']);
/** States that cannot be hit. */
const UNHITTABLE = new Set(['down', 'getup', 'dead']);

/**
 * Beat'em up simulation: fighters on a lane with depth.
 *   x — along the road, z — depth (0 = far edge, zMax = near edge), y — height above ground.
 * No Phaser here: the view reads `fighters` and drains `events` each frame.
 * Everything is plain data so a co-op host can snapshot and send it later.
 */
export class World {
  constructor({ seed = 1, bounds = {} } = {}) {
    this.tick = 0;
    this.rng = createRng(seed);
    this.fighters = [];
    this.nextId = 1;
    /** Global freeze ticks on impact (hit-stop). */
    this.hitstop = 0;
    this.bounds = { xMin: 0, xMax: 7200, zMin: 0, zMax: 190, ...bounds };
    /** Inputs per player slot for the next tick. */
    this.inputs = new Map();
    /** Fire-and-forget notifications for sound/FX: the view drains this. */
    this.events = [];
    this.kills = 0;
  }

  spawn(kind, x, z, opts = {}) {
    const def = FIGHTERS[kind];
    if (!def) throw new Error(`Unknown fighter kind: ${kind}`);
    const f = {
      id: this.nextId++,
      kind,
      team: def.team,
      slot: opts.slot ?? null,
      x, z, y: 0,
      px: x, pz: z, py: 0,
      vx: 0, vz: 0, vy: 0,
      facing: opts.facing ?? 1,
      faceX: null,
      hp: def.hp,
      maxHp: def.hp,
      state: 'idle',
      st: 0,
      timer: 0,
      move: null,
      mt: 0,
      hitIds: [],
      connected: false,
      chain: null,
      airAttackUsed: false,
      flip: false,
      cmd: 0,
      prevCmd: 0,
      buf: { btn: 0, t: 0 },
      iframes: 0,
      armorAcc: 0,
      juggle: 0,
      dead: false,
      removed: false,
      removeT: 0,
      combo: 0,
      comboT: 0,
      /** Bumped whenever a new one-shot animation should start (view watches it). */
      animSeq: 0,
      anim: null,
      ai: def.ai ? { mode: 'approach', target: null, cd: this.rng.int(20, 60), timer: 0, offX: 0, offZ: 0 } : null,
    };
    if (f.ai) this._rollOffsets(f);
    this.fighters.push(f);
    return f;
  }

  setInput(slot, bits) {
    this.inputs.set(slot, bits | 0);
  }

  players() {
    return this.fighters.filter((f) => f.team === 'player' && !f.dead);
  }

  enemiesAlive() {
    let n = 0;
    for (const f of this.fighters) if (f.team === 'enemy' && !f.dead) n += 1;
    return n;
  }

  step() {
    this.tick += 1;
    const frozen = this.hitstop > 0;

    for (const f of this.fighters) {
      if (f.slot != null) f.cmd = this.inputs.get(f.slot) ?? 0;
    }
    if (!frozen) thinkAll(this);
    for (const f of this.fighters) this._latchInput(f, frozen);

    if (frozen) {
      this.hitstop -= 1;
      return;
    }

    for (const f of this.fighters) {
      f.px = f.x;
      f.pz = f.z;
      f.py = f.y;
      this._update(f);
    }
    this._resolveAttacks();
    this._separate();

    for (const f of this.fighters) {
      this._clamp(f);
      if (f.comboT > 0 && --f.comboT === 0) f.combo = 0;
    }

    if (this.fighters.some((f) => f.removed)) {
      this.fighters = this.fighters.filter((f) => !f.removed);
    }
  }

  // ------------------------------------------------------------------ input

  _latchInput(f, frozen) {
    const pressed = f.cmd & ~f.prevCmd;
    for (const b of ACTION_BTNS) {
      if (pressed & b) f.buf = { btn: b, t: INPUT_BUFFER };
    }
    f.prevCmd = f.cmd;
    if (!frozen && f.buf.t > 0) {
      f.buf.t -= 1;
      if (f.buf.t === 0) f.buf.btn = 0;
    }
  }

  _consume(f) {
    f.buf = { btn: 0, t: 0 };
  }

  // ------------------------------------------------------------------ states

  _setState(f, state, timer = 0) {
    f.state = state;
    f.st = 0;
    f.timer = timer;
    if (state !== 'attack') f.move = null;
  }

  _update(f) {
    const def = FIGHTERS[f.kind];
    if (f.iframes > 0) f.iframes -= 1;
    if (f.chain && --f.chain.t <= 0) f.chain = null;
    f.st += 1;

    switch (f.state) {
      case 'idle':
      case 'walk':
        this._ground(f, def);
        break;
      case 'jump':
        this._air(f, def);
        break;
      case 'dash':
        this._dash(f, def);
        break;
      case 'attack':
        this._attack(f, def);
        break;
      case 'hitstun':
        f.x += f.vx;
        f.vx *= 0.8;
        if (--f.timer <= 0) this._setState(f, 'idle');
        break;
      case 'airhit':
        this._airhit(f);
        break;
      case 'down':
        f.x += f.vx;
        f.vx *= 0.75;
        if (--f.timer <= 0) {
          this._setState(f, 'getup', 16);
          f.iframes = 22;
        }
        break;
      case 'getup':
        if (--f.timer <= 0) {
          f.juggle = 0;
          f.armorAcc = 0;
          this._setState(f, 'idle');
        }
        break;
      case 'dead':
        f.x += f.vx;
        f.vx *= 0.8;
        // Players stay on the field (revive / game-over is decided by the mode)
        if (f.team !== 'player' && --f.removeT <= 0) f.removed = true;
        break;
      default:
        this._setState(f, 'idle');
    }
  }

  _faceFromInput(f, ax) {
    if (f.faceX != null) {
      const d = Math.sign(f.faceX - f.x);
      if (d) f.facing = d;
    } else if (ax) {
      f.facing = ax;
    }
  }

  _ground(f, def) {
    const ax = axisX(f.cmd);
    const az = axisZ(f.cmd);
    if (this._tryAct(f, def, ax, az)) return;

    const diag = ax && az ? 0.88 : 1;
    f.vx = ax * def.speedX * diag;
    f.vz = az * def.speedZ * diag;
    f.x += f.vx;
    f.z += f.vz;
    this._faceFromInput(f, ax);
    const moving = ax !== 0 || az !== 0;
    if (moving && f.state !== 'walk') f.state = 'walk';
    else if (!moving && f.state !== 'idle') f.state = 'idle';
  }

  /** Buffered action from a free ground state. Returns true if one started. */
  _tryAct(f, def, ax, az) {
    const b = f.buf.btn;
    if (!b) return false;

    if (b === BTN.LIGHT || b === BTN.HEAVY) {
      const key = b === BTN.LIGHT ? 'light' : 'heavy';
      let id = f.chain ? MOVES[f.chain.from]?.next?.[key] : null;
      if (!id) id = def.moves?.[key];
      if (!id) return false;
      if (ax) f.facing = ax;
      this._consume(f);
      this._startMove(f, id);
      return true;
    }
    if (b === BTN.DASH && def.dashTicks) {
      this._consume(f);
      if (ax) f.facing = ax;
      const alongZ = !ax && az;
      this._setState(f, 'dash', def.dashTicks);
      f.vx = alongZ ? 0 : f.facing * def.dashSpeed;
      f.vz = alongZ ? az * def.dashSpeed * 0.62 : az * def.speedZ;
      f.iframes = Math.max(f.iframes, def.dashIframes || 0);
      this.events.push({ type: 'dash', id: f.id, x: f.x, z: f.z });
      return true;
    }
    if (b === BTN.JUMP && def.jumpV) {
      this._consume(f);
      if (ax) f.facing = ax;
      this._setState(f, 'jump');
      f.vy = def.jumpV;
      f.vx = ax * def.speedX * 1.1;
      f.vz = az * def.speedZ;
      f.flip = ax !== 0;
      f.airAttackUsed = false;
      this.events.push({ type: 'jump', id: f.id });
      return true;
    }
    return false;
  }

  _startMove(f, id) {
    const m = MOVES[id];
    f.state = 'attack';
    f.st = 0;
    f.move = id;
    f.mt = 0;
    f.hitIds = [];
    f.connected = false;
    f.chain = null;
    if (!m.air) {
      f.vx = 0;
      f.vz = 0;
    }
    f.animSeq += 1;
    f.anim = { type: 'move', id, total: moveTotal(m) };
    this.events.push({ type: 'swing', id: f.id, move: id, sfx: m.sfx });
  }

  _gravity(f) {
    f.y += f.vy;
    f.vy = Math.max(-MAX_FALL, f.vy - GRAVITY);
  }

  _air(f, def) {
    const ax = axisX(f.cmd);
    const az = axisZ(f.cmd);
    // Light air control: steer towards held direction
    f.vx += (ax * def.speedX * 1.1 - f.vx) * 0.12;
    f.vz += (az * def.speedZ - f.vz) * 0.12;
    f.x += f.vx;
    f.z += f.vz;
    if (ax && !f.flip) f.facing = ax;

    const b = f.buf.btn;
    if ((b === BTN.LIGHT || b === BTN.HEAVY) && !f.airAttackUsed && def.moves?.air) {
      this._consume(f);
      f.airAttackUsed = true;
      f.flip = false;
      this._startMove(f, def.moves.air);
      return;
    }

    this._gravity(f);
    if (f.y <= 0 && f.vy < 0) this._land(f);
  }

  _land(f) {
    f.y = 0;
    f.vy = 0;
    f.flip = false;
    this._setState(f, 'idle');
    this.events.push({ type: 'land', id: f.id, x: f.x, z: f.z });
  }

  _dash(f, def) {
    const k = f.timer / def.dashTicks;
    f.x += f.vx * (0.35 + 0.65 * k);
    f.z += f.vz * (0.35 + 0.65 * k);
    const b = f.buf.btn;
    if (b === BTN.LIGHT || b === BTN.HEAVY) {
      if (def.moves?.dash) {
        this._consume(f);
        this._startMove(f, def.moves.dash);
        return;
      }
    }
    if (b === BTN.JUMP && def.jumpV) {
      this._consume(f);
      this._setState(f, 'jump');
      f.vy = def.jumpV;
      f.vx = f.facing * def.speedX * 1.6;
      f.flip = true;
      f.airAttackUsed = false;
      this.events.push({ type: 'jump', id: f.id });
      return;
    }
    if (--f.timer <= 0) this._setState(f, 'idle');
  }

  _attack(f, def) {
    const m = MOVES[f.move];
    f.mt += 1;
    const swing = m.startup + m.active;

    if (m.air) {
      f.x += f.vx;
      f.z += f.vz;
      this._gravity(f);
      if (f.y <= 0 && f.vy < 0) {
        this._land(f);
        return;
      }
    } else if (f.mt <= swing) {
      // Lunge forward through the swing, easing out
      const k = 1 - (f.mt - 1) / swing;
      f.x += f.facing * m.lunge * (0.4 + 0.6 * k);
    }

    // Cancel recovery into the next combo step — on hit only
    if (f.mt > swing && f.connected && m.next) {
      const b = f.buf.btn;
      const key = b === BTN.LIGHT ? 'light' : b === BTN.HEAVY ? 'heavy' : null;
      const nextId = key && m.next[key];
      if (nextId) {
        const ax = axisX(f.cmd);
        if (ax && f.faceX == null) f.facing = ax;
        this._consume(f);
        this._startMove(f, nextId);
        return;
      }
    }

    if (f.mt >= moveTotal(m)) {
      const from = f.move;
      if (f.y > 0) {
        this._setState(f, 'jump');
        f.airAttackUsed = true;
      } else {
        this._setState(f, 'idle');
      }
      f.chain = { from, t: CHAIN_WINDOW };
    }
  }

  _airhit(f) {
    f.x += f.vx;
    f.vx *= 0.985;
    this._gravity(f);
    if (f.y <= 0 && f.vy < 0) {
      f.y = 0;
      f.vy = 0;
      this.events.push({ type: 'thud', id: f.id, x: f.x, z: f.z });
      if (f.dead) {
        this._setState(f, 'dead');
        f.removeT = 70;
      } else {
        this._setState(f, 'down', 34);
        f.iframes = 60;
      }
    }
  }

  // ------------------------------------------------------------------ combat

  _resolveAttacks() {
    for (const att of this.fighters) {
      if (att.state !== 'attack') continue;
      const m = MOVES[att.move];
      if (att.mt <= m.startup || att.mt > m.startup + m.active) continue;

      for (const tgt of this.fighters) {
        if (tgt === att || tgt.team === att.team) continue;
        if (UNHITTABLE.has(tgt.state) || tgt.iframes > 0 || tgt.dead) continue;
        if (att.hitIds.includes(tgt.id)) continue;
        if (Math.abs(tgt.z - att.z) > m.depth) continue;
        if (Math.abs(tgt.y - att.y) > 110) continue;

        const rel = tgt.x - att.x;
        if (m.sweep) {
          if (Math.abs(rel) - HURT_HALF_W > m.reach[1]) continue;
        } else {
          const front = rel * att.facing;
          if (front + HURT_HALF_W < m.reach[0] || front - HURT_HALF_W > m.reach[1]) continue;
        }
        this._applyHit(att, tgt, m);
      }
    }
  }

  _applyHit(att, tgt, m) {
    att.hitIds.push(tgt.id);
    att.connected = true;
    const dir = Math.sign(tgt.x - att.x) || att.facing;
    const def = FIGHTERS[tgt.kind];

    tgt.hp = Math.max(0, tgt.hp - m.dmg);
    this.hitstop = Math.max(this.hitstop, m.hitstop);

    let reaction = 'flinch';
    const airborne = tgt.y > 0 || tgt.state === 'airhit';

    if (tgt.hp <= 0) {
      tgt.dead = true;
      tgt.facing = -dir;
      this._setState(tgt, 'airhit');
      tgt.vy = Math.max(9, m.launch || 0);
      tgt.vx = dir * Math.max(m.kb, 6);
      reaction = 'kill';
      this.kills += tgt.team === 'enemy' ? 1 : 0;
    } else if (def.armor && !airborne && !m.knockdown && !m.launch && tgt.armorAcc + m.dmg < def.armor) {
      // Heavy enemy shrugs it off: no flinch, keeps attacking
      tgt.armorAcc += m.dmg;
      reaction = 'armor';
    } else if (m.launch || airborne) {
      tgt.armorAcc = 0;
      tgt.juggle += 1;
      tgt.facing = -dir;
      this._setState(tgt, 'airhit');
      tgt.vy = m.launch || Math.max(4, 9 - tgt.juggle * 1.2);
      tgt.vx = dir * m.kb * 0.55;
      reaction = 'launch';
    } else if (m.knockdown) {
      tgt.armorAcc = 0;
      tgt.facing = -dir;
      this._setState(tgt, 'airhit');
      tgt.vy = 6.5;
      tgt.vx = dir * m.kb;
      reaction = 'knockdown';
    } else {
      tgt.armorAcc = 0;
      tgt.facing = -dir;
      this._setState(tgt, 'hitstun', m.hitstun);
      tgt.vx = dir * m.kb;
    }

    if (reaction !== 'armor') {
      tgt.animSeq += 1;
      tgt.anim = { type: 'hurt', reaction, dir };
      tgt.chain = null;
      tgt.buf = { btn: 0, t: 0 };
    }

    if (att.team === 'player') {
      att.combo += 1;
      att.comboT = 110;
    }
    if (tgt.team === 'player') {
      tgt.combo = 0;
      tgt.comboT = 0;
    }

    this.events.push({
      type: 'hit',
      attacker: att.id,
      target: tgt.id,
      targetTeam: tgt.team,
      x: tgt.x,
      z: tgt.z,
      y: tgt.y,
      dir,
      heavy: !!m.heavy,
      reaction,
    });
  }

  // ------------------------------------------------------------------ bodies

  _separate() {
    const list = this.fighters;
    const minD = BODY_RADIUS * 2;
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (a.dead || a.y > 40 || a.state === 'down' || a.state === 'airhit') continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (b.dead || b.y > 40 || b.state === 'down' || b.state === 'airhit') continue;
        let dx = b.x - a.x;
        let dz = (b.z - a.z) * 2;
        let d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD) continue;
        if (d2 < 0.0001) {
          dx = a.id < b.id ? 1 : -1;
          dz = 0;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        const push = minD - d;
        const nx = dx / d;
        const nz = dz / d;
        // Players hold their ground; enemies yield
        const wa = a.team === 'player' && b.team !== 'player' ? 0.2 : b.team === 'player' && a.team !== 'player' ? 0.8 : 0.5;
        const wb = 1 - wa;
        a.x -= nx * push * wa;
        b.x += nx * push * wb;
        a.z -= (nz * push * wa) / 2;
        b.z += (nz * push * wb) / 2;
      }
    }
  }

  _clamp(f) {
    const b = this.bounds;
    if (f.x < b.xMin + 30) f.x = b.xMin + 30;
    if (f.x > b.xMax - 30) f.x = b.xMax - 30;
    if (f.z < b.zMin) f.z = b.zMin;
    if (f.z > b.zMax) f.z = b.zMax;
  }

  _rollOffsets(f) {
    f.ai.offX = this.rng.range(-40, 40);
    f.ai.offZ = this.rng.range(-70, 70);
  }
}

export { FREE };
