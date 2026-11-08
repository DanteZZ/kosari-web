/**
 * Museum: sneak past the guards behind the crates (arena `mini: { type:
 * 'stealth', guards }`). Guards walk their beat and look ahead (red cone on
 * the floor). Standing right behind a crate stack — with the stack between
 * you and the guard — hides you. Seen for too long → «Тревога!»: the guards
 * fight and the arena's waves come. Reach the exit unseen → косари and the
 * arena is skipped.
 *
 * world.mini = { type: 'stealth', guards: [ids], covers: [{ x }], exitX, seen, alarm }
 */

export const VIEW = 470;
const SEE_T = 45;

/** Does guard g see the point (x, z)? (cone ahead, blocked by crate stacks) */
export function guardSees(m, g, x, z) {
  const dx = (x - g.x) * g.facing;
  if (dx < 0 || dx > VIEW) return false;
  if (Math.abs(z - g.z) > 50 + dx * 0.3) return false;
  // A stack between us, and you pressed up against it
  for (const c of m.covers) {
    const between = (c.x - g.x) * g.facing > 0 && (x - c.x) * g.facing > 0;
    if (between && Math.abs(x - c.x) < 240) return false;
  }
  return true;
}

export function startStealth(world, b, cfg) {
  const p = world.players()[0];
  const n = cfg.guards || 3;
  const covers = [];
  const guards = [];
  const span = b.right - b.left - 700;
  for (let i = 0; i < n; i += 1) {
    const x0 = b.left + 450 + (span * (i + 0.15)) / n;
    const x1 = x0 + span / n - 260;
    covers.push({ x: x0 - 90 });
    covers.push({ x: (x0 + x1) / 2 + 40 });
    const z = world.rng.range(world.bounds.zMin + 40, world.bounds.zMax - 40);
    const g = world.spawn('guard', x1, z, { facing: -1 });
    g.patrol = { x0, x1, dir: -1, wait: 0 };
    guards.push(g.id);
  }
  world.mini = {
    type: 'stealth',
    guards,
    covers,
    exitX: b.right - 160,
    seen: 0,
    alarm: false,
    done: false,
    skipWaves: false,
  };
  if (p) p.x = p.px = b.left + 200;
  world.events.push({ type: 'stealthStart', covers: covers.map((c) => c.x), exitX: world.mini.exitX });
}

export function stepStealth(world) {
  const m = world.mini;
  if (!m || m.type !== 'stealth' || m.done) return;
  const p = world.players()[0];
  if (!p) return;
  const gs = m.guards.map((id) => world.fighters.find((f) => f.id === id)).filter((g) => g && !g.dead);
  // A knocked-out guard is fine — if nobody saw it
  let seenNow = false;
  for (const g of gs) {
    if (g.state !== 'idle' && g.state !== 'walk') continue;
    if (guardSees(m, g, p.x, p.z)) seenNow = true;
  }
  m.seen = seenNow ? m.seen + 1 : Math.max(0, m.seen - 2);
  m.seenK = m.seen / SEE_T;
  if (m.seen >= SEE_T) {
    m.alarm = true;
    m.done = true;
    for (const g of gs) g.alarm = true;
    world.events.push({ type: 'stealthAlarm', x: p.x, z: p.z });
    return;
  }
  if (p.x >= m.exitX) {
    m.done = true;
    m.skipWaves = true;
    for (const g of gs) {
      g.dead = true;
      g.removed = true;
    }
    world._spillKosari(p.x, p.z, 20, 80);
    world.events.push({ type: 'stealthDone' });
  }
}

/** Guard brain (FIGHTERS.guard.bossAI): walks the beat; after the alarm, fights. */
export function guardBrain(world, e, players) {
  e.cmd = 0;
  const t = players[0];
  if (!t) return;
  if (e.alarm || !world.mini || world.mini.type !== 'stealth') {
    // Fight: walk up and punch
    e.speedMul = 1;
    e.faceX = t.x;
    if (e.state !== 'idle' && e.state !== 'walk') return;
    const dx = t.x - e.x;
    const dz = t.z - e.z;
    if (Math.abs(dx) < 110 && Math.abs(dz) < 24) {
      if (world.rng.chance(0.05)) e.cmd = 32;
      return;
    }
    e.cmd = (dx < -80 ? 1 : dx > 80 ? 2 : 0) | (dz < -6 ? 4 : dz > 6 ? 8 : 0);
    return;
  }
  const pt = e.patrol;
  // Walks the beat slowly
  e.speedMul = 0.45;
  if (!pt || (e.state !== 'idle' && e.state !== 'walk')) return;
  e.faceX = null;
  if (pt.wait > 0) {
    // Looks around at the end of the beat
    pt.wait -= 1;
    return;
  }
  const goal = pt.dir > 0 ? pt.x1 : pt.x0;
  if (Math.abs(goal - e.x) < 12) {
    pt.dir = -pt.dir;
    pt.wait = 70;
    e.facing = pt.dir;
    return;
  }
  e.cmd = goal > e.x ? 2 : 1;
}

export function stealthText(m) {
  return m.seen > 0 ? `Тебя замечают! ${Math.round(m.seenK * 100)}%` : 'Проберись к выходу за ящиками · не попадайся в красное';
}
