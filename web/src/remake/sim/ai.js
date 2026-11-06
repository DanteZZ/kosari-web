import { ATTACK_TOKENS } from './constants.js';
import { BTN } from './input.js';
import { MOVES } from './moves.js';
import { FIGHTERS } from './fighters.js';

const FREE = new Set(['idle', 'walk']);
const DOWNED = new Set(['airhit', 'down', 'getup']);

/**
 * Crowd AI. Enemies write `cmd` bits exactly like a player would, so they go
 * through the same movement/attack code.
 *
 * Crowd rule: only ATTACK_TOKENS enemies per player may "engage" (walk in and
 * swing). The rest hover on a ring around the player and wait their turn —
 * so a crowd surrounds you without everyone hitting at once.
 *
 * Modes: approach → engage (holds a token) → recover → retreat → approach.
 */
export function thinkAll(world) {
  const players = world.players();
  const engaged = new Map(players.map((p) => [p.id, 0]));
  /** Per target: how many enemies hold the left (-1) / right (+1) side. */
  const sides = new Map(players.map((p) => [p.id, { '-1': 0, '1': 0 }]));

  for (const e of world.fighters) {
    if (!e.ai || e.dead) continue;
    if (e.ai.mode === 'engage' && engaged.has(e.ai.target)) {
      engaged.set(e.ai.target, engaged.get(e.ai.target) + 1);
    }
    if (e.ai.side && sides.has(e.ai.target)) sides.get(e.ai.target)[e.ai.side] += 1;
  }

  // Rank waiting enemies per side by distance: rank 0 stands closest, the rest
  // queue further out — a readable ring instead of one big blob.
  const queues = new Map();
  for (const e of world.fighters) {
    if (!e.ai || e.dead || !e.ai.side || e.ai.mode === 'engage') continue;
    const t = players.find((p) => p.id === e.ai.target);
    if (!t) continue;
    const key = `${t.id}:${e.ai.side}`;
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push({ e, d: Math.abs(e.x - t.x) });
  }
  for (const q of queues.values()) {
    q.sort((a, b) => a.d - b.d);
    q.forEach((it, i) => {
      it.e.ai.rank = i;
    });
  }

  for (const e of world.fighters) {
    if (!e.ai || e.dead) continue;
    think(world, e, players, engaged, sides);
  }
}

function nearest(e, players) {
  let best = null;
  let bestD = Infinity;
  for (const p of players) {
    const d = Math.abs(p.x - e.x) + Math.abs(p.z - e.z) * 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function think(world, e, players, engaged, sides) {
  const ai = e.ai;
  const cfg = FIGHTERS[e.kind].ai;
  const rng = world.rng;
  e.cmd = 0;

  if (DOWNED.has(e.state) || e.state === 'hitstun' || e.state === 'grabbed') {
    if (ai.mode === 'engage') {
      engaged.set(ai.target, Math.max(0, (engaged.get(ai.target) || 1) - 1));
    }
    ai.mode = 'approach';
    ai.cd = Math.max(ai.cd, 25);
    return;
  }

  let t = players.find((p) => p.id === ai.target);
  if (!t || world.tick % 30 === e.id % 30) {
    const n = nearest(e, players);
    if (n && n.id !== ai.target) {
      if (ai.mode === 'engage') {
        engaged.set(ai.target, Math.max(0, (engaged.get(ai.target) || 1) - 1));
        ai.mode = 'approach';
      }
      ai.target = n.id;
      t = n;
    }
  }
  if (!t) {
    e.faceX = null;
    return;
  }

  e.faceX = t.x;
  if (!FREE.has(e.state)) {
    if (e.state === 'attack' && ai.mode === 'engage') ai.mode = 'recover';
    return;
  }

  if (ai.cd > 0) ai.cd -= 1;
  if (ai.timer > 0) ai.timer -= 1;

  // Each enemy holds a side of its target; crowded side sends someone around
  // the back/front of the player so the crowd surrounds instead of queueing.
  const cur = Math.sign(e.x - t.x) || (e.id % 2 ? 1 : -1);
  if (!ai.side) ai.side = cur;
  const tally = sides.get(t.id);
  if (tally && ai.mode === 'approach' && world.tick % 45 === e.id % 45) {
    const mine = tally[ai.side];
    const other = tally[-ai.side];
    if (mine > other + 1 && rng.chance(0.5)) {
      tally[ai.side] -= 1;
      ai.side = -ai.side;
      tally[ai.side] += 1;
    }
  }
  const side = ai.side;
  const crossing = cur !== side && Math.abs(e.x - t.x) < 160;
  const move = MOVES[FIGHTERS[e.kind].moves.light];
  let goalX = e.x;
  let goalZ = e.z;
  let press = 0;

  switch (ai.mode) {
    case 'approach': {
      const rank = ai.rank || 0;
      goalX = t.x + side * (cfg.standoff + rank * 62 + ai.offX * 0.5);
      // Alternate ranks above/below the player's depth line
      goalZ = t.z + (rank % 2 ? -1 : 1) * Math.min(60, 18 + rank * 14) + ai.offZ * 0.3;
      const near = Math.abs(e.x - goalX) < 90;
      const free = (engaged.get(t.id) || 0) < ATTACK_TOKENS;
      if (free && ai.cd <= 0 && (near || Math.abs(e.x - t.x) < cfg.standoff + 60) && rng.chance(cfg.aggression * 0.08)) {
        ai.mode = 'engage';
        ai.timer = 200;
        engaged.set(t.id, (engaged.get(t.id) || 0) + 1);
      }
      break;
    }
    case 'engage': {
      const reach = (move.reach[0] + move.reach[1]) / 2;
      goalX = t.x + side * reach;
      goalZ = t.z;
      const dx = Math.abs(e.x - t.x);
      const dz = Math.abs(e.z - t.z);
      if (dx >= move.reach[0] + 10 && dx <= move.reach[1] - 6 && dz < move.depth * 0.6) {
        press = BTN.LIGHT;
        ai.mode = 'recover';
      } else if (ai.timer <= 0) {
        ai.mode = 'approach';
        ai.cd = rng.int(20, 50);
        engaged.set(t.id, Math.max(0, (engaged.get(t.id) || 1) - 1));
      }
      break;
    }
    case 'recover':
      // Swing finished (we're free again) → back off
      ai.mode = 'retreat';
      ai.timer = rng.int(cfg.retreat[0], cfg.retreat[1]);
      goalX = t.x + side * (cfg.standoff + 30);
      goalZ = e.z;
      break;
    case 'retreat':
      goalX = t.x + side * (cfg.standoff + 30);
      goalZ = t.z + ai.offZ;
      if (ai.timer <= 0) {
        ai.mode = 'approach';
        ai.cd = rng.int(cfg.attackCd[0], cfg.attackCd[1]);
        if (rng.chance(0.5)) {
          ai.offX = rng.range(-40, 40);
          ai.offZ = rng.range(-70, 70);
        }
      }
      break;
    default:
      ai.mode = 'approach';
  }

  if (crossing && ai.mode !== 'engage') {
    // Walk around the player along the depth axis
    const around = e.z <= t.z ? -1 : 1;
    goalZ = t.z + around * 80;
    if (Math.abs(e.z - t.z) < 50) goalX = e.x;
  }
  const dx = goalX - e.x;
  const dz = goalZ - e.z;
  let bits = press;
  if (dx < -10) bits |= BTN.LEFT;
  else if (dx > 10) bits |= BTN.RIGHT;
  if (dz < -6) bits |= BTN.UP;
  else if (dz > 6) bits |= BTN.DOWN;
  e.cmd = bits;
}
