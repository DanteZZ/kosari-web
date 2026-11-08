import { BTN } from './input.js';

/**
 * Village: a penalty shoot-out with Дед before his boss fight (arena
 * `mini: { type: 'penalty', rounds }`). Rounds alternate:
 *
 *   You shoot — W/S aims along the goal, J kicks when the power bar is right
 *               (too strong = over the bar; strong shots beat his dive).
 *   Дед shoots — he glances at a corner (sometimes a feint), W/S moves you
 *               along the goal line, L dives wider.
 *
 * Win → a heap of косари and some health; lose → Дед's mates join the next fight.
 * world.mini = { type: 'penalty', phase, round, rounds, score, ... }
 */

const SPOT_OFF = 760;
const GOAL_OFF = SPOT_OFF + 540;
const POWER_PERIOD = 80;

function lanes(world) {
  return { zMin: world.bounds.zMin + 12, zMax: world.bounds.zMax - 12 };
}

function place(f, x, z) {
  f.x = f.px = x;
  f.z = f.pz = z;
  f.vx = 0;
  f.vz = 0;
}

export function startPenalty(world, b, cfg) {
  const p = world.players()[0];
  const keeper = world.spawn('keeper', b.left + GOAL_OFF, (world.bounds.zMin + world.bounds.zMax) / 2, { facing: -1 });
  const m = {
    type: 'penalty',
    phase: 'intro',
    t: 90,
    round: 0,
    rounds: (cfg.rounds || 3) * 2,
    score: { you: 0, ded: 0 },
    spotX: b.left + SPOT_OFF,
    goalX: b.left + GOAL_OFF,
    keeper: keeper.id,
    aimZ: (world.bounds.zMin + world.bounds.zMax) / 2,
    power: 0,
    ball: null,
    look: null,
    result: null,
    done: false,
  };
  world.mini = m;
  // With an entry (walk up to the ball) the hero stays free until he uses it
  if (p && !cfg.early) {
    p.mini = true;
    place(p, m.spotX - 70, m.aimZ);
    p.facing = 1;
  }
  m.ballZ = m.aimZ;
  world.events.push({ type: 'penaltyStart', rounds: m.rounds / 2, goalX: m.goalX, spotX: m.spotX });
  return m;
}

/** Before input is latched: read the controls, keep the hero from walking off. */
export function prePenalty(world) {
  const m = world.mini;
  const p = world.players()[0];
  if (!m || m.done || !p) return;
  m.cmd = p.cmd;
  m.pressed = p.cmd & ~(m.prevCmd || 0);
  m.prevCmd = p.cmd;
  p.cmd = 0;
}

function kickBall(world, m, fromX, toX, z0, z1, ticks, high) {
  m.ball = { x: fromX, z: z0, y: 0, px: fromX, pz: z0, py: 0, vx: (toX - fromX) / ticks, vz: (z1 - z0) / ticks, vy: high ? 9 : 4.5, t: ticks, toZ: z1 };
  world.events.push({ type: 'penaltyKick', x: fromX, z: z0 });
}

function endRound(world, m, scored, who, text) {
  if (scored) m.score[who] += 1;
  m.phase = 'result';
  m.t = 80;
  world.events.push({ type: 'penaltyResult', scored, who, text, score: { ...m.score } });
}

export function stepPenalty(world) {
  const m = world.mini;
  if (!m || m.type !== 'penalty' || m.done) return;
  const p = world.players()[0];
  const k = world.fighters.find((f) => f.id === m.keeper);
  if (!p || !k) return;
  const L = lanes(world);
  const shooting = m.round % 2 === 0;
  const cmd = m.cmd || 0;
  const pressed = m.pressed || 0;
  m.pressed = 0;

  // Ball flight
  if (m.ball) {
    const bl = m.ball;
    bl.px = bl.x;
    bl.pz = bl.z;
    bl.py = bl.y;
    bl.x += bl.vx;
    bl.z += bl.vz;
    bl.y = Math.max(0, bl.y + bl.vy);
    bl.vy -= 0.25;
    bl.t -= 1;
  }

  switch (m.phase) {
    case 'intro':
      p.mini = true;
      p.facing = 1;
      place(p, m.spotX - 70, p.z);
      if (--m.t <= 0) {
        m.phase = shooting ? 'aim' : 'run';
        m.t = shooting ? 0 : 70;
      }
      break;

    case 'aim': {
      // You shoot: hero at the spot, Дед in goal
      place(k, m.goalX, k.z);
      place(p, m.spotX - 70, p.z);
      p.facing = 1;
      k.facing = -1;
      const dz = (cmd & BTN.UP ? -1 : 0) + (cmd & BTN.DOWN ? 1 : 0);
      m.aimZ = Math.min(L.zMax, Math.max(L.zMin, m.aimZ + dz * 2.6));
      m.t += 1;
      m.power = 0.5 - 0.5 * Math.cos((m.t / POWER_PERIOD) * Math.PI * 2);
      if (pressed & (BTN.LIGHT | BTN.HEAVY)) {
        p.buf = { btn: BTN.HEAVY, t: 3 };
        const over = m.power > 0.9;
        kickBall(world, m, m.spotX, m.goalX, p.z, m.aimZ, 38, over);
        m.ball.over = over;
        m.ball.power = m.power;
        // Дед guesses: often right, sometimes just the middle
        const r = world.rng.next();
        m.dive = r < 0.45 ? m.aimZ + world.rng.range(-12, 12) : r < 0.7 ? (L.zMin + L.zMax) / 2 : world.rng.range(L.zMin, L.zMax);
        m.phase = 'shot';
      }
      break;
    }

    case 'shot': {
      // Дед dives after a short reaction
      if (m.ball.t < 26) {
        k.z += Math.sign(m.dive - k.z) * Math.min(Math.abs(m.dive - k.z), 6);
        if (!m.dove) {
          m.dove = true;
          world.events.push({ type: 'keeperDive', id: k.id, dir: Math.sign(m.dive - k.z) });
        }
      }
      if (m.ball.t <= 0) {
        m.dove = false;
        const bl = m.ball;
        m.ball = null;
        if (bl.over) endRound(world, m, false, 'you', 'Выше ворот!');
        else {
          const reach = bl.power > 0.72 ? 18 : 30;
          if (Math.abs(k.z - bl.toZ) < reach) endRound(world, m, false, 'you', 'Дед взял!');
          else endRound(world, m, true, 'you', 'ГОЛ!');
        }
      }
      break;
    }

    case 'run': {
      // Дед shoots: he walks up to the spot and glances at a corner (maybe a feint)
      place(k, m.spotX - 70, k.z);
      k.facing = 1;
      place(p, m.goalX, p.z);
      p.facing = -1;
      if (m.t === 70) {
        m.target = world.rng.chance(0.5) ? L.zMin + world.rng.range(0, 30) : L.zMax - world.rng.range(0, 30);
        const feint = world.rng.chance(0.3);
        m.look = feint ? L.zMin + L.zMax - m.target : m.target;
        world.events.push({ type: 'dedLooks', z: m.look });
      }
      if (--m.t <= 0) {
        k.buf = { btn: BTN.HEAVY, t: 3 };
        kickBall(world, m, m.spotX, m.goalX, k.z, m.target, 24, false);
        m.look = null;
        m.phase = 'save';
      }
      break;
    }

    case 'save': {
      // You keep goal: move along the line, L to dive wider
      const dz = (cmd & BTN.UP ? -1 : 0) + (cmd & BTN.DOWN ? 1 : 0);
      if ((pressed & BTN.DASH) && !m.dived) {
        m.dived = true;
        world.events.push({ type: 'heroDive', dir: dz });
      }
      p.z = Math.min(L.zMax, Math.max(L.zMin, p.z + dz * (m.dived ? 6 : 3.4)));
      p.x = p.px = m.goalX;
      if (m.ball.t <= 0) {
        const bl = m.ball;
        m.ball = null;
        const reach = m.dived ? 40 : 24;
        m.dived = false;
        if (Math.abs(p.z - bl.toZ) < reach) endRound(world, m, false, 'ded', 'ОТБИЛ!');
        else endRound(world, m, true, 'ded', 'Гол Деда…');
      }
      break;
    }

    case 'result':
      if (--m.t > 0) break;
      m.round += 1;
      if (m.round >= m.rounds) {
        m.done = true;
        p.mini = false;
        const win = m.score.you > m.score.ded;
        const draw = m.score.you === m.score.ded;
        world.miniResult = { win, draw };
        // Win: a heap of косари and a breather; lose: Дед brings his mates
        if (win) {
          world._spillKosari(p.x + 80, p.z, 25, 80);
          p.hp = Math.min(p.maxHp, p.hp + 60);
        }
        k.dead = true;
        k.removed = true;
        world.events.push({ type: 'penaltyEnd', win, draw, score: { ...m.score } });
      } else {
        m.phase = m.round % 2 === 0 ? 'aim' : 'run';
        m.t = m.round % 2 === 0 ? 0 : 70;
        place(p, m.round % 2 === 0 ? m.spotX - 70 : m.goalX, (L.zMin + L.zMax) / 2);
        place(k, m.round % 2 === 0 ? m.goalX : m.spotX - 70, (L.zMin + L.zMax) / 2);
      }
      break;
    default:
  }
}

export function penaltyText(m) {
  const n = Math.min(m.rounds / 2, Math.floor(m.round / 2) + 1);
  return `Пенальти с Дедом · Ты ${m.score.you} : ${m.score.ded} Дед · раунд ${n}/${m.rounds / 2}`;
}
