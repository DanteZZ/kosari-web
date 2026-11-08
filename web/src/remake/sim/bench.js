import { BTN } from './input.js';

/**
 * Gym: a bench-press contest with Руки базуки (arena `mini: { type: 'bench',
 * ticks, notes }`). Notes slide along a track into the ring: press J or K
 * (whichever the note shows) right on the beat. Three good hits = one rep,
 * a miss lets the bar sink. Out-lift Руки before time runs out → the protein
 * buff for the rest of the map.
 *
 * world.mini = { type: 'bench', t, notes: [{ at, key, hit }], reps, rivalReps, prog, ... }
 */

export const TRAVEL = 90;
/** Which button each note letter wants. */
export const KEY_BITS = { J: BTN.LIGHT, K: BTN.HEAVY, W: BTN.UP, A: BTN.LEFT, S: BTN.DOWN, D: BTN.RIGHT };
const PERFECT = 7;
const OK = 15;

export function startBench(world, b, cfg) {
  const p = world.players()[0];
  const total = cfg.ticks || 1500;
  const keys = cfg.keys || ['J', 'K'];
  const notes = [];
  // A beat every 30 ticks, with some doubles and rests
  let at = 120;
  while (at < total - 40) {
    notes.push({ at, key: keys[world.rng.int(0, keys.length - 1)], hit: null });
    at += world.rng.chance(0.2) ? 15 : world.rng.chance(0.15) ? 60 : 30;
  }
  const mx = b.left + (b.right - b.left) * 0.4;
  const rival = world.spawn(cfg.rival || 'rival', mx + 260, (world.bounds.zMin + world.bounds.zMax) / 2 - 30, { facing: -1 });
  world.mini = {
    type: 'bench',
    cfg,
    keys,
    t: 0,
    total,
    notes,
    reps: 0,
    prog: 0,
    rivalReps: 0,
    rivalT: 100,
    rival: rival.id,
    x: mx - 260,
    streak: 0,
    done: false,
  };
  if (p) {
    p.mini = true;
    p.x = p.px = mx - 260;
    p.z = p.pz = rival.z;
    p.facing = 1;
  }
  world.events.push({ type: 'benchStart', ticks: total, rap: !!cfg.rap });
}

export function preBench(world) {
  const m = world.mini;
  const p = world.players()[0];
  if (!m || m.done || !p) return;
  m.pressed = p.cmd & ~(m.prevCmd || 0);
  m.prevCmd = p.cmd;
  p.cmd = 0;
  p.buf = { btn: 0, t: 0 };
}

function judge(world, m, key) {
  // The closest open note to now
  let best = null;
  for (const n of m.notes) {
    if (n.hit !== null) continue;
    const d = Math.abs(n.at - m.t);
    if (d <= OK && (!best || d < Math.abs(best.at - m.t))) best = n;
    if (n.at > m.t + OK) break;
  }
  if (!best) {
    // Pressed on nothing
    m.prog = Math.max(0, m.prog - 0.3);
    m.streak = 0;
    world.events.push({ type: 'benchHit', grade: 'miss' });
    return;
  }
  if (best.key !== key) {
    best.hit = 'miss';
    m.prog = Math.max(0, m.prog - 0.4);
    m.streak = 0;
    world.events.push({ type: 'benchHit', grade: 'wrong' });
    return;
  }
  const perfect = Math.abs(best.at - m.t) <= PERFECT;
  best.hit = perfect ? 'perfect' : 'ok';
  m.prog += perfect ? 1 : 0.6;
  m.streak += 1;
  world.events.push({ type: 'benchHit', grade: best.hit, streak: m.streak });
  if (m.prog >= 3) {
    m.prog -= 3;
    m.reps += 1;
    world.events.push({ type: 'benchRep', who: 'you', reps: m.reps });
  }
}

export function stepBench(world) {
  const m = world.mini;
  if (!m || m.type !== 'bench' || m.done) return;
  const p = world.players()[0];
  if (!p) return;
  m.t += 1;
  p.x = p.px = m.x;
  const pr = m.pressed || 0;
  m.pressed = 0;
  for (const k of m.keys) if (pr & KEY_BITS[k]) judge(world, m, k);
  // Notes that slid past the ring are misses
  for (const n of m.notes) {
    if (n.hit === null && n.at < m.t - OK) {
      n.hit = 'miss';
      m.prog = Math.max(0, m.prog - 0.4);
      m.streak = 0;
      world.events.push({ type: 'benchHit', grade: 'late' });
    }
  }
  // Руки lifts steadily — a rep every ~2.6 s
  if (--m.rivalT <= 0) {
    m.rivalT = (m.cfg.rivalEvery || 150) + world.rng.int(-20, 20);
    m.rivalReps += 1;
    world.events.push({ type: 'benchRep', who: 'rival', reps: m.rivalReps });
  }
  if (m.t >= m.total) {
    m.done = true;
    p.mini = false;
    const win = m.reps > m.rivalReps;
    const r = world.fighters.find((f) => f.id === m.rival);
    if (r) {
      r.dead = true;
      r.removed = true;
    }
    if (m.cfg.bossHp) {
      // Rap battle: the crowd decides how fresh 1Kla$ comes out
      world.bossHpMul = win ? m.cfg.bossHp : 1.15;
    } else if (win) {
      p.buffs = p.buffs || {};
      p.buffs.power = 3600;
      world._spillKosari(p.x + 80, p.z, 15, 80);
    }
    world.events.push({ type: 'benchEnd', win, reps: m.reps, rival: m.rivalReps, rap: !!m.cfg.rap });
  }
}

export function benchText(m) {
  const s = Math.max(0, Math.ceil((m.total - m.t) / 60));
  if (m.cfg.rap) return `Рэп-баттл · Ты ${m.reps} : ${m.rivalReps} 1Kla$ · ${s}с · WASD в бит`;
  return `Жим на спор · Ты ${m.reps} : ${m.rivalReps} Руки базуки · ${s}с · J/K в такт`;
}
