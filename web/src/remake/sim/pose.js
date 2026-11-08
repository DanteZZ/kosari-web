import { BTN } from './input.js';

/**
 * Sigma gym: a pose-off with Гигачад before his fight (arena `mini: { type:
 * 'pose', rounds }`). He strikes a chain of poses (arrows), you repeat it with
 * W/A/S/D before the timer runs out. Each round the chain grows. Out-pose him →
 * he starts the fight shaken (less health); lose → he is pumped (more).
 */

const KEYS = [
  { k: 'W', bit: BTN.UP },
  { k: 'A', bit: BTN.LEFT },
  { k: 'S', bit: BTN.DOWN },
  { k: 'D', bit: BTN.RIGHT },
];
const SHOW_T = 34;

export function startPose(world, b, cfg) {
  const p = world.players()[0];
  const mx = (b.left + b.right) / 2;
  const rival = world.spawn('poser', mx + 240, (world.bounds.zMin + world.bounds.zMax) / 2, { facing: -1 });
  world.mini = {
    type: 'pose',
    rounds: cfg.rounds || 3,
    round: 0,
    phase: 'show',
    seq: [],
    input: 0,
    t: 0,
    shown: -1,
    score: { you: 0, chad: 0 },
    rival: rival.id,
    x: mx - 240,
    done: false,
  };
  newRound(world, world.mini);
  if (p) {
    p.mini = true;
    p.x = p.px = mx - 240;
    p.z = p.pz = rival.z;
    p.facing = 1;
  }
  world.events.push({ type: 'poseStart', rounds: world.mini.rounds });
}

function newRound(world, m) {
  const n = 3 + m.round;
  m.seq = [];
  for (let i = 0; i < n; i += 1) m.seq.push(world.rng.int(0, 3));
  m.phase = 'show';
  m.t = 0;
  m.input = 0;
  m.shown = -1;
}

export function prePose(world) {
  const m = world.mini;
  const p = world.players()[0];
  if (!m || m.done || !p) return;
  m.pressed = p.cmd & ~(m.prevCmd || 0);
  m.prevCmd = p.cmd;
  p.cmd = 0;
  p.buf = { btn: 0, t: 0 };
}

export function stepPose(world) {
  const m = world.mini;
  if (!m || m.type !== 'pose' || m.done) return;
  const p = world.players()[0];
  if (!p) return;
  p.x = p.px = m.x;
  m.t += 1;
  const pressed = m.pressed || 0;
  m.pressed = 0;
  if (m.phase === 'show') {
    // Гигачад shows the chain, one pose at a time
    const i = Math.floor(m.t / SHOW_T);
    if (i !== m.shown && i < m.seq.length) {
      m.shown = i;
      world.events.push({ type: 'posePose', who: 'chad', key: KEYS[m.seq[i]].k, id: m.rival, i });
    }
    if (m.t >= SHOW_T * m.seq.length + 30) {
      m.phase = 'input';
      m.t = 0;
      m.limit = 70 + m.seq.length * 32;
      world.events.push({ type: 'poseYourTurn' });
    }
    return;
  }
  if (m.phase === 'input') {
    for (let k = 0; k < 4; k += 1) {
      if (!(pressed & KEYS[k].bit)) continue;
      const ok = m.seq[m.input] === k;
      world.events.push({ type: 'posePose', who: 'you', key: KEYS[k].k, ok, id: p.id, i: m.input });
      if (!ok) {
        endRound(world, m, false);
        return;
      }
      m.input += 1;
      if (m.input >= m.seq.length) {
        endRound(world, m, true);
        return;
      }
    }
    if (m.t >= m.limit) endRound(world, m, false);
    return;
  }
  if (m.phase === 'result' && m.t >= 80) {
    m.round += 1;
    if (m.round >= m.rounds) {
      m.done = true;
      p.mini = false;
      const win = m.score.you > m.score.chad;
      world.bossHpMul = win ? 0.75 : 1.2;
      const r = world.fighters.find((f) => f.id === m.rival);
      if (r) {
        r.dead = true;
        r.removed = true;
      }
      world.events.push({ type: 'poseEnd', win, score: { ...m.score } });
    } else newRound(world, m);
  }
}

function endRound(world, m, ok) {
  if (ok) m.score.you += 1;
  else m.score.chad += 1;
  m.phase = 'result';
  m.t = 0;
  world.events.push({ type: 'poseResult', ok, score: { ...m.score } });
}

export function poseText(m) {
  const left = m.phase === 'input' ? ` · ${Math.max(0, Math.ceil((m.limit - m.t) / 60))}с` : '';
  return `Битва поз · Ты ${m.score.you} : ${m.score.chad} Гигачад · повтори WASD${left}`;
}
