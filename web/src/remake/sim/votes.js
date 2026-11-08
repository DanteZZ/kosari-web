/**
 * PC club «Чат решает» (arena `votes: { every }`): every so often the chat
 * votes on a modifier for the fight. Three options pop up, the bars race for a
 * few seconds, the winner applies for a while. Combos sway the chat: every hit
 * you land adds a vote to the option that is losing worst (chat loves an underdog).
 *
 * world.votes = { t, poll: { options, counts, t } | null, active: { id, t } | null }
 */

export const MODS = {
  moon: { title: 'Гравитация Луны', ticks: 720 },
  double: { title: 'Двойной урон всем', ticks: 600 },
  money: { title: 'Дождь из косарей', ticks: 600 },
  swarm: { title: 'Позвать ещё зрителей', ticks: 1 },
  heal: { title: 'Задонатить аптечку', ticks: 1 },
  lazy: { title: 'Враги — сонные', ticks: 600 },
  fast: { title: 'Все на энергетиках', ticks: 600 },
};
const IDS = Object.keys(MODS);
const POLL_T = 420;

export function startVotes(world, cfg) {
  world.votes = { every: cfg.every || 900, t: cfg.first || 240, poll: null, active: null };
}

export function stopVotes(world) {
  const v = world.votes;
  if (v?.active) endMod(world, v.active.id);
  world.votes = null;
}

function applyMod(world, id) {
  const p = world.players()[0];
  if (id === 'moon') world.gravMul = 0.4;
  else if (id === 'double') world.dmgAll = 2;
  else if (id === 'money') {
    world.savedRain = world.kosariRain;
    world.kosariRain = [25, 50];
  } else if (id === 'swarm') {
    world.swarmReq = 4;
  } else if (id === 'heal' && p) {
    p.hp = Math.min(p.maxHp, p.hp + 80);
    world.events.push({ type: 'pickup', kind: 'heal', amount: 80, x: p.x, z: p.z, id: p.id });
  } else if (id === 'lazy' || id === 'fast') {
    world.enemySpeed = id === 'lazy' ? 0.55 : 1.45;
  }
}

function endMod(world, id) {
  if (id === 'moon') world.gravMul = 1;
  else if (id === 'double') world.dmgAll = 1;
  else if (id === 'money') world.kosariRain = world.savedRain ?? null;
  else if (id === 'lazy' || id === 'fast') world.enemySpeed = 1;
}

export function voteHit(world) {
  const poll = world.votes?.poll;
  if (!poll) return;
  let lo = 0;
  for (let i = 1; i < poll.counts.length; i += 1) if (poll.counts[i] < poll.counts[lo]) lo = i;
  poll.counts[lo] += 3;
}

export function stepVotes(world) {
  const v = world.votes;
  if (!v) return;
  if (v.active && --v.active.t <= 0) {
    endMod(world, v.active.id);
    world.events.push({ type: 'voteEnd', id: v.active.id });
    v.active = null;
  }
  if (v.poll) {
    const poll = v.poll;
    // Chat spam: random bursts for each option
    for (let i = 0; i < poll.counts.length; i += 1) if (world.rng.chance(0.35)) poll.counts[i] += world.rng.int(1, 4);
    if (--poll.t <= 0) {
      let best = 0;
      for (let i = 1; i < poll.counts.length; i += 1) if (poll.counts[i] > poll.counts[best]) best = i;
      const id = poll.options[best];
      v.poll = null;
      v.active = { id, t: MODS[id].ticks };
      applyMod(world, id);
      world.events.push({ type: 'voteWin', id, title: MODS[id].title });
    }
    return;
  }
  if (v.active) return;
  if (--v.t > 0) return;
  v.t = v.every;
  const pool = [...IDS];
  const options = [];
  while (options.length < 3) options.push(pool.splice(world.rng.int(0, pool.length - 1), 1)[0]);
  v.poll = { options, counts: [0, 0, 0], t: POLL_T, total: POLL_T };
  world.events.push({ type: 'voteStart', options: options.map((id) => MODS[id].title) });
}
