import { BTN } from './input.js';

/**
 * Highway race (map arena `race: true`): the hero jumps into a Lada and drives
 * to the end of the arena. Oncoming trucks and cars, slow cars to overtake,
 * Никиты on mopeds that ram you from behind (punch them off with J), and near
 * the end Повар's pots land on marked spots.
 *
 * world.race = { x0, x1, v, obs: [], marks: [], spawnT, crashes, done }
 * The driving player has `driving = true` and is moved here, not by World._update.
 */

export const CAR_HW = 118;
export const CAR_HZ = 24;
const V_MIN = 9;
const V_CRUISE = 15;
const V_MAX = 22;

/** Obstacles: half sizes, speed (world px/tick), damage on a crash. */
export const OBS = {
  truck: { halfW: 250, halfZ: 34, vx: -8, dmg: 34 },
  car: { halfW: 118, halfZ: 26, vx: -6, dmg: 22 },
  slow: { halfW: 118, halfZ: 26, vx: 7, dmg: 14 },
  moped: { halfW: 70, halfZ: 22, vx: 0, dmg: 10 },
};

export function startRace(world, p, x0, x1) {
  world.race = { x0, x1, v: V_CRUISE, obs: [], marks: [], spawnT: 90, crashes: 0, punches: 0, done: false, nextId: 1 };
  p.driving = true;
  p.state = 'idle';
  p.vx = 0;
  p.vz = 0;
  p.y = 0;
  p.vy = 0;
  p.punchT = 0;
  p.x = x0 + 120;
  p.px = p.x;
  world.events.push({ type: 'raceStart', x0, x1 });
}

function spawnObs(world, r, p, kind) {
  const b = world.bounds;
  const o = OBS[kind];
  const half = (world.viewW || 1920) / 2;
  const z = world.rng.range(b.zMin + o.halfZ, b.zMax - o.halfZ);
  let x;
  if (kind === 'moped') x = p.x - half - 120;
  else x = p.x + half + o.halfW + 200;
  r.obs.push({ id: r.nextId++, kind, x, z, px: x, pz: z, vx: kind === 'moped' ? r.v + 4 : o.vx, hp: 1, dead: false, ramT: 0, fall: 0 });
}

function overlap(p, o) {
  const d = OBS[o.kind];
  return Math.abs(o.x - p.x) < CAR_HW + d.halfW - 20 && Math.abs(o.z - p.z) < CAR_HZ + d.halfZ;
}

function crash(world, r, p, dmg, x, z) {
  if (p.iframes > 0) return;
  p.hp = Math.max(1, p.hp - dmg);
  p.iframes = 50;
  r.v = V_MIN - 3;
  r.crashes += 1;
  world.hitstop = Math.max(world.hitstop, 6);
  world.events.push({ type: 'raceCrash', x, z, dmg });
}

export function stepRace(world) {
  const r = world.race;
  if (!r || r.done) return;
  const p = world.players().find((f) => f.driving);
  if (!p) return;
  const b = world.bounds;
  const cmd = p.cmd || 0;

  // Throttle / brake, steering across the lanes
  const target = cmd & BTN.RIGHT ? V_MAX : cmd & BTN.LEFT ? V_MIN : V_CRUISE;
  r.v += Math.sign(target - r.v) * Math.min(Math.abs(target - r.v), target > r.v ? 0.35 : 0.6);
  p.px = p.x;
  p.pz = p.z;
  p.x += r.v;
  p.facing = 1;
  const steer = (cmd & BTN.UP ? -1 : 0) + (cmd & BTN.DOWN ? 1 : 0);
  p.z = Math.min(b.zMax - CAR_HZ, Math.max(b.zMin + CAR_HZ, p.z + steer * 5.5));
  p.vx = r.v;
  if (p.iframes > 0) p.iframes -= 1;

  // J: punch out of the window
  if (p.punchT > 0) p.punchT -= 1;
  if (p.buf?.btn === BTN.LIGHT && p.punchT <= 0) {
    p.buf = { btn: 0, t: 0 };
    p.punchT = 16;
    world.events.push({ type: 'racePunch', id: p.id });
    for (const o of r.obs) {
      if (o.dead || o.kind !== 'moped' || o.fall) continue;
      if (Math.abs(o.x - p.x) < 190 && Math.abs(o.z - p.z) < 80) {
        o.fall = 1;
        r.punches += 1;
        world._spillKosari(o.x, o.z, 4, 40);
        world.events.push({ type: 'mopedDown', x: o.x, z: o.z });
      }
    }
  }

  // Traffic gets denser towards the end; Повар's pots near the shawarma
  const k = Math.min(1, (p.x - r.x0) / (r.x1 - r.x0));
  if (--r.spawnT <= 0) {
    r.spawnT = Math.round(world.rng.range(44, 70) * (1 - k * 0.35));
    const roll = world.rng.next();
    const kind = roll < 0.3 ? 'truck' : roll < 0.55 ? 'car' : roll < 0.72 ? 'slow' : 'moped';
    spawnObs(world, r, p, kind);
  }
  if (k > 0.45 && world.tick % 75 === 0) {
    const x = p.x + r.v * 55 + world.rng.range(-80, 120);
    const z = world.rng.chance(0.6) ? p.z : world.rng.range(b.zMin + 30, b.zMax - 30);
    r.marks.push({ id: r.nextId++, x, z, t: 55 });
    world.events.push({ type: 'potWarn', x, z, t: 55 });
  }

  for (const o of r.obs) {
    o.px = o.x;
    o.pz = o.z;
    if (o.fall) {
      // Knocked off: slides back and tips over
      o.fall += 1;
      o.x += r.v * 0.4;
      if (o.fall > 50) o.dead = true;
      continue;
    }
    if (o.kind === 'moped') {
      // Catch up, then match speed and swerve into the car
      const dx = p.x - 150 - o.x;
      o.vx = r.v + Math.max(-3, Math.min(8, dx * 0.05));
      o.z += Math.sign(p.z - o.z) * Math.min(2.4, Math.abs(p.z - o.z));
      if (o.ramT > 0) o.ramT -= 1;
      if (o.ramT <= 0 && overlap(p, o)) {
        o.ramT = 60;
        crash(world, r, p, OBS.moped.dmg, o.x, o.z);
      }
    }
    o.x += o.vx;
    if (o.kind !== 'moped' && !o.hitDone && overlap(p, o)) {
      o.hitDone = true;
      crash(world, r, p, OBS[o.kind].dmg, (o.x + p.x) / 2, o.z);
    }
    if (o.x < p.x - 2600 || o.x > p.x + 3600) o.dead = true;
  }
  r.obs = r.obs.filter((o) => !o.dead);

  for (const m of r.marks) {
    if (--m.t > 0) continue;
    m.done = true;
    world.events.push({ type: 'potLand', x: m.x, z: m.z });
    if (Math.abs(m.x - p.x) < CAR_HW + 30 && Math.abs(m.z - p.z) < CAR_HZ + 30) crash(world, r, p, 16, m.x, m.z);
  }
  r.marks = r.marks.filter((m) => !m.done);

  if (p.x >= r.x1) {
    r.done = true;
    p.driving = false;
    p.vx = 0;
    p.iframes = 30;
    const bonus = Math.max(0, 12 - r.crashes * 2) + r.punches * 2;
    if (bonus) world._spillKosari(p.x + 120, p.z, bonus, 80);
    world.events.push({ type: 'raceEnd', crashes: r.crashes, bonus });
  }
}
