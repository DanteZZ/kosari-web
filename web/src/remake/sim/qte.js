import { FIGHTERS } from './fighters.js';
import { KEY_BITS } from './bench.js';

/**
 * Mid-fight QTE (God of War style): when a boss with `qte` in his def drops
 * below the threshold, the world stops, the camera closes in on both of you
 * and buttons come up one by one — press each before its ring closes.
 * All hit → a brutal finisher chunk off his health; a miss → he throws you.
 *
 * FIGHTERS.<boss>.qte = { at: [0.5, 0.2], len: 5, dmg: 0.22 }
 * world.qte = { boss, seq, i, t, win, done }
 */

const KEYS = ['J', 'K', 'W', 'A', 'S', 'D'];

export function stepQteTrigger(world) {
  if (world.qte) return;
  const p = world.players()[0];
  if (!p || p.dead) return;
  for (const f of world.fighters) {
    const q = FIGHTERS[f.kind]?.qte;
    if (!q || f.dead || f.away || f.waiting || f.y > 0) continue;
    f.qteDone = f.qteDone || 0;
    const at = q.at[f.qteDone];
    if (at == null || f.hp / f.maxHp > at) continue;
    if (Math.abs(f.x - p.x) > 700) continue;
    f.qteDone += 1;
    const len = (q.len || 5) + f.qteDone - 1;
    const seq = [];
    for (let i = 0; i < len; i += 1) seq.push(KEYS[world.rng.int(0, KEYS.length - 1)]);
    world.qte = { boss: f.id, seq, i: 0, t: 0, win: 70 - f.qteDone * 8, done: false, intro: 50, dmg: q.dmg || 0.2 };
    world.events.push({ type: 'qteStart', boss: f.id, x: f.x, z: f.z, px: p.x, pz: p.z, len });
    return;
  }
}

/** Before input is latched: read the QTE buttons, nobody else moves. */
export function preQte(world) {
  const q = world.qte;
  const p = world.players()[0];
  if (!q || !p) return;
  q.pressed = p.cmd & ~(q.prevCmd || 0);
  q.prevCmd = p.cmd;
  p.cmd = 0;
  p.buf = { btn: 0, t: 0 };
}

/** Runs instead of the fight while a QTE is up. Returns true while it lasts. */
export function stepQte(world) {
  const q = world.qte;
  if (!q) return false;
  const p = world.players()[0];
  const b = world.fighters.find((f) => f.id === q.boss);
  if (!p || !b || b.dead) {
    world.qte = null;
    return false;
  }
  if (q.done) {
    if (--q.outT > 0) return true;
    world.qte = null;
    return false;
  }
  if (q.intro > 0) {
    q.intro -= 1;
    if (q.intro === 0) world.events.push({ type: 'qteKey', key: q.seq[0], i: 0, win: q.win });
    q.pressed = 0;
    return true;
  }
  q.t += 1;
  const pr = q.pressed || 0;
  q.pressed = 0;
  const want = KEY_BITS[q.seq[q.i]];
  const wrong = pr && !(pr & want) && Object.values(KEY_BITS).some((bit) => pr & bit);
  if (pr & want) {
    world.events.push({ type: 'qteHit', i: q.i, key: q.seq[q.i] });
    q.i += 1;
    q.t = 0;
    if (q.i >= q.seq.length) return finish(world, q, p, b, true);
    world.events.push({ type: 'qteKey', key: q.seq[q.i], i: q.i, win: q.win });
  } else if (wrong || q.t > q.win) {
    return finish(world, q, p, b, false);
  }
  return true;
}

function finish(world, q, p, b, ok) {
  q.done = true;
  q.outT = 40;
  if (ok) {
    // Straight off his health (front-only / parry rules don't apply to a finisher)
    b.hp = Math.max(1, b.hp - Math.round(b.maxHp * q.dmg));
    world._applyHit(p, b, { dmg: 1, kb: 14, launch: 12, knockdown: true, hitstop: 14, heavy: true, special: true }, { x: p.x, facing: Math.sign(b.x - p.x) || 1 });
  } else {
    world._applyHit(b, p, { dmg: Math.round(p.maxHp * 0.12), kb: 14, launch: 10, knockdown: true, hitstop: 12, heavy: true }, { x: b.x, facing: Math.sign(p.x - b.x) || 1 });
  }
  world.events.push({ type: 'qteEnd', ok, boss: b.id });
  return true;
}
