/**
 * Dacha basement horror (map arena `dark: { fuses: n }`): the lights are out,
 * the hero has a flashlight. Find the fuses (walk onto them) to switch the
 * light back on. Пахом's shadow stalks you in the dark: while he is in the
 * flashlight's beam he freezes — turn round and look at him. Hit him and he
 * vanishes in a puff, only to come back. When he gets you — a scream and damage.
 * Once the light is back on, the arena's normal waves begin.
 *
 * world.torch = { fuses: [{ x, z, got }], need, got, shade, done }
 */

/** Is (x, z) inside player p's flashlight beam? */
export function inBeam(p, x, z) {
  const dx = (x - p.x) * p.facing;
  if (dx < -40 || dx > 660) return false;
  return Math.abs(z - p.z) < 70 + Math.max(0, dx) * 0.32;
}

export const FUSE_T = 50;

export function startTorch(world, b, cfg) {
  const n = cfg.fuses || 3;
  const fuses = [];
  const zMid = (world.bounds.zMin + world.bounds.zMax) / 2;
  for (let i = 0; i < n; i += 1) {
    const x = b.left + 420 + ((b.right - b.left - 700) * (i + 0.6)) / n;
    const z = i % 2 ? world.bounds.zMin + 30 : world.bounds.zMax - 30;
    fuses.push({ id: i, x: x + world.rng.range(-120, 120), z: i === 1 ? zMid : z, got: false });
  }
  const p = world.players()[0];
  const shade = world.spawn('shade', (p ? p.x : b.left) + 1100, zMid, { facing: -1 });
  world.torch = { fuses, need: n, got: 0, shade: shade.id, done: false, b };
  world.setDark(true);
  world.events.push({ type: 'torchStart', fuses: fuses.map((f) => ({ id: f.id, x: f.x, z: f.z })) });
}

export function stepTorch(world) {
  const t = world.torch;
  if (!t || t.done) return;
  for (const p of world.players()) {
    for (const f of t.fuses) {
      if (f.got) continue;
      // Unscrewing the fuse takes a moment of standing still next to it
      const near = Math.abs(f.x - p.x) < 70 && Math.abs(f.z - p.z) < 44 && p.state === 'idle';
      f.prog = near ? (f.prog || 0) + 1 : Math.max(0, (f.prog || 0) - 2);
      if (f.prog < FUSE_T) continue;
      f.got = true;
      t.got += 1;
      world.events.push({ type: 'fuseGot', id: f.id, x: f.x, z: f.z, got: t.got, need: t.need });
    }
  }
  if (t.got >= t.need) {
    t.done = true;
    world.setDark(false);
    const s = world.fighters.find((f) => f.id === t.shade);
    if (s) {
      world.events.push({ type: 'puff', x: s.x, z: s.z });
      s.dead = true;
      s.removed = true;
    }
    world.events.push({ type: 'torchDone' });
  }
}

/** Brain of Пахом's shadow (FIGHTERS.shade.bossAI). */
export function shadeBrain(world, e, players) {
  e.cmd = 0;
  const t = world.torch;
  const p = players[0];
  if (!t || !p) return;
  const b = t.b;
  const vanish = (side) => {
    world.events.push({ type: 'puff', x: e.x, z: e.z });
    e.x = Math.min(b.right - 80, Math.max(b.left + 80, p.x + side * world.rng.range(800, 1000)));
    e.px = e.x;
    e.z = world.rng.range(world.bounds.zMin + 20, world.bounds.zMax - 20);
    e.pz = e.z;
    e.hp = e.maxHp;
    e.state = 'idle';
    e.st = 0;
    e.y = 0;
    e.vy = 0;
    e.vx = 0;
    e.lurkT = 120;
    world.events.push({ type: 'puff', x: e.x, z: e.z });
  };
  // Hit → poof, he reappears behind the hero
  if (['hitstun', 'airhit', 'down', 'getup', 'grabbed'].includes(e.state)) {
    if (e.state === 'grabbed') {
      const g = world.fighters.find((f) => f.id === e.heldBy);
      if (g) g.state = 'idle';
      e.heldBy = null;
    }
    vanish(-p.facing);
    world.events.push({ type: 'shadeBanished' });
    return;
  }
  if (e.lurkT > 0) {
    e.lurkT -= 1;
    return;
  }
  const lit = inBeam(p, e.x, e.z);
  e.lit = lit;
  if (lit) {
    if (!e.wasLit) world.events.push({ type: 'shadeLit', id: e.id });
    e.wasLit = true;
    e.faceX = p.x;
    return;
  }
  e.wasLit = false;
  e.faceX = p.x;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  if (Math.abs(dx) < 70 && Math.abs(dz) < 30) {
    // Got you
    world._applyHit(e, p, { dmg: 22, kb: 10, knockdown: true, hitstop: 10, heavy: true });
    world.events.push({ type: 'shadeScare', x: p.x, z: p.z });
    vanish(world.rng.chance(0.5) ? 1 : -1);
    return;
  }
  e.cmd = (dx < -10 ? 1 : dx > 10 ? 2 : 0) | (dz < -6 ? 4 : dz > 6 ? 8 : 0);
}
