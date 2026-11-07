import { BTN } from './input.js';
import { FIGHTERS } from './fighters.js';

/**
 * Original-game bosses. They write `cmd` bits like every other fighter
 * (LIGHT / HEAVY start their throw moves), plus switch world hazards per phase.
 */

const FREE = new Set(['idle', 'walk']);

function nearest(e, players) {
  let best = null;
  let bd = Infinity;
  for (const p of players) {
    const d = Math.abs(p.x - e.x);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function steer(e, goalX, goalZ, dead = 24) {
  let bits = 0;
  if (goalX < e.x - dead) bits |= BTN.LEFT;
  else if (goalX > e.x + dead) bits |= BTN.RIGHT;
  if (goalZ < e.z - 10) bits |= BTN.UP;
  else if (goalZ > e.z + 10) bits |= BTN.DOWN;
  return bits;
}

function wanderZ(world, e) {
  const ai = e.ai;
  if (!ai.zT || --ai.zT <= 0) {
    ai.zT = world.rng.int(90, 180);
    ai.goalZ = world.rng.range(world.bounds.zMin + 15, world.bounds.zMax - 15);
  }
  return ai.goalZ;
}

/** Spawn backup from both arena edges (used on boss phase changes). */
function backup(world, kinds) {
  const pb = world.playerBounds || world.bounds;
  kinds.forEach((k, i) => {
    const side = i % 2 ? -1 : 1;
    const x = side > 0 ? pb.xMax + 120 + i * 40 : pb.xMin - 120 - i * 40;
    world.spawn(k, x, world.rng.range(world.bounds.zMin + 10, world.bounds.zMax - 10), { facing: -side });
  });
}

/**
 * Влад Борщ: keeps his distance, lobs bombs on a timer, faster each life.
 * Phase hazards: anvils always, airship from life 2, backup when hurt.
 */
function borsch(world, e, players) {
  const ai = e.ai;
  e.cmd = 0;
  const t = nearest(e, players);
  if (!t) return;
  e.faceX = t.x;
  const def = FIGHTERS[e.kind];
  const lives = def.hp;
  const phase = Math.min(3, Math.max(1, lives + 1 - Math.max(1, e.hp)));
  if (def.hazards !== false) {
    world.anvilEvery = [[230, 340], [170, 260], [120, 200]][phase - 1];
    world.airshipEvery = phase >= 2 ? [600, 900] : null;
  }
  if (ai.lastHp == null) ai.lastHp = e.hp;
  if (e.hp < ai.lastHp) {
    ai.lastHp = e.hp;
    backup(world, phase === 2 ? ['nikita', 'nikita', 'buiniy'] : ['nikita', 'buiniy', 'nikita', 'runner']);
  }
  if (!FREE.has(e.state)) return;

  const pb = world.playerBounds || world.bounds;
  const side = e.x >= t.x ? 1 : -1;
  let goalX = t.x + side * 430;
  if (goalX > pb.xMax - 70 || goalX < pb.xMin + 70) goalX = t.x - side * 430;
  goalX = Math.min(pb.xMax - 70, Math.max(pb.xMin + 70, goalX));
  let bits = steer(e, goalX, wanderZ(world, e), 30);

  if (ai.cd == null) ai.cd = 60;
  if (--ai.cd <= 0) {
    bits |= BTN.LIGHT;
    ai.cd = [92, 72, 54][phase - 1] + world.rng.int(0, 30);
  }
  e.cmd = bits;
}

/**
 * Повар: holds one side of the arena (right, left, right), alternates pots
 * and pans. When a phase's HP runs out he walks off, forks rain, and he comes
 * back from the other side with the next phase.
 */
function povar(world, e, players) {
  const ai = e.ai;
  const def = FIGHTERS[e.kind];
  e.cmd = 0;
  const pb = world.playerBounds || world.bounds;
  const t = nearest(e, players);
  const home = e.phase === 2 ? -1 : 1;

  if (e.retreating && !e.away) {
    // Walk off-screen on his side
    // Off past the arena edge (the map edge may come first — then he hides there)
    const W = world.bounds;
    const exitX = home > 0 ? Math.min(pb.xMax + 260, W.xMax - 32) : Math.max(pb.xMin - 260, W.xMin + 32);
    e.faceX = null;
    if (FREE.has(e.state)) e.cmd = steer(e, exitX, e.z, 12);
    if ((home > 0 && e.x >= exitX - 20) || (home < 0 && e.x <= exitX + 20)) {
      e.away = true;
      world.forkRainT = 600;
      world.events.push({ type: 'forkRain', id: e.id });
    }
    return;
  }
  if (e.away) {
    if (world.forkRainT > 0) return;
    // Back for the next phase from the other side
    e.phase += 1;
    e.hp = e.maxHp = def.phases[e.phase - 1];
    e.retreating = false;
    e.away = false;
    e.iframes = 0;
    const nh = e.phase === 2 ? -1 : 1;
    e.x = nh > 0 ? pb.xMax + 160 : pb.xMin - 160;
    world.events.push({ type: 'bossReturn', id: e.id, phase: e.phase });
    if (e.phase === 3) backup(world, ['nikita', 'buiniy']);
    return;
  }
  if (!t) return;
  e.faceX = t.x;
  if (!FREE.has(e.state)) return;

  const goalX = home > 0 ? pb.xMax - 150 : pb.xMin + 150;
  let bits = steer(e, goalX, wanderZ(world, e), 30);
  if (ai.cd == null) ai.cd = 70;
  if (--ai.cd <= 0) {
    ai.flip = !ai.flip;
    // Pans only skim along the lane — use them when lined up
    const lined = Math.abs(t.z - e.z) < 18;
    bits |= ai.flip && lined ? BTN.HEAVY : BTN.LIGHT;
    ai.cd = [[100, 130], [76, 104], [58, 86]][e.phase - 1].reduce((a, b) => world.rng.int(a, b));
  }
  e.cmd = bits;
}

export const BOSS_AI = { borsch, povar };
