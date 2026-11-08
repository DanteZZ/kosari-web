/**
 * Stream house: you are live (map `style: true`). Viewers watch the style
 * meter: varied moves, hits on enemies in the air and knockouts raise it,
 * repeating the same move or taking hits drops it, and it slowly drains.
 * Ranks D → C → B → A → S → SSS; from A up the chat donates (косари rain
 * on you), and the viewer count climbs.
 *
 * world.style = { meter, rank, viewers, last, donateT }
 */

export const RANKS = [
  { at: 0, r: 'D' },
  { at: 20, r: 'C' },
  { at: 40, r: 'B' },
  { at: 60, r: 'A' },
  { at: 80, r: 'S' },
  { at: 95, r: 'SSS' },
];

function rankOf(meter) {
  let r = RANKS[0].r;
  for (const k of RANKS) if (meter >= k.at) r = k.r;
  return r;
}

export function startStyle(world) {
  world.style = { meter: 0, rank: 'D', viewers: 120, last: null, repeat: 0, donateT: 300 };
}

function bump(world, d) {
  const s = world.style;
  s.meter = Math.max(0, Math.min(100, s.meter + d));
  const r = rankOf(s.meter);
  if (r !== s.rank) {
    const up = RANKS.findIndex((k) => k.r === r) > RANKS.findIndex((k) => k.r === s.rank);
    s.rank = r;
    world.events.push({ type: 'styleRank', rank: r, up });
  }
}

/** A player's hit landed (World._applyHit). */
export function styleHit(world, att, tgt, move, killed) {
  const s = world.style;
  if (!s) return;
  if (att.team === 'player') {
    const same = move && move === s.last;
    s.repeat = same ? s.repeat + 1 : 0;
    s.last = move;
    let d = same ? Math.max(0.5, 3 - s.repeat) : 5;
    if (tgt.y > 30) d += 4; // juggle
    if (killed) d += 6;
    bump(world, d);
  } else if (tgt.team === 'player') {
    bump(world, -12);
  }
}

export function stepStyle(world) {
  const s = world.style;
  if (!s) return;
  if (world.tick % 6 === 0) bump(world, -0.35);
  // Viewers drift towards what the rank deserves
  const want = 120 + s.meter * s.meter * 1.6;
  s.viewers += (want - s.viewers) * 0.01;
  if (s.meter >= 60 && --s.donateT <= 0) {
    s.donateT = s.meter >= 95 ? 90 : s.meter >= 80 ? 150 : 240;
    const p = world.players()[0];
    if (p) {
      const amount = s.meter >= 95 ? 6 : s.meter >= 80 ? 4 : 2;
      world._spillKosari(p.x + world.rng.range(-120, 120), p.z, amount, 420);
      world.events.push({ type: 'donate', amount, rank: s.rank, x: p.x, z: p.z });
    }
  }
}
