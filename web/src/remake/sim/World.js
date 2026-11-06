import {
  GRAVITY,
  MAX_FALL,
  HURT_HALF_W,
  BODY_RADIUS,
  INPUT_BUFFER,
  CHAIN_WINDOW,
  FLIP_TICKS,
  SLOWMO_TICKS,
  METER_MAX,
  GRAB_TICKS,
  GRAB_CONTACT,
  STAGGER_LIMIT,
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
/** States an enemy can be grabbed from. */
const GRABBABLE = new Set(['idle', 'walk', 'hitstun']);

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
    /** Perfect-dodge slow motion: enemies tick every other tick while > 0. */
    this.slowmo = 0;
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
      flipT: 0,
      /** Air jump still available. */
      djump: false,
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
      /** Rage meter (players). */
      meter: 0,
      /** Recent damage taken (players) — too much at once forces a knockdown. */
      stagger: 0,
      /** Grab links: id of the enemy I hold / of the player holding me. */
      holding: null,
      heldBy: null,
      grabT: 0,
      grabContact: 0,
      kneeCount: 0,
      /** Flying body (thrown or knocked hard) — bowls over its own team. */
      thrown: false,
      bumped: [],
      /** Player who sent this body flying (combo/meter credit). */
      creditId: null,
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

    const slow = this.slowmo > 0;
    if (slow) this.slowmo -= 1;
    const skipEnemies = slow && this.tick % 2 === 1;

    for (const f of this.fighters) {
      f.px = f.x;
      f.pz = f.z;
      f.py = f.y;
      if (skipEnemies && f.team !== 'player') continue;
      this._update(f);
    }
    this._bodyCollisions();
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
    const prevBuf = f.buf;
    for (const b of ACTION_BTNS) {
      if (pressed & b) f.buf = { btn: b, t: INPUT_BUFFER };
    }
    // LIGHT + HEAVY together (same tick, or within 3 ticks) = special
    const lh = BTN.LIGHT | BTN.HEAVY;
    if (pressed & lh) {
      const both = (f.cmd & lh) === lh;
      const late =
        ((pressed & BTN.LIGHT) && prevBuf.btn === BTN.HEAVY && prevBuf.t >= INPUT_BUFFER - 3) ||
        ((pressed & BTN.HEAVY) && prevBuf.btn === BTN.LIGHT && prevBuf.t >= INPUT_BUFFER - 3);
      if (both || late) f.buf = { btn: BTN.SPECIAL, t: INPUT_BUFFER };
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
    if (f.stagger > 0) f.stagger = Math.max(0, f.stagger - 0.3);
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
        // Burst out of a beating with the rage special
        if (f.buf.btn === BTN.SPECIAL && def.moves?.special && f.meter >= METER_MAX) {
          this._consume(f);
          this._startSpecial(f);
          break;
        }
        f.x += f.vx;
        f.vx *= 0.8;
        if (--f.timer <= 0) this._setState(f, 'idle');
        break;
      case 'grab':
        this._grab(f);
        break;
      case 'grabbed':
        this._grabbed(f);
        break;
      case 'airhit':
        this._airhit(f);
        break;
      case 'down':
        f.x += f.vx;
        f.vx *= 0.75;
        if (--f.timer <= 0) {
          this._setState(f, 'getup', 16);
          f.iframes = f.team === 'player' ? 44 : 22;
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

    // Walk into a stunned / idle enemy -> grab
    if (def.canGrab && ax) {
      const e = this._grabTarget(f, ax);
      if (e) {
        f.grabContact += 1;
        if (f.grabContact >= GRAB_CONTACT) {
          this._startGrab(f, e, ax);
          return;
        }
      } else {
        f.grabContact = 0;
      }
    } else {
      f.grabContact = 0;
    }

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
    if (b === BTN.SPECIAL) {
      this._consume(f);
      if (!def.moves?.special) return false;
      if (f.meter < METER_MAX) {
        this.events.push({ type: 'nometer', id: f.id });
        return false;
      }
      if (ax) f.facing = ax;
      this._startSpecial(f);
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
      f.flip = false;
      f.djump = !!def.jumpV2;
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
    const spinning = f.flip && f.flipT < FLIP_TICKS;
    if (f.flip) f.flipT += 1;
    if (ax && !spinning) f.facing = ax;

    const b = f.buf.btn;
    if (b === BTN.JUMP && f.djump) {
      // Double jump = somersault (facing locks for the spin)
      this._consume(f);
      if (ax) f.facing = ax;
      f.djump = false;
      f.vy = def.jumpV2;
      if (ax) f.vx = ax * def.speedX * 1.15;
      f.flip = true;
      f.flipT = 0;
      this.events.push({ type: 'jump2', id: f.id });
      return;
    }
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
    f.flipT = 0;
    f.djump = false;
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
      f.flip = false;
      f.djump = !!def.jumpV2;
      f.airAttackUsed = false;
      this.events.push({ type: 'jump', id: f.id });
      return;
    }
    if (--f.timer <= 0) this._setState(f, 'idle');
  }

  _attack(f, def) {
    const m = MOVES[f.move];
    // Rage special cancels any normal attack (panic button)
    if (!m.special && f.buf.btn === BTN.SPECIAL && def.moves?.special && f.meter >= METER_MAX) {
      this._consume(f);
      this._startSpecial(f);
      return;
    }
    f.mt += 1;
    const swing = m.startup + m.active;

    if (m.throw && f.mt === m.startup) this._throw(f, m);
    if (m.special && f.mt === m.startup) {
      this.events.push({ type: 'rage', id: f.id, x: f.x, z: f.z });
    }

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
      if (f.holding && this._byId(f.holding)?.heldBy === f.id) {
        this._setState(f, 'grab');
        this._grab(f); // act on a buffered press this same tick
        return;
      }
      f.holding = null;
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
      f.thrown = false;
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
      if (m.throw) continue;
      if (att.mt <= m.startup || att.mt > m.startup + m.active) continue;

      for (const tgt of this.fighters) {
        if (tgt === att || tgt.team === att.team) continue;
        if (UNHITTABLE.has(tgt.state) || tgt.dead) continue;
        if (att.hitIds.includes(tgt.id)) continue;
        // Knees only land on the enemy you hold; held enemies are shielded from others
        if (m.grabOnly && tgt.heldBy !== att.id) continue;
        if (!m.grabOnly && tgt.state === 'grabbed') continue;
        if (Math.abs(tgt.y - att.y) > 110) continue;

        const rel = tgt.x - att.x;
        const front = rel * att.facing;
        const dz = Math.abs(tgt.z - att.z);
        const inReach = (slack) =>
          dz <= m.depth + slack * 0.5 &&
          (m.sweep
            ? Math.abs(rel) - HURT_HALF_W <= m.reach[1] + slack
            : front + HURT_HALF_W >= m.reach[0] && front - HURT_HALF_W <= m.reach[1] + slack);

        if (tgt.iframes > 0) {
          // Dashed through an enemy swing at the last moment -> perfect dodge
          if (tgt.state === 'dash' && tgt.team === 'player' && att.team !== 'player' && inReach(40)) {
            att.hitIds.push(tgt.id);
            this._perfectDodge(tgt, att);
          }
          continue;
        }
        if (!inReach(0)) continue;
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
    if (att.team === 'player') {
      if (!m.special) att.meter = Math.min(METER_MAX, att.meter + m.dmg * 0.9);
      tgt.creditId = att.id;
    }
    if (tgt.team === 'player') {
      tgt.meter = Math.min(METER_MAX, tgt.meter + m.dmg * 0.6);
      tgt.stagger += m.dmg;
    }
    // Getting hit makes you drop whoever you were holding
    if (tgt.holding) this._releaseHold(this._byId(tgt.holding));
    const heldByAtt = tgt.state === 'grabbed' && tgt.heldBy === att.id;
    const forceDown = tgt.team === 'player' && tgt.stagger >= STAGGER_LIMIT && !m.knockdown && !m.launch;
    if (forceDown) tgt.stagger = 0;

    if (heldByAtt && tgt.hp > 0 && !m.knockdown) {
      // Knee to a held enemy: stays in the grab
      reaction = 'held';
    } else if (tgt.hp <= 0) {
      if (heldByAtt) this._releaseHold(tgt);
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
    } else if (m.knockdown || forceDown) {
      if (heldByAtt) this._releaseHold(tgt);
      tgt.armorAcc = 0;
      tgt.facing = -dir;
      this._setState(tgt, 'airhit');
      tgt.vy = 6.5;
      tgt.vx = dir * Math.max(m.kb, forceDown ? 6 : 0);
      tgt.bumped = [];
      reaction = 'knockdown';
    } else {
      tgt.armorAcc = 0;
      tgt.facing = -dir;
      this._setState(tgt, 'hitstun', m.hitstun);
      tgt.vx = dir * m.kb;
    }

    if (reaction !== 'armor' && reaction !== 'held') {
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
      dmg: m.dmg,
      heavy: !!m.heavy,
      reaction,
    });
    if (reaction === 'held') tgt.animSeq += 1;
  }

  // ------------------------------------------------------------------ grab

  _byId(id) {
    if (id == null) return null;
    for (const f of this.fighters) if (f.id === id) return f;
    return null;
  }

  _grabTarget(f, ax) {
    for (const e of this.fighters) {
      if (e.team === f.team || e.dead || e.heldBy || e.y > 0) continue;
      if (!GRABBABLE.has(e.state)) continue;
      if (Math.abs(e.z - f.z) > 18) continue;
      const front = (e.x - f.x) * ax;
      if (front > 0 && front <= 70) return e;
    }
    return null;
  }

  _startGrab(f, e, ax) {
    f.facing = ax;
    this._setState(f, 'grab');
    f.vx = 0;
    f.vz = 0;
    f.holding = e.id;
    f.grabT = GRAB_TICKS;
    f.grabContact = 0;
    f.kneeCount = 0;
    e.heldBy = f.id;
    this._setState(e, 'grabbed');
    e.facing = -ax;
    e.vx = 0;
    e.animSeq += 1;
    e.anim = { type: 'hurt', reaction: 'held', dir: ax };
    this.events.push({ type: 'grab', id: f.id, target: e.id, x: e.x, z: e.z });
  }

  _grab(f) {
    const e = this._byId(f.holding);
    if (!e || e.dead || e.heldBy !== f.id) {
      f.holding = null;
      this._setState(f, 'idle');
      return;
    }
    const ax = axisX(f.cmd);
    const b = f.buf.btn;
    if (b === BTN.LIGHT || b === BTN.HEAVY) {
      this._consume(f);
      // Heavy, or back + strike -> throw (turning around for a back throw)
      if (b === BTN.HEAVY || ax === -f.facing) {
        if (ax === -f.facing) f.facing = ax;
        this._startMove(f, 'throw');
      } else {
        const id = f.kneeCount >= 2 ? 'knee_final' : 'knee';
        f.kneeCount += 1;
        this._startMove(f, id);
      }
      return;
    }
    if (--f.grabT <= 0) {
      this._releaseHold(e);
      e.vx = f.facing * 3;
    }
  }

  _grabbed(e) {
    const h = this._byId(e.heldBy);
    if (!h || h.dead || h.holding !== e.id || !(h.state === 'grab' || h.state === 'attack')) {
      e.heldBy = null;
      this._setState(e, 'hitstun', 10);
      return;
    }
    e.x = h.x + h.facing * 52;
    e.z = h.z;
    e.y = 0;
    e.vx = 0;
    e.facing = -h.facing;
  }

  _releaseHold(e) {
    if (!e) return;
    const h = this._byId(e.heldBy);
    if (h && h.holding === e.id) {
      h.holding = null;
      if (h.state === 'grab') this._setState(h, 'idle');
    }
    e.heldBy = null;
    if (e.state === 'grabbed') this._setState(e, 'hitstun', 10);
  }

  _throw(f, m) {
    const e = this._byId(f.holding);
    f.holding = null;
    if (!e || e.heldBy !== f.id) return;
    e.heldBy = null;
    e.hp = Math.max(0, e.hp - m.dmg);
    e.facing = -f.facing;
    this._setState(e, 'airhit');
    e.x = f.x + f.facing * 36;
    e.y = 46;
    e.vy = 8.5;
    e.vx = f.facing * m.kb;
    e.thrown = true;
    e.bumped = [];
    e.creditId = f.id;
    if (e.hp <= 0) {
      e.dead = true;
      this.kills += 1;
    }
    f.meter = Math.min(METER_MAX, f.meter + 8);
    e.animSeq += 1;
    e.anim = { type: 'hurt', reaction: 'launch', dir: f.facing };
    this.hitstop = Math.max(this.hitstop, m.hitstop);
    this.events.push({ type: 'throw', id: f.id, target: e.id, x: e.x, z: e.z, dir: f.facing });
  }

  // ------------------------------------------------------------------ flying bodies

  /** Thrown / hard-knocked bodies bowl over members of their own team. */
  _bodyCollisions() {
    for (const b of this.fighters) {
      if (b.state !== 'airhit' || b.y > 120) continue;
      const speed = Math.abs(b.vx);
      if (!b.thrown && speed < 7) continue;
      for (const t of this.fighters) {
        if (t === b || t.team !== b.team || t.dead || t.iframes > 0) continue;
        if (UNHITTABLE.has(t.state) || t.state === 'airhit' || t.state === 'grabbed') continue;
        if (b.bumped.includes(t.id)) continue;
        if (Math.abs(t.x - b.x) > 46 || Math.abs(t.z - b.z) > 28) continue;
        b.bumped.push(t.id);
        const dmg = b.thrown ? 12 : 6;
        const dir = Math.sign(b.vx) || 1;
        t.hp = Math.max(0, t.hp - dmg);
        t.facing = -dir;
        this._setState(t, 'airhit');
        t.vy = 6;
        t.vx = dir * Math.max(5, speed * 0.65);
        t.bumped = [b.id];
        t.thrown = false;
        t.creditId = b.creditId;
        if (t.hp <= 0) {
          t.dead = true;
          if (t.team === 'enemy') this.kills += 1;
        }
        t.animSeq += 1;
        t.anim = { type: 'hurt', reaction: 'knockdown', dir };
        b.vx *= 0.75;
        this.hitstop = Math.max(this.hitstop, 4);
        const credit = this._byId(b.creditId);
        if (credit) {
          credit.combo += 1;
          credit.comboT = 110;
          credit.meter = Math.min(METER_MAX, credit.meter + dmg * 0.5);
        }
        this.events.push({
          type: 'hit',
          attacker: b.id,
          target: t.id,
          targetTeam: t.team,
          x: t.x,
          z: t.z,
          y: t.y,
          dir,
          dmg,
          heavy: true,
          reaction: t.dead ? 'kill' : 'bump',
        });
      }
    }
  }

  // ------------------------------------------------------------------ specials

  _startSpecial(f) {
    f.meter = 0;
    if (f.holding) this._releaseHold(this._byId(f.holding));
    this._startMove(f, 'rage');
    f.iframes = moveTotal(MOVES.rage) + 6;
  }

  _perfectDodge(p, att) {
    this.slowmo = SLOWMO_TICKS;
    p.meter = Math.min(METER_MAX, p.meter + 25);
    p.iframes = Math.max(p.iframes, 18);
    this.events.push({ type: 'perfect', id: p.id, attacker: att.id, x: p.x, z: p.z });
  }


  // ------------------------------------------------------------------ bodies

  _separate() {
    const list = this.fighters;
    const minD = BODY_RADIUS * 2;
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (a.dead || a.y > 40 || a.state === 'down' || a.state === 'airhit' || a.state === 'grabbed') continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (b.dead || b.y > 40 || b.state === 'down' || b.state === 'airhit' || b.state === 'grabbed') continue;
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
