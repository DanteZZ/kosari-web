import { stepTraps } from './traps.js';
import { stepRace } from './race.js';
import { stepTorch } from './torch.js';
import { MINIS } from './minis.js';
import { preTd, stepTd } from './td.js';
import { stepVotes, voteHit } from './votes.js';
import { styleHit, stepStyle } from './style.js';
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
import { BTN, ACTION_BTNS, axisX, axisZ, selField } from './input.js';
import { WEAPONS, WEAPON_SLOTS, SHOP, KILL_LOOT, CRATE_GUNS, BUFFS } from './items.js';
import { DIRIG_BOMB, FORK, ANVIL_FLY } from './hazards.js';
import { MOVES, moveTotal } from './moves.js';
import { FIGHTERS } from './fighters.js';
import { createRng } from './rng.js';
import { thinkAll } from './ai.js';

/** States where a fighter is on the ground and free to act. */
const FREE = new Set(['idle', 'walk']);
/** States that cannot be hit. */
const UNHITTABLE = new Set(['down', 'getup', 'dead']);
/** Same side: players and their summoned helpers (team 'ally') never hit each other. */
const allied = (a, b) => a === b || (a === 'player' && b === 'ally') || (a === 'ally' && b === 'player');
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
    /** Locked area for players (arena); enemies only respect `bounds`. */
    this.playerBounds = null;
    /** Items on the road (heal etc.). */
    this.pickups = [];
    this.stats = { maxCombo: 0, damageTaken: 0, kosari: 0, shots: 0 };
    /** Bullets / rockets in flight. */
    this.projectiles = [];
    /** Loot crates dropping from the sky: [min, max] ticks between drops, or null. */
    this.crateEvery = null;
    this.crateT = 0;
    /** Original-game hazards: [min, max] ticks between events, or null = off. */
    this.anvilEvery = null;
    this.anvilT = 0;
    this.airshipEvery = null;
    this.airshipT = 0;
    this.airships = [];
    this.forkRainT = 0;
    this.kosariRain = null;
    this.kosariT = 0;
    /** Fire zones (1Kla$ pyro): { x, z, r, t } — erupt when t hits 0. */
    this.zones = [];
    /** Lights off (Пахом): the view darkens the screen. */
    this.dark = false;
    /** Enemy kinds of the current map (bosses call backup from it). */
    this.roster = ['nikita', 'buiniy'];
    /** Visible width in world px (from the view): arenas are at least this wide. */
    this.viewW = 1280;
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
      hp: Math.round(def.hp * (def.onlyReflected ? 1 : opts.hpMul ?? 1)),
      maxHp: Math.round(def.hp * (def.onlyReflected ? 1 : opts.hpMul ?? 1)),
      /** Outgoing damage multiplier (difficulty scaling). */
      dmgMul: opts.dmgMul ?? 1,
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
      /** Economy + guns (players). weapons: slot id -> ammo. */
      money: 0,
      weapons: {},
      weapon: 0,
      fireCd: 0,
      looted: false,
      /** Multi-phase bosses (Повар). */
      phase: 1,
      retreating: false,
      away: false,
      /** Props (crates): height it fell from. */
      dropH: 0,
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
    // Minigames read the controls themselves
    if (this.mini && !this.mini.done) MINIS[this.mini.type].pre?.(this);
    if (this.td) preTd(this);
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
      if (f.driving) continue;
      this._update(f);
    }
    this._bodyCollisions();
    this._resolveAttacks();
    this._updateProjectiles();
    this._separate();
    this._updatePickups();
    this._updateBuffs();
    this._dropLoot();
    this._crateDropper();
    this._hazards();
    stepTraps(this);
    stepRace(this);
    stepTorch(this);
    if (this.mini && !this.mini.done) MINIS[this.mini.type].step(this);
    stepTd(this);
    stepVotes(this);
    stepStyle(this);

    for (const f of this.fighters) {
      this._clamp(f);
      if (f.comboT > 0 && --f.comboT === 0) f.combo = 0;
    }

    // Summoned helpers leave after a while
    for (const f of this.fighters) {
      if (f.team !== 'ally' || f.dead || f.allyT == null) continue;
      if (--f.allyT <= 0) {
        f.dead = true;
        f.removed = true;
        this.events.push({ type: 'puff', x: f.x, z: f.z });
        this.events.push({ type: 'helperGone', kind: f.kind });
      }
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
    // Weapon select / shop purchase: act on the field changing (edge)
    const sel = selField(f.cmd);
    if (sel && (sel !== selField(f.prevCmd) || (f.cmd & BTN.BUY) !== (f.prevCmd & BTN.BUY))) {
      if (f.cmd & BTN.BUY) this._buy(f, sel - 1);
      else this._selectWeapon(f, sel - 1);
    }
    if (pressed & BTN.WNEXT) this._cycleWeapon(f, 1);
    if (pressed & BTN.WPREV) this._cycleWeapon(f, -1);
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
    if (def.prop) {
      this._prop(f);
      return;
    }
    if (f.iframes > 0) f.iframes -= 1;
    if (f.fireCd > 0) f.fireCd -= 1;
    if (f.chain && --f.chain.t <= 0) f.chain = null;
    if (f.stagger > 0) f.stagger = Math.max(0, f.stagger - 0.3);
    f.st += 1;

    if (f.hoverY != null && (f.state === 'idle' || f.state === 'walk' || f.state === 'attack' || f.state === 'hitstun')) {
      const k = f.hoverY > f.y ? 0.06 : 0.12;
      f.y += (f.hoverY - f.y) * k;
      if (f.hoverY === 0 && f.y < 2) {
        f.y = 0;
        f.hoverY = null;
        this.events.push({ type: 'touchdown', id: f.id, x: f.x, z: f.z });
        // Маэстро comes down with a wave both ways
        const lw = FIGHTERS[f.kind].landWave;
        if (lw) {
          this._spawnProj(f, lw);
          this._spawnProj({ ...f, facing: -f.facing }, lw);
        }
      }
    }
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
      case 'block':
        f.x += f.vx;
        f.vx *= 0.75;
        if (--f.timer <= 0) this._setState(f, 'idle');
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
    // Automatic guns keep firing while LIGHT is held
    if (f.weapon && WEAPONS[f.weapon]?.auto && f.cmd & BTN.LIGHT && f.fireCd <= 0) this._fire(f);
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
    // Backpedalling while facing someone: 60 % speed
    const back = ax && f.faceX != null && Math.sign(f.faceX - f.x) === -ax ? 0.6 : 1;
    // PC club votes can make the crowd sleepy or hyper
    const es = f.team === 'enemy' ? this.enemySpeed || 1 : 1;
    f.vx = ax * def.speedX * (f.speedMul || 1) * diag * back * es;
    f.vz = az * def.speedZ * diag * es;
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

    if (b === BTN.LIGHT && f.weapon) {
      // Gun in hand: LIGHT shoots (waits in the buffer for the cooldown)
      if (f.fireCd > 0) return false;
      this._consume(f);
      this._fire(f);
      return false;
    }
    if (b === BTN.LIGHT || b === BTN.HEAVY) {
      const key = b === BTN.LIGHT ? 'light' : 'heavy';
      let id = f.chain ? MOVES[f.chain.from]?.next?.[key] : null;
      // Heroes carry their own move set (game/heroes.js)
      if (!id) id = (f.moves || def.moves)?.[key];
      if (!id) return false;
      if (f.faceX != null) {
        const d = Math.sign(f.faceX - f.x);
        if (d) f.facing = d;
      } else if (ax) f.facing = ax;
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
      f.vx = ax * def.speedX * (f.speedMul || 1) * 1.1;
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
    f.vy = Math.max(-MAX_FALL, f.vy - GRAVITY * (this.gravMul || 1));
  }

  _air(f, def) {
    const ax = axisX(f.cmd);
    const az = axisZ(f.cmd);
    // Light air control: steer towards held direction
    f.vx += (ax * def.speedX * (f.speedMul || 1) * 1.1 - f.vx) * 0.12;
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
      if (ax) f.vx = ax * def.speedX * (f.speedMul || 1) * 1.15;
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
      f.vx = f.facing * def.speedX * (f.speedMul || 1) * 1.6;
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

    if (m.air && m.leap && f.mt < m.startup) {
      // Crouch before the leap
    } else if (m.air) {
      if (m.leap && f.mt === m.startup) {
        f.vy = m.leap.vy;
        f.vx = f.facing * m.leap.vx;
      }
      f.x += f.vx;
      f.z += f.vz;
      this._gravity(f);
      if (f.y <= 0 && f.vy < 0) {
        if (m.landWave) {
          this._spawnProj(f, m.landWave, { y: 10 });
          this._spawnProj({ ...f, facing: -f.facing }, m.landWave, { y: 10 });
          this.events.push({ type: 'quake', id: f.id, x: f.x, z: f.z });
        }
        this._land(f);
        return;
      }
    } else if (m.lungeActive) {
      // Charge only while the hitbox is live (tackles)
      if (f.mt > m.startup && f.mt <= swing) f.x += f.facing * m.lunge;
    } else if (f.mt <= swing) {
      // Lunge forward through the swing, easing out. A player's swing that
      // hasn't connected yet steps three times further (reaches the enemy)
      const k = 1 - (f.mt - 1) / swing;
      const reach = f.team === 'player' && !f.connected ? PLAYER_LUNGE_MUL : 1;
      f.x += f.facing * m.lunge * (0.4 + 0.6 * k) * reach;
    }
    if (m.multiHit && f.mt > m.startup && (f.mt - m.startup) % m.multiHit === 0) f.hitIds = [];
    if (m.aimWarn && f.mt === 1) this.events.push({ type: 'aimWarn', id: f.id, x: f.x, z: f.z, dir: f.facing, ms: (m.startup / 60) * 1000 });
    if (m.projectile && f.mt === m.startup && m.pellets) {
      for (let i = 0; i < m.pellets; i += 1) {
        const dz = ((i / (m.pellets - 1)) - 0.5) * 34;
        this._spawnProj(f, m.projectile, { dz, speedK: this.rng.range(0.92, 1.05) });
      }
      if (m.shot) this.events.push({ type: 'shot', id: f.id, weapon: m.shot, x: f.x, z: f.z });
    } else if (m.projectile && f.mt === m.startup) {
      this._spawnProj(f, m.projectile);
      if (m.shot) this.events.push({ type: 'shot', id: f.id, weapon: m.shot, x: f.x, z: f.z });
      // Ground waves, bass drops: both ways at once
      if (m.waveBoth) this._spawnProj({ ...f, facing: -f.facing }, m.projectile);
    }
    if (m.pose && f.mt === m.startup) this.events.push({ type: 'pose', id: f.id, x: f.x, z: f.z });

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
      if (m.throw || m.projectile) continue;
      if (att.mt <= m.startup || att.mt > m.startup + m.active) continue;

      for (const tgt of this.fighters) {
        if (tgt === att || allied(tgt.team, att.team)) continue;
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

  /**
   * @param {object} att attacker (credited for combo / meter)
   * @param {object} tgt victim
   * @param {object} m move or projectile hit spec
   * @param {{x:number, facing:number}} [src] where the hit came from (projectiles); skips per-swing tracking
   */
  _applyHit(att, tgt, m, src = null) {
    if (!src) {
      att.hitIds.push(tgt.id);
      att.connected = true;
    }
    const dir = Math.sign(tgt.x - (src ? src.x : att.x)) || (src ? src.facing : att.facing);
    const def = FIGHTERS[tgt.kind];

    if (def.prop) {
      this._hitProp(tgt, m, dir, att, src);
      return;
    }
    if (tgt.retreating || tgt.away) return;
    if (def.onlyReflected) {
      // Original bosses: only their own thrown stuff, knocked back, hurts them
      if (!(src && src.reflected)) {
        if (!src) {
          this.hitstop = Math.max(this.hitstop, 2);
          this.events.push({ type: 'immune', id: tgt.id, x: tgt.x, z: tgt.z, hint: def.hint });
        }
        return;
      }
      tgt.hp = Math.max(0, tgt.hp - (src.bossDmg ?? 1));
      this.hitstop = Math.max(this.hitstop, 10);
      this.events.push({ type: 'hit', attacker: att.id, target: tgt.id, targetTeam: tgt.team, x: tgt.x, z: tgt.z, y: tgt.y, dir, dmg: src.bossDmg ?? 1, heavy: true, reaction: 'boss' });
      if (tgt.hp > 0) {
        this._setState(tgt, 'hitstun', 40);
        tgt.vx = dir * 3;
        tgt.animSeq += 1;
        tgt.anim = { type: 'hurt', reaction: 'flinch', dir };
        this.events.push({ type: 'bossHit', id: tgt.id, hp: tgt.hp, x: tgt.x, z: tgt.z });
        return;
      }
      if (def.phases && tgt.phase < def.phases.length) {
        // Not dead yet: runs off, next phase comes back from the other side
        tgt.retreating = true;
        tgt.iframes = 99999;
        this._setState(tgt, 'idle');
        this.events.push({ type: 'bossPhase', id: tgt.id, phase: tgt.phase, x: tgt.x, z: tgt.z });
        return;
      }
      this._bossDown(tgt, dir);
      return;
    }

    // Meme-era boss rules (sim/fighters.js): who can be hit how
    if (def.boss && !def.onlyReflected) {
      const fromFront = tgt.facing === -dir;
      if (def.frontOnly && !fromFront && !(src && src.reflected)) {
        this.hitstop = Math.max(this.hitstop, 2);
        this.events.push({ type: 'immune', id: tgt.id, x: tgt.x, z: tgt.z, hint: 'Сзади не пробить — только в лицо!' });
        return;
      }
      if (def.parry && fromFront && !src && FREE.has(tgt.state) && !tgt.lecture) {
        // Маэстро парирует: отбрасывает и бьёт в ответ
        this.hitstop = Math.max(this.hitstop, 5);
        att.vx = -att.facing * 9;
        att.x -= att.facing * 18;
        tgt.animSeq += 1;
        tgt.anim = { type: 'block' };
        tgt.counter = 1;
        this.events.push({ type: 'parry', id: tgt.id, x: tgt.x, z: tgt.z });
        this.events.push({ type: 'immune', id: tgt.id, x: tgt.x, z: tgt.z, hint: def.hint });
        return;
      }
      if (def.shield) {
        if (src && src.reflected) {
          // Папич «лагает»: his own donation bomb opens him up
          tgt.vuln = 300;
          m = { ...m, dmg: 30, knockdown: true };
          this.events.push({ type: 'bossCue', id: tgt.id, text: 'ЛАГИ!', sub: 'Бей, пока завис' });
        } else if (!(tgt.vuln > 0)) {
          if (!src) {
            this.hitstop = Math.max(this.hitstop, 2);
            this.events.push({ type: 'immune', id: tgt.id, x: tgt.x, z: tgt.z, hint: def.hint });
          }
          return;
        }
      }
    }

    // Блокер: punches from the front bounce off his guard
    const guarding = def.guard && (FREE.has(tgt.state) || tgt.state === 'block') && tgt.facing === -dir;
    if (guarding && !src && m.clip && m.clip.startsWith('punch') && !m.heavy) {
      this._setState(tgt, 'block', 14);
      tgt.vx = dir * 2.5;
      att.x -= att.facing * 6;
      this.hitstop = Math.max(this.hitstop, 3);
      tgt.animSeq += 1;
      tgt.anim = { type: 'block' };
      this.events.push({ type: 'block', id: tgt.id, x: tgt.x, z: tgt.z, dir });
      return;
    }

    const dmg = Math.max(1, Math.round((m.dmg || 0) * (att.dmgMul || 1) * (this.dmgAll || 1)));
    if (att.team === 'player' && this.votes) voteHit(this);
    if (this.style) styleHit(this, att, tgt, att.move, tgt.hp - dmg <= 0);
    // Hits shove three times harder than the move tables say
    m = { ...m, dmg, kb: (m.kb || 0) * KB_MUL };
    tgt.hp = Math.max(0, tgt.hp - dmg);
    this.hitstop = Math.max(this.hitstop, m.hitstop);

    let reaction = 'flinch';
    const airborne = tgt.y > 0 || tgt.state === 'airhit';
    if (att.team === 'player') {
      if (!m.special) att.meter = Math.min(METER_MAX, att.meter + m.dmg * 0.9);
      tgt.creditId = att.id;
    }
    if (tgt.team === 'player') {
      this.stats.damageTaken += m.dmg;
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
    } else if (
      def.armor &&
      !airborne &&
      !m.special &&
      (def.poise || (!m.knockdown && !m.launch)) &&
      tgt.armorAcc + m.dmg < (m.knockdown || m.launch ? def.poise ?? def.armor : def.armor)
    ) {
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
      // A kick through a raised guard leaves the blocker wide open
      this._setState(tgt, 'hitstun', guarding ? Math.max(m.hitstun, 40) : m.hitstun);
      tgt.vx = dir * m.kb;
      if (guarding) this.events.push({ type: 'guardBreak', id: tgt.id, x: tgt.x, z: tgt.z });
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
      this.stats.maxCombo = Math.max(this.stats.maxCombo, att.combo);
    }
    if (tgt.dead && def.boss) {
      // Boss down: dramatic slow motion, the arena calms down
      this.slowmo = Math.max(this.slowmo, 90);
      this.anvilEvery = null;
      this.airshipEvery = null;
      this.forkRainT = 0;
      this.zones = [];
      if (this.dark) {
        this.dark = false;
        this.events.push({ type: 'dark', on: false });
      }
      this.events.push({ type: 'bossDown', id: tgt.id, x: tgt.x, z: tgt.z });
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
      if (allied(e.team, f.team) || e.dead || e.heldBy || e.y > 0 || FIGHTERS[e.kind].noGrab) continue;
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
        if (FIGHTERS[t.kind].boss) continue;
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
          this.stats.maxCombo = Math.max(this.stats.maxCombo, credit.combo);
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
        let wa = a.team === 'player' && b.team !== 'player' ? 0.2 : b.team === 'player' && a.team !== 'player' ? 0.8 : 0.5;
        if (a.team === 'prop') wa = b.team === 'prop' ? 0.5 : 0;
        else if (b.team === 'prop') wa = 1;
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
    if (f.team === 'player') {
      for (const w of this.fighters) {
        if (!w.waiting || w.dead) continue;
        const d = f.x - w.x;
        if (Math.abs(d) < 320) f.x = w.x + (Math.sign(d) || -1) * 320;
      }
    }
    // On the river raft everybody stays on the raft
    const pb = f.team === 'player' && this.playerBounds ? this.playerBounds : this.raftBox && !FIGHTERS[f.kind].prop ? this.raftBox : b;
    if (f.x < pb.xMin + 30) f.x = pb.xMin + 30;
    if (f.x > pb.xMax - 30) f.x = pb.xMax - 30;
    if (f.z < b.zMin) f.z = b.zMin;
    if (f.z > b.zMax) f.z = b.zMax;
  }

  // ------------------------------------------------------------------ pickups

  /**
   * @param {'heal'|'kosar'|'gun'} kind
   * @param {{ y?: number, vx?: number, vy?: number, weapon?: number }} [o]
   */
  spawnPickup(kind, x, z, amount = 0, o = {}) {
    const y = o.y ?? 180;
    this.pickups.push({
      id: this.nextId++, kind, amount, weapon: o.weapon ?? 0, buff: o.buff ?? null,
      x, z, y, px: x, pz: z, py: y, vx: o.vx ?? 0, vy: o.vy ?? 0, t: 0, taken: false,
    });
  }

  _updatePickups() {
    if (!this.pickups.length) return;
    for (const it of this.pickups) {
      it.px = it.x;
      it.pz = it.z;
      it.py = it.y;
      it.t += 1;
      it.x += it.vx;
      it.vx *= it.y > 0 ? 0.985 : 0.8;
      if (it.x < this.bounds.xMin + 20 || it.x > this.bounds.xMax - 20) it.vx = -it.vx;
      // Money flies to a nearby player
      if (it.kind === 'kosar' && it.t > 24) {
        const p = this._nearestPlayer(it.x, it.z, 110);
        if (p) {
          it.x += Math.sign(p.x - it.x) * Math.min(7, Math.abs(p.x - it.x));
          it.z += Math.sign(p.z - it.z) * Math.min(4, Math.abs(p.z - it.z));
        }
      }
      if (it.y > 0 || it.vy > 0) {
        it.vy -= GRAVITY;
        it.y += it.vy;
        if (it.y <= 0) {
          it.y = 0;
          it.vy = it.vy < -4 ? -it.vy * 0.35 : 0;
        }
      }
      if (it.y > 30) continue;
      for (const p of this.fighters) {
        if (p.team !== 'player' || p.dead) continue;
        if (Math.abs(p.x - it.x) > 42 || Math.abs(p.z - it.z) > 22) continue;
        if (it.kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + it.amount);
        else if (it.kind === 'kosar') {
          p.money += it.amount;
          this.stats.kosari += it.amount;
        } else if (it.kind === 'gun') {
          p.weapons[it.weapon] = (p.weapons[it.weapon] || 0) + it.amount;
          if (!p.weapon) p.weapon = it.weapon;
        } else if (it.kind === 'buff') {
          p.buffs = p.buffs || {};
          p.buffs[it.buff] = Math.max(p.buffs[it.buff] || 0, it.amount);
        }
        it.taken = true;
        this.events.push({ type: 'pickup', id: p.id, kind: it.kind, amount: it.amount, weapon: it.weapon, buff: it.buff, x: it.x, z: it.z });
        break;
      }
    }
    this.pickups = this.pickups.filter((it) => !it.taken);
  }

  /**
   * Timed buffs from pickups: speed (энергетик), power (протеин), shield (очки
   * сигмы — no damage taken). Base values are remembered on first use.
   */
  _updateBuffs() {
    for (const p of this.fighters) {
      if (!p.buffs) continue;
      p.speedBase ??= p.speedMul || 1;
      p.dmgBase ??= p.dmgMul || 1;
      for (const k of Object.keys(p.buffs)) {
        if (p.buffs[k] > 0) p.buffs[k] -= 1;
        if (p.buffs[k] <= 0) delete p.buffs[k];
      }
      p.speedMul = p.speedBase * (p.buffs.speed ? BUFFS.speed.mul : 1);
      p.dmgMul = p.dmgBase * (p.buffs.power ? BUFFS.power.mul : 1);
      if (p.buffs.shield) p.iframes = Math.max(p.iframes, 2);
    }
  }

  _nearestPlayer(x, z, maxD) {
    let best = null;
    let bd = maxD;
    for (const p of this.fighters) {
      if (p.team !== 'player' || p.dead) continue;
      const d = Math.abs(p.x - x) + Math.abs(p.z - z) * 1.5;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ guns

  _selectWeapon(f, slot) {
    if (f.team !== 'player') return;
    if (slot === 0 || (WEAPONS[slot] && f.weapons[slot] > 0)) {
      if (f.weapon !== slot) this.events.push({ type: 'weapon', id: f.id, weapon: slot });
      f.weapon = slot;
    } else {
      this.events.push({ type: 'noWeapon', id: f.id, weapon: slot });
    }
  }

  _cycleWeapon(f, dir) {
    if (f.team !== 'player') return;
    const owned = WEAPON_SLOTS.filter((w) => w === 0 || f.weapons[w] > 0);
    const i = Math.max(0, owned.indexOf(f.weapon));
    this._selectWeapon(f, owned[(i + dir + owned.length) % owned.length]);
  }

  _buy(f, idx) {
    const item = SHOP[idx];
    if (!item || f.team !== 'player') return;
    if (item.helperSlot != null) {
      // A meme you beat in an earlier chapter comes to help for a while
      const kind = this.helpers?.[item.helperSlot];
      if (!kind || f.money < item.price || this.fighters.some((g) => g.team === 'ally' && !g.dead)) {
        this.events.push({ type: 'cantBuy', id: f.id, item: item.id });
        return;
      }
      f.money -= item.price;
      const h = this.spawn(kind, f.x - f.facing * 140, f.z, { facing: f.facing });
      h.team = 'ally';
      h.allyT = 1500;
      this.events.push({ type: 'puff', x: h.x, z: h.z });
      this.events.push({ type: 'helperCome', kind, id: h.id });
      this.events.push({ type: 'buy', id: f.id, item: item.id, weapon: 0 });
      return;
    }
    if (f.money < item.price) {
      this.events.push({ type: 'cantBuy', id: f.id, item: item.id });
      return;
    }
    f.money -= item.price;
    if (item.weapon) {
      f.weapons[item.weapon] = (f.weapons[item.weapon] || 0) + WEAPONS[item.weapon].pack;
      if (!f.weapon) f.weapon = item.weapon;
    }
    if (item.heal) f.hp = Math.min(f.maxHp, f.hp + item.heal);
    this.events.push({ type: 'buy', id: f.id, item: item.id, weapon: item.weapon || 0 });
  }

  _fire(f) {
    const w = WEAPONS[f.weapon];
    if (!w) return;
    if (!(f.weapons[f.weapon] > 0)) {
      this.events.push({ type: 'empty', id: f.id, weapon: f.weapon });
      f.weapon = 0;
      return;
    }
    f.weapons[f.weapon] -= 1;
    f.fireCd = w.cd;
    this.stats.shots += 1;
    const n = w.pellets || 1;
    for (let i = 0; i < n; i += 1) {
      const dz = n > 1 ? ((i / (n - 1)) - 0.5) * w.spreadZ : 0;
      this._spawnProj(f, w.proj, { muzzle: w.muzzle, dz, speedK: n > 1 ? this.rng.range(0.92, 1.05) : 1 });
    }
    f.x -= f.facing * w.recoil;
    this.events.push({ type: 'shot', id: f.id, weapon: f.weapon, x: f.x, z: f.z });
    if (f.weapons[f.weapon] <= 0) {
      this.events.push({ type: 'empty', id: f.id, weapon: f.weapon });
      f.weapon = 0;
    }
  }

  /**
   * Launch a projectile from fighter-like `f` ({ id, team, x, z, y, facing, dmgMul }).
   * Spec fields are documented in hazards.js / items.js.
   * @param {{ muzzle?, dz?, speedK?, x?, y?, z?, vy?, target? }} [o]
   */
  _spawnProj(f, spec, o = {}) {
    if (spec.kind === 'wave' && o.y == null) o = { ...o, y: 10 };
    const mz = o.muzzle || spec.muzzle || { x: 40, y: 150 };
    const dz = o.dz || 0;
    const x = o.x ?? f.x + f.facing * mz.x;
    const y = o.y ?? (f.y || 0) + mz.y;
    const z = o.z ?? f.z + dz * 0.3;
    const pr = {
      id: this.nextId++,
      owner: f.id,
      origOwner: f.id,
      team: f.team,
      spec,
      x,
      z,
      y,
      px: x,
      pz: z,
      py: y,
      vx: f.facing * (spec.speed || 0) * (o.speedK || 1),
      vz: dz * 0.06,
      vy: o.vy ?? spec.vy ?? 0,
      tx: x,
      tz: z,
      life: spec.life,
      hit: [],
      dead: false,
      dmgMul: f.dmgMul || 1,
      reflected: false,
      hitsAll: !!spec.hitsAll,
      /** Orbiting projectiles (1Kla$'s microphone on its cord). */
      ang: spec.orbit ? (f.facing > 0 ? 0 : Math.PI) : 0,
    };
    if (spec.arc) {
      const t = o.target || this._nearestPlayer(x, z, 1e9);
      if (t) this._aim(pr, t.x + this.rng.range(-30, 30), t.z, 0, spec.arcSpeed || 8);
    }
    this.projectiles.push(pr);
    if (spec.kind !== 'bullet' && spec.kind !== 'pellet' && spec.kind !== 'rocket') {
      this.events.push({ type: 'toss', id: f.id, kind: spec.kind, tex: spec.tex, x, z });
    }
    return pr;
  }

  /** Ballistic aim: land at (tx, height ty, tz). Remembers the landing spot for markers. */
  _aim(pr, tx, tz, ty, speed) {
    const g = pr.spec.gravity || 0;
    const dx = tx - pr.x;
    const T = Math.max(18, Math.min(110, Math.abs(dx) / speed));
    pr.vx = dx / T;
    pr.vz = (tz - pr.z) / T;
    pr.vy = (ty - pr.y + 0.5 * g * T * T) / T;
    pr.tx = tx;
    pr.tz = tz;
  }

  /** A player's live melee swing knocks enemy throwables back. */
  _tryReflect(pr) {
    for (const f of this.fighters) {
      if (f.team !== 'player' || f.state !== 'attack') continue;
      const m = MOVES[f.move];
      if (!m || m.grabOnly || m.throw || m.projectile) continue;
      if (f.mt <= m.startup || f.mt > m.startup + m.active) continue;
      if (Math.abs(pr.z - f.z) > m.depth + 14 || Math.abs(pr.y - f.y - 140) > 130) continue;
      const front = (pr.x - f.x) * f.facing;
      if (front < -24 || front > m.reach[1] + 34) continue;
      const back = pr.spec.reflectable === 'toOwner' ? this._byId(pr.origOwner) : null;
      pr.team = f.team;
      pr.owner = f.id;
      pr.hit = [];
      pr.reflected = true;
      pr.hitsAll = false;
      pr.dmgMul = 2;
      pr.life = 160;
      if (back && !back.dead) {
        // Straight back at whoever threw it (chest height)
        this._aim(pr, back.x, back.z, 120, 12);
      } else {
        pr.vx = f.facing * Math.max(9, Math.abs(pr.vx) * 1.6);
        pr.vy = pr.spec.gravity ? 6 : 0;
        pr.tx = pr.x + pr.vx * 30;
      }
      this.hitstop = Math.max(this.hitstop, 4);
      this.events.push({ type: 'reflect', id: f.id, kind: pr.spec.kind, x: pr.x, z: pr.z, y: pr.y });
      return true;
    }
    return false;
  }

  _projHits(pr, t) {
    if (t.dead || UNHITTABLE.has(t.state) || t.iframes > 0 || t.state === 'grabbed') return false;
    if (pr.hitsAll ? t.id === pr.owner : allied(t.team, pr.team)) return false;
    if (pr.hit.includes(t.id)) return false;
    const sp = pr.spec;
    if (Math.abs(t.x - pr.x) > (sp.halfW ?? 30) + Math.abs(pr.vx) * 0.5 || Math.abs(t.z - pr.z) > (sp.halfZ ?? 24)) return false;
    // Cars: jump over them
    if (sp.hitH && t.y > sp.hitH) return false;
    if (pr.y < t.y - 10 || pr.y > t.y + 250) return false;
    return true;
  }

  _updateProjectiles() {
    if (!this.projectiles.length) return;
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.px = pr.x;
      pr.pz = pr.z;
      pr.py = pr.y;
      const sp = pr.spec;
      if (sp.orbit) {
        const o = this._byId(pr.owner);
        if (!o || o.dead) {
          pr.dead = true;
          continue;
        }
        pr.ang += sp.orbit.w;
        pr.x = o.x + Math.cos(pr.ang) * sp.orbit.r;
        pr.z = Math.min(this.bounds.zMax, Math.max(this.bounds.zMin, o.z + Math.sin(pr.ang) * sp.orbit.r * 0.35));
        pr.y = sp.orbit.y ?? 14;
        pr.vx = -Math.sin(pr.ang) * sp.orbit.r * sp.orbit.w;
      } else {
        pr.x += pr.vx;
        pr.z += pr.vz || 0;
        pr.y += pr.vy || 0;
      }
      if (sp.gravity) pr.vy -= sp.gravity;
      pr.life -= 1;
      if (sp.reflectable && !pr.reflected && pr.team !== 'player') this._tryReflect(pr);

      // Player bullets set off bombs in mid-air
      if (pr.team === 'player' && (sp.kind === 'bullet' || sp.kind === 'pellet')) {
        for (const q of this.projectiles) {
          if (q === pr || q.dead || !q.spec.shootable) continue;
          if (Math.abs(q.x - pr.x) > 28 + Math.abs(pr.vx) * 0.5 || Math.abs(q.z - pr.z) > 26 || Math.abs(q.y - pr.y) > 50) continue;
          q.owner = pr.owner;
          q.team = 'player';
          q.hitsAll = false;
          this._explode(q);
          pr.dead = true;
          break;
        }
        if (pr.dead) continue;
      }

      for (const t of this.fighters) {
        if (pr.dead) break;
        if (!this._projHits(pr, t)) continue;
        if (sp.explode) {
          this._explode(pr);
          break;
        }
        pr.hit.push(t.id);
        const owner = this._byId(pr.owner) || { id: -1, team: pr.team, x: pr.x, facing: Math.sign(pr.vx) || 1, combo: 0, meter: 0 };
        // Shotgun up close knocks down
        const close = sp.kind === 'pellet' && pr.life > sp.life - 6;
        const shooter = { ...owner, dmgMul: pr.dmgMul };
        this._applyHit(shooter, t, {
          dmg: sp.dmg,
          hitstun: sp.hitstun,
          kb: sp.kb,
          hitstop: sp.pierce ? 5 : 2,
          knockdown: !!sp.knockdown || close || pr.reflected,
          heavy: !!sp.knockdown || close || pr.reflected,
        }, { x: pr.x - Math.sign(pr.vx || 1) * 40, facing: Math.sign(pr.vx) || 1, reflected: pr.reflected, bossDmg: sp.bossDmg });
        // Credit combo / meter to the real owner (shooter is a copy)
        if (owner.id > 0 && owner.team === 'player') {
          owner.combo = shooter.combo;
          owner.comboT = shooter.comboT;
          owner.meter = shooter.meter;
        }
        if (!sp.pierce && (sp.kind !== 'pellet' || t.kind !== 'crate')) {
          pr.dead = true;
          if (sp.kind !== 'bullet' && sp.kind !== 'pellet') this.events.push({ type: 'shatter', kind: sp.kind, x: pr.x, z: pr.z, y: pr.y });
        }
      }
      if (pr.dead) continue;

      // Landing
      if (sp.gravity && pr.y <= 0) {
        pr.y = 0;
        if (sp.explode) this._explode(pr);
        else {
          pr.dead = true;
          this.events.push({ type: sp.kind === 'fork' ? 'forkStick' : 'shatter', kind: sp.kind, x: pr.x, z: pr.z, y: 0 });
        }
        continue;
      }
      if (pr.life <= 0) {
        if (sp.explode) this._explode(pr);
        else pr.dead = true;
      }
      if (pr.x < this.bounds.xMin - 300 || pr.x > this.bounds.xMax + 300) pr.dead = true;
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
  }

  _explode(pr) {
    pr.dead = true;
    const e = pr.spec.explode;
    const owner = this._byId(pr.owner) || { id: -1, team: pr.team, x: pr.x, facing: 1, combo: 0, meter: 0 };
    this.hitstop = Math.max(this.hitstop, 7);
    this.events.push({ type: 'explode', kind: pr.spec.kind, x: pr.x, z: pr.z, y: pr.y });
    for (const t of this.fighters) {
      if (t.dead || UNHITTABLE.has(t.state)) continue;
      if (pr.hitsAll ? t.id === pr.owner : allied(t.team, pr.team)) continue;
      if (Math.abs(t.x - pr.x) > e.radius || Math.abs(t.z - pr.z) > e.depth) continue;
      this._applyHit(owner, t, { dmg: e.dmg, kb: e.kb, launch: e.launch, hitstop: 7, heavy: true, special: false }, {
        x: pr.x,
        facing: Math.sign(pr.vx) || 1,
        reflected: pr.reflected,
        bossDmg: pr.spec.bossDmg,
      });
    }
  }

  // ------------------------------------------------------------------ hazards (original game)

  dropAnvil(x, z) {
    const a = this.spawn('anvil', x, z);
    a.y = a.py = 640;
    a.vy = 0;
    a.dropH = 640;
    this.events.push({ type: 'anvilIncoming', id: a.id, x, z });
    return a;
  }

  callAirship() {
    const ps = this.players();
    if (!ps.length || this.airships.length) return;
    const pb = this.playerBounds || this.bounds;
    const fromLeft = this.rng.chance(0.5);
    this.airships.push({
      id: this.nextId++,
      x: fromLeft ? pb.xMin - 300 : pb.xMax + 300,
      px: fromLeft ? pb.xMin - 300 : pb.xMax + 300,
      y: 360,
      vx: fromLeft ? 1.6 : -1.6,
      dropT: 90,
    });
    this.events.push({ type: 'airship' });
  }

  _hazards() {
    const ps = this.players();
    const pb = this.playerBounds || this.bounds;
    const near = () => ps[this.rng.int(0, ps.length - 1)];

    // Nothing drops on the road during the race
    if (this.race && !this.race.done) return;
    // Anvils from the sky (Влад Борщ phases, or a map can switch them on)
    if (this.anvilEvery && ps.length) {
      if (this.anvilT <= 0) this.anvilT = this.rng.int(this.anvilEvery[0], this.anvilEvery[1]);
      if (--this.anvilT <= 0) {
        const p = near();
        const x = Math.min(pb.xMax - 60, Math.max(pb.xMin + 60, p.x + this.rng.range(-160, 160)));
        this.dropAnvil(x, Math.min(this.bounds.zMax - 10, Math.max(this.bounds.zMin + 10, p.z + this.rng.range(-30, 30))));
      }
    }

    // Airship passes, dropping bombs near the players
    if (this.airshipEvery && ps.length && !this.airships.length) {
      if (this.airshipT <= 0) this.airshipT = this.rng.int(this.airshipEvery[0], this.airshipEvery[1]);
      if (--this.airshipT <= 0) this.callAirship();
    }
    for (const s of this.airships) {
      s.px = s.x;
      s.x += s.vx;
      if (--s.dropT <= 0 && ps.length) {
        s.dropT = this.rng.int(60, 100);
        const p = near();
        if (Math.abs(p.x - s.x) < 420) {
          const z = Math.min(this.bounds.zMax - 10, Math.max(this.bounds.zMin + 10, p.z + this.rng.range(-40, 40)));
          this._spawnProj({ id: -1, team: 'hazard', x: s.x, z, y: 0, facing: 1, dmgMul: 1 }, DIRIG_BOMB, { x: s.x, y: s.y - 40, z });
        }
      }
      if ((s.vx > 0 && s.x > pb.xMax + 400) || (s.vx < 0 && s.x < pb.xMin - 400)) s.gone = true;
    }
    if (this.airships.some((s) => s.gone)) {
      this.airships = this.airships.filter((s) => !s.gone);
      this.events.push({ type: 'airshipGone' });
    }

    // Fork rain between Повар's phases
    if (this.forkRainT > 0 && ps.length) {
      this.forkRainT -= 1;
      if (this.forkRainT % 14 === 0) {
        const p = near();
        const x = Math.min(pb.xMax - 30, Math.max(pb.xMin + 30, p.x + this.rng.range(-280, 280)));
        const z = this.rng.range(this.bounds.zMin + 8, this.bounds.zMax - 8);
        this._spawnProj({ id: -1, team: 'hazard', x, z, y: 0, facing: 1, dmgMul: 1 }, this.rainSpec || FORK, { x, y: 640, z });
      }
    }

    // Fire zones: a mark on the floor, then it erupts in both directions
    if (this.zones.length) {
      for (const zn of this.zones) {
        if (--zn.t > 0) continue;
        zn.done = true;
        const src = { id: -1, team: 'hazard', x: zn.x, z: zn.z, y: 0, facing: 1, dmgMul: 1 };
        const spec = { kind: 'wave', tex: 'shockwave', speed: 7, gravity: 0, life: 18, dmg: 13, hitstun: 0, kb: 8, knockdown: true, pierce: true, muzzle: { x: 0, y: 10 } };
        this._spawnProj(src, spec, { x: zn.x, z: zn.z, y: 10 });
        this._spawnProj({ ...src, facing: -1 }, spec, { x: zn.x, z: zn.z, y: 10 });
        this.events.push({ type: 'zoneFire', x: zn.x, z: zn.z, r: zn.r });
      }
      this.zones = this.zones.filter((zn) => !zn.done);
    }

    // Косари falling from the sky (like the original's kosarepad)
    if (this.kosariRain && ps.length) {
      if (this.kosariT <= 0) this.kosariT = this.rng.int(this.kosariRain[0], this.kosariRain[1]);
      if (--this.kosariT <= 0) {
        const p = near();
        const x = Math.min(pb.xMax - 40, Math.max(pb.xMin + 40, p.x + this.rng.range(-380, 380)));
        this.spawnPickup('kosar', x, this.rng.range(this.bounds.zMin + 10, this.bounds.zMax - 10), this.rng.chance(0.12) ? 5 : 1, { y: 520 });
      }
    }
  }

  // ------------------------------------------------------------------ loot & crates

  /** Enemies spill косари when they go down. */
  _dropLoot() {
    for (const f of this.fighters) {
      if (!f.dead || f.looted || f.team !== 'enemy') continue;
      f.looted = true;
      const r = KILL_LOOT[f.kind];
      if (!r) continue;
      this._spillKosari(f.x, f.z, this.rng.int(r[0], r[1]), f.y + 60);
    }
  }

  _spillKosari(x, z, total, y = 60) {
    let left = total;
    while (left > 0) {
      const amount = left >= 10 ? 10 : left >= 5 ? 5 : 1;
      left -= amount;
      this.spawnPickup('kosar', x, z + this.rng.range(-12, 12), amount, {
        y,
        vx: this.rng.range(-3.5, 3.5),
        vy: this.rng.range(6, 10),
      });
    }
  }

  _crateDropper() {
    if (!this.crateEvery) return;
    if (this.crateT <= 0) this.crateT = this.rng.int(this.crateEvery[0], this.crateEvery[1]);
    if (--this.crateT > 0) return;
    const crates = this.fighters.filter((f) => f.kind === 'crate' && !f.dead).length;
    const ps = this.players();
    if (crates >= 2 || !ps.length) return;
    const p = ps[this.rng.int(0, ps.length - 1)];
    const pb = this.playerBounds || this.bounds;
    const x = Math.min(pb.xMax - 80, Math.max(pb.xMin + 80, p.x + this.rng.range(-260, 260)));
    this.dropCrate(x, this.rng.range(this.bounds.zMin + 15, this.bounds.zMax - 15));
  }

  dropCrate(x, z) {
    const c = this.spawn('crate', x, z);
    c.y = c.py = 560;
    c.vy = 0;
    c.dropH = 560;
    this.events.push({ type: 'crateIncoming', id: c.id, x, z });
    return c;
  }

  _prop(f) {
    const def = FIGHTERS[f.kind];
    if (f.dead) {
      if (--f.removeT <= 0) f.removed = true;
      return;
    }
    if (def.lie && f.y <= 0 && f.vy === 0 && f.st > 0) {
      // Landed anvil sits for a moment, then cracks apart
      if (--f.lieT <= 0) {
        f.dead = true;
        f.removeT = 1;
        this.events.push({ type: 'anvilBreak', id: f.id, x: f.x, z: f.z });
      }
      return;
    }
    if (f.y > 0 || f.vy > 0) {
      this._gravity(f);
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        this.events.push({ type: def.anvil ? 'anvilLand' : 'crateLand', id: f.id, x: f.x, z: f.z });
        if (f.dropH > 120) {
          // Crushes whoever stands underneath
          for (const t of this.fighters) {
            if (t === f || t.dead || t.team === 'prop' || UNHITTABLE.has(t.state)) continue;
            if (Math.abs(t.x - f.x) > 52 || Math.abs(t.z - f.z) > 26) continue;
            this._applyHit(f, t, { dmg: def.crush ?? 15, kb: 5, knockdown: true, hitstop: 5, heavy: true }, { x: f.x, facing: 1 });
          }
        }
        f.dropH = 0;
        f.st = 1;
        f.lieT = def.lie || 0;
      }
    }
  }

  _hitProp(c, m, dir, att, src) {
    const pdef = FIGHTERS[c.kind];
    if (pdef.keeper) return;
    if (pdef.objective) {
      // Only enemies (and hazards) wreck the kiosk
      if (att && (att.team === 'player' || att.team === 'ally')) return;
      c.hp = Math.max(0, c.hp - (m.dmg || 0));
      c.animSeq += 1;
      this.events.push({ type: 'objHit', id: c.id, hp: c.hp, maxHp: c.maxHp });
      if (c.hp <= 0) {
        // Broken: costs косари, then it is patched up at half strength
        c.hp = Math.round(c.maxHp * 0.5);
        for (const p of this.players()) if (p.kind === 'player') p.money = Math.max(0, (p.money || 0) - 10);
        this.events.push({ type: 'objLost', id: c.id, x: c.x, z: c.z });
      }
      return;
    }
    if (pdef.target) {
      if (c.y > 40) return;
      c.hp = Math.max(0, c.hp - (m.dmg || 0));
      c.animSeq += 1;
      this.events.push({ type: 'hit', target: c.id, targetTeam: 'prop', x: c.x, z: c.z, y: 0, dir, dmg: 0, heavy: false, reaction: 'prop' });
      if (c.hp <= 0) {
        c.dead = true;
        c.removeT = 2;
        this.events.push({ type: 'targetBreak', id: c.id, x: c.x, z: c.z });
      }
      return;
    }
    if (FIGHTERS[c.kind].anvil) {
      c.dead = true;
      c.removeT = 1;
      if (src || !att || att.team !== 'player') {
        // Shot (or blown up): shatters
        this.events.push({ type: 'anvilBreak', id: c.id, x: c.x, z: c.z });
        return;
      }
      // Punched: flies off sideways and mows down the crowd
      const pr = this._spawnProj({ id: att.id, team: att.team, x: c.x, z: c.z, y: 0, facing: dir, dmgMul: 1 }, ANVIL_FLY, {
        x: c.x,
        y: Math.max(40, c.y),
        z: c.z,
      });
      pr.vx = dir * ANVIL_FLY.speed;
      this.hitstop = Math.max(this.hitstop, 5);
      this.events.push({ type: 'anvilLaunch', id: att.id, x: c.x, z: c.z });
      return;
    }
    if (c.y > 40) return;
    c.hp = Math.max(0, c.hp - (m.dmg || 0));
    this.hitstop = Math.max(this.hitstop, 2);
    this.events.push({ type: 'hit', target: c.id, targetTeam: 'prop', x: c.x, z: c.z, y: 0, dir, dmg: 0, heavy: false, reaction: 'prop' });
    c.animSeq += 1;
    if (c.hp > 0) return;
    c.dead = true;
    c.removeT = 2;
    this.events.push({ type: 'crateBreak', id: c.id, x: c.x, z: c.z });
    // Loot: always money, sometimes food or a gun
    this._spillKosari(c.x, c.z, this.rng.int(2, 4), 40);
    const roll = this.rng.next();
    if (roll < 0.3) {
      this.spawnPickup('heal', c.x + this.rng.range(-30, 30), c.z, 30, { y: 40, vy: 8, vx: this.rng.range(-2, 2) });
    } else if (roll < 0.45) {
      // Энергетик / протеин / очки сигмы
      const buff = this.rng.pick(['speed', 'power', 'shield']);
      this.spawnPickup('buff', c.x + this.rng.range(-30, 30), c.z, BUFFS[buff].ticks, { y: 40, vy: 8, vx: this.rng.range(-2, 2), buff });
    } else if (roll < 0.8) {
      const total = CRATE_GUNS.reduce((a, g) => a + g[1], 0);
      let k = this.rng.range(0, total);
      let gun = CRATE_GUNS[0][0];
      for (const [id, wgt] of CRATE_GUNS) {
        k -= wgt;
        if (k <= 0) {
          gun = id;
          break;
        }
      }
      this.spawnPickup('gun', c.x + this.rng.range(-30, 30), c.z, WEAPONS[gun].pack, {
        y: 40, vy: 9, vx: this.rng.range(-2, 2), weapon: gun,
      });
    }
  }

  /** Final boss defeat: slow motion and a shower of косари. */
  _bossDown(tgt, dir) {
    tgt.dead = true;
    tgt.facing = -dir;
    this._setState(tgt, 'airhit');
    tgt.vy = 10;
    tgt.vx = dir * 6;
    this.kills += 1;
    this.slowmo = Math.max(this.slowmo, 90);
    this.anvilEvery = null;
    this.airshipEvery = null;
    this.forkRainT = 0;
    this.events.push({ type: 'bossDown', id: tgt.id, x: tgt.x, z: tgt.z });
  }

  /** Boss brains: start a move if the fighter is free. */
  bossMove(f, id) {
    if (!FREE.has(f.state) || !MOVES[id]) return false;
    this._startMove(f, id);
    return true;
  }

  /** Freeze a player in place (Гигачад's pose, Глад's scream). */
  stun(p, ticks) {
    if (p.dead || p.iframes > 0 || !FREE.has(p.state)) return false;
    this._setState(p, 'hitstun', ticks);
    p.vx = 0;
    p.animSeq += 1;
    p.anim = { type: 'hurt', reaction: 'flinch', dir: p.facing };
    return true;
  }

  /** Mark a fire zone that erupts after `t` ticks. */
  addZone(x, z, t = 60, r = 70) {
    const pb = this.playerBounds || this.bounds;
    x = Math.min(pb.xMax - 40, Math.max(pb.xMin + 40, x));
    z = Math.min(this.bounds.zMax - 8, Math.max(this.bounds.zMin + 8, z));
    this.zones.push({ x, z, t, r });
    this.events.push({ type: 'zoneWarn', x, z, r, t });
  }

  /** Lights on / off (Пахом). */
  setDark(on) {
    if (this.dark === on) return;
    this.dark = on;
    this.events.push({ type: 'dark', on });
  }

  _rollOffsets(f) {
    f.ai.offX = this.rng.range(-40, 40);
    f.ai.offZ = this.rng.range(-70, 70);
  }
}

export { FREE };

/** Knockback multiplier on every hit (bodies fly further). */
export const KB_MUL = 3;
/** Player's forward step on a swing that hasn't hit anything yet. */
export const PLAYER_LUNGE_MUL = 3;
