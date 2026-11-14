import { BUFFS, WEAPONS } from './items.js';

/**
 * «Чат решает» (arena `votes: { every }`): every so often the chat votes. Three
 * options pop up, the bars race for a few seconds, the winner applies.
 *
 * Two kinds of options:
 *   for everybody  — gravity, double damage, money rain, more viewers...
 *   for one player — a gift (rocket launcher, shield, protein, a med kit) or a
 *                    dirty trick (heavy feet); online the chat picks among the
 *                    streamers, alone it is about you.
 * Hits sway the chat: online your hits bring votes to the options about you
 * (fans); alone they go to whatever is losing worst (chat loves an underdog).
 *
 * world.votes = { t, every, poll: { options: [{ id, target }], counts, t } | null, active: { id, t } | null }
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

/** For one streamer: `{name}` is filled in by the view with his nickname / hero. */
export const PERSONAL = {
  rocket: { title: '{name}: РПГ в руки', good: true },
  shield: { title: '{name}: неуязвимость', good: true },
  power: { title: '{name}: протеин, двойная сила', good: true },
  medkit: { title: '{name}: полная аптечка', good: true },
  slow: { title: '{name}: ватные ноги', good: false },
};

const IDS = Object.keys(MODS);
const PIDS = Object.keys(PERSONAL);
const POLL_T = 420;

export function startVotes(world, cfg) {
  world.votes = { every: cfg.every || 900, t: cfg.first || 240, poll: null, active: null };
}

export function stopVotes(world) {
  const v = world.votes;
  if (v?.active && MODS[v.active.id]) endMod(world, v.active.id);
  world.votes = null;
}

function applyMod(world, id) {
  if (id === 'moon') world.gravMul = 0.4;
  else if (id === 'double') world.dmgAll = 2;
  else if (id === 'money') {
    world.savedRain = world.kosariRain;
    world.kosariRain = [25, 50];
  } else if (id === 'swarm') {
    world.swarmReq = 4;
  } else if (id === 'heal') {
    for (const q of world.players()) {
      q.hp = Math.min(q.maxHp, q.hp + 80);
      world.events.push({ type: 'pickup', kind: 'heal', amount: 80, x: q.x, z: q.z, id: q.id });
    }
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

/** The chat's gift (or trick) for one player. */
function applyPersonal(world, id, f) {
  if (!f || f.dead) return;
  f.buffs = f.buffs || {};
  if (id === 'rocket') {
    f.weapons = f.weapons || {};
    f.weapons[4] = (f.weapons[4] || 0) + Math.max(3, Math.round((WEAPONS[4]?.pack || 6) / 2));
    f.weapon = 4;
    world.events.push({ type: 'weapon', id: f.id, weapon: 4 });
  } else if (id === 'shield') f.buffs.shield = BUFFS.shield.ticks * 2;
  else if (id === 'power') f.buffs.power = BUFFS.power.ticks;
  else if (id === 'medkit') {
    f.hp = f.maxHp;
    world.events.push({ type: 'pickup', kind: 'heal', amount: f.maxHp, x: f.x, z: f.z, id: f.id });
  } else if (id === 'slow') f.buffs.slow = BUFFS.slow.ticks;
}

/** A player's hit landed: the chat moves. */
export function voteHit(world, att) {
  const poll = world.votes?.poll;
  if (!poll) return;
  const fans = att ? poll.options.map((o, i) => (o.target === att.id ? i : -1)).filter((i) => i >= 0) : [];
  if (fans.length && world.players().length > 1) {
    for (const i of fans) poll.counts[i] += 2;
    return;
  }
  let lo = 0;
  for (let i = 1; i < poll.counts.length; i += 1) if (poll.counts[i] < poll.counts[lo]) lo = i;
  poll.counts[lo] += 3;
}

/** Three options: online two about players (different ones when there are), one for all. */
function makeOptions(world) {
  const ps = world.players();
  const pool = [...IDS];
  const pickMod = () => pool.splice(world.rng.int(0, pool.length - 1), 1)[0];
  const ppool = [...PIDS];
  const pickPersonal = () => ppool.splice(world.rng.int(0, ppool.length - 1), 1)[0];
  const options = [];
  const personal = ps.length > 1 ? 2 : 1;
  const targets = [...ps];
  for (let i = 0; i < personal && targets.length; i += 1) {
    const t = targets.length > 1 ? targets.splice(world.rng.int(0, targets.length - 1), 1)[0] : targets[0];
    options.push({ id: pickPersonal(), target: t.id });
  }
  while (options.length < 3) options.push({ id: pickMod(), target: null });
  // Shuffle so «for one» is not always on top
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = world.rng.int(0, i);
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

export function stepVotes(world) {
  const v = world.votes;
  if (!v) return;
  if (v.active && --v.active.t <= 0) {
    if (MODS[v.active.id]) endMod(world, v.active.id);
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
      const o = poll.options[best];
      v.poll = null;
      if (o.target != null) {
        // A gift / trick is instant; a short «active» line shows who got it
        applyPersonal(world, o.id, world.fighters.find((f) => f.id === o.target));
        v.active = { id: o.id, target: o.target, t: 240 };
      } else {
        v.active = { id: o.id, t: MODS[o.id].ticks };
        applyMod(world, o.id);
      }
      world.events.push({ type: 'voteWin', id: o.id, target: o.target, good: o.target != null ? PERSONAL[o.id].good : true, title: o.target != null ? PERSONAL[o.id].title : MODS[o.id].title });
    }
    return;
  }
  if (v.active) return;
  if (--v.t > 0) return;
  v.t = v.every;
  const options = makeOptions(world);
  v.poll = { options, counts: options.map(() => 0), t: POLL_T, total: POLL_T };
  world.events.push({ type: 'voteStart', options });
}
