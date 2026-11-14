import { BTN } from './input.js';

/**
 * Highway race (map arena `race: true`): every player jumps into his own Lada
 * and drives to the end of the arena. Oncoming trucks and cars, slow cars to
 * overtake, Никиты on mopeds that ram you from behind (punch them off with J),
 * and near the end Повар's pots land on marked spots. Online it is a real
 * race: the cars start side by side, the first one at the finish wins.
 *
 * world.race = { x0, x1, cars: { [playerId]: { v, crashes, punches, punchT, done, place } },
 *                obs: [], marks: [], spawnT, finished, results: [ids], done }
 * Driving players have `driving = true` and are moved here, not by World._update.
 */

export const CAR_HW = 175;
export const CAR_HZ = 14;
const V_MIN = 9;
const V_CRUISE = 15;
const V_MAX = 22;

/** Obstacles: half sizes, speed (world px/tick), damage on a crash. */
export const OBS = {
  truck: { halfW: 390, halfZ: 20, vx: -8, dmg: 34 },
  car: { halfW: 178, halfZ: 16, vx: -6, dmg: 22 },
  slow: { halfW: 178, halfZ: 16, vx: 7, dmg: 14 },
  moped: { halfW: 100, halfZ: 12, vx: 0, dmg: 10 },
};

export function startRace(world, _first, x0, x1) {
  const ps = world.players();
  const b = world.bounds;
  const r = { x0, x1, cars: {}, obs: [], marks: [], spawnT: 90, finished: 0, results: [], done: false, nextId: 1, rr: 0 };
  world.race = r;
  // From where the car was parked; online — a grid, one car per lane
  const startX = Math.max(x0 + 120, world.entryX ?? ps[0]?.x ?? x0);
  ps.forEach((p, i) => {
    p.driving = true;
    p.state = 'idle';
    p.vx = p.vz = p.y = p.vy = 0;
    p.punchT = 0;
    p.x = p.px = startX - (i % 2) * 260;
    if (ps.length > 1) p.z = p.pz = b.zMin + CAR_HZ + ((b.zMax - b.zMin - CAR_HZ * 2) * (i + 0.5)) / ps.length;
    r.cars[p.id] = { v: V_CRUISE, crashes: 0, punches: 0, done: false, place: 0 };
  });
  world.entryX = null;
  world.events.push({ type: 'raceStart', x0, x1, n: ps.length });
}

/** The car of a fighter (or the first one still racing). */
export function carOf(r, id) {
  return r?.cars?.[id] || null;
}

function spawnObs(world, r, p, car, kind) {
  const b = world.bounds;
  const o = OBS[kind];
  const half = (world.viewW || 1920) / 2;
  const z = world.rng.range(b.zMin + o.halfZ, b.zMax - o.halfZ);
  const x = kind === 'moped' ? p.x - half - 120 : p.x + half + o.halfW + 200;
  r.obs.push({ id: r.nextId++, kind, x, z, px: x, pz: z, vx: kind === 'moped' ? car.v + 4 : o.vx, hp: 1, dead: false, ramT: 0, fall: 0, hit: [] });
}

function overlap(p, o) {
  const d = OBS[o.kind];
  return Math.abs(o.x - p.x) < CAR_HW + d.halfW - 20 && Math.abs(o.z - p.z) < CAR_HZ + d.halfZ;
}

function crash(world, p, car, dmg, x, z) {
  if (p.iframes > 0) return;
  p.hp = Math.max(1, p.hp - dmg);
  p.iframes = 50;
  car.v = V_MIN - 3;
  car.crashes += 1;
  world.hitstop = Math.max(world.hitstop, 6);
  world.events.push({ type: 'raceCrash', x, z, dmg, id: p.id });
}

/** One car: throttle, steering, the punch out of the window. */
function drive(world, r, p, car) {
  const b = world.bounds;
  const cmd = p.cmd || 0;
  const target = cmd & BTN.RIGHT ? V_MAX : cmd & BTN.LEFT ? V_MIN : V_CRUISE;
  car.v += Math.sign(target - car.v) * Math.min(Math.abs(target - car.v), target > car.v ? 0.35 : 0.6);
  p.px = p.x;
  p.pz = p.z;
  p.x += car.v;
  p.facing = 1;
  const steer = (cmd & BTN.UP ? -1 : 0) + (cmd & BTN.DOWN ? 1 : 0);
  p.z = Math.min(b.zMax - CAR_HZ, Math.max(b.zMin + CAR_HZ, p.z + steer * 3.2));
  p.vx = car.v;
  if (p.iframes > 0) p.iframes -= 1;

  if (p.punchT > 0) p.punchT -= 1;
  if (p.buf?.btn === BTN.LIGHT && p.punchT <= 0) {
    p.buf = { btn: 0, t: 0 };
    p.punchT = 16;
    world.events.push({ type: 'racePunch', id: p.id });
    for (const o of r.obs) {
      if (o.dead || o.kind !== 'moped' || o.fall) continue;
      if (Math.abs(o.x - p.x) < 270 && Math.abs(o.z - p.z) < 45) {
        o.fall = 1;
        car.punches += 1;
        world._spillKosari(o.x, o.z, 4, 40);
        world.events.push({ type: 'mopedDown', x: o.x, z: o.z });
      }
    }
  }

  if (p.x >= r.x1) {
    car.done = true;
    car.place = ++r.finished;
    r.results.push(p.id);
    p.driving = false;
    p.vx = 0;
    p.iframes = 30;
    const bonus = Math.max(0, 12 - car.crashes * 2) + car.punches * 2 + (car.place === 1 ? 10 : 0);
    if (bonus) world._spillKosari(p.x + 120, p.z, bonus, 80);
    world.events.push({ type: 'raceFinish', id: p.id, place: car.place, crashes: car.crashes, bonus });
  }
}

export function stepRace(world) {
  const r = world.race;
  if (!r || r.done) return;
  const racing = world.players().filter((f) => f.driving && r.cars[f.id] && !r.cars[f.id].done);
  if (!racing.length) {
    r.done = true;
    const first = r.cars[r.results[0]] || {};
    world.events.push({ type: 'raceEnd', results: r.results, crashes: first.crashes || 0, bonus: 0, multi: Object.keys(r.cars).length > 1 });
    return;
  }
  const b = world.bounds;
  for (const p of racing) drive(world, r, p, r.cars[p.id]);
  const live = racing.filter((p) => !r.cars[p.id].done);
  if (!live.length) return;

  // Traffic gets denser towards the end; it spawns around each car in turn
  const lead = live.reduce((a, p) => (p.x > a.x ? p : a), live[0]);
  const k = Math.min(1, (lead.x - r.x0) / (r.x1 - r.x0));
  if (--r.spawnT <= 0) {
    r.spawnT = Math.round(world.rng.range(56, 86) * (1 - k * 0.35) / Math.min(2, 1 + (live.length - 1) * 0.35));
    r.rr = (r.rr + 1) % live.length;
    const p = live[r.rr];
    const roll = world.rng.next();
    const kind = roll < 0.3 ? 'truck' : roll < 0.55 ? 'car' : roll < 0.72 ? 'slow' : 'moped';
    spawnObs(world, r, p, r.cars[p.id], kind);
  }
  if (k > 0.45 && world.tick % 75 === 0) {
    const p = live[world.tick % live.length];
    const x = p.x + r.cars[p.id].v * 55 + world.rng.range(-80, 120);
    const z = world.rng.chance(0.6) ? p.z : world.rng.range(b.zMin + 15, b.zMax - 15);
    r.marks.push({ id: r.nextId++, x, z, t: 55 });
    world.events.push({ type: 'potWarn', x, z, t: 55 });
  }

  const nearest = (o) => live.reduce((a, p) => (Math.abs(p.x - o.x) < Math.abs(a.x - o.x) ? p : a), live[0]);
  for (const o of r.obs) {
    o.px = o.x;
    o.pz = o.z;
    const p = nearest(o);
    const car = r.cars[p.id];
    if (o.fall) {
      // Knocked off: slides back and tips over
      o.fall += 1;
      o.x += car.v * 0.4;
      if (o.fall > 50) o.dead = true;
      continue;
    }
    if (o.kind === 'moped') {
      // Catch up with the nearest car, match speed and swerve into it
      const dx = p.x - 220 - o.x;
      o.vx = car.v + Math.max(-3, Math.min(8, dx * 0.05));
      o.z += Math.sign(p.z - o.z) * Math.min(1.4, Math.abs(p.z - o.z));
      if (o.ramT > 0) o.ramT -= 1;
      if (o.ramT <= 0 && overlap(p, o)) {
        o.ramT = 60;
        crash(world, p, car, OBS.moped.dmg, o.x, o.z);
      }
    }
    o.x += o.vx;
    if (o.kind !== 'moped') {
      for (const q of live) {
        if (o.hit.includes(q.id) || !overlap(q, o)) continue;
        o.hit.push(q.id);
        crash(world, q, r.cars[q.id], OBS[o.kind].dmg, (o.x + q.x) / 2, o.z);
      }
    }
    if (live.every((q) => o.x < q.x - 2600 || o.x > q.x + 3600)) o.dead = true;
  }
  r.obs = r.obs.filter((o) => !o.dead);

  for (const m of r.marks) {
    if (--m.t > 0) continue;
    m.done = true;
    world.events.push({ type: 'potLand', x: m.x, z: m.z });
    for (const q of live) {
      if (Math.abs(m.x - q.x) < CAR_HW + 30 && Math.abs(m.z - q.z) < CAR_HZ + 18) crash(world, q, r.cars[q.id], 16, m.x, m.z);
    }
  }
  r.marks = r.marks.filter((m) => !m.done);
}
