// Headless check of the online modes: node src/remake/sim/modes.test.mjs
//   every mode map starts its arena; «Стенка на стенку» plays rounds to 3 wins;
//   the race is two cars, both reach the finish in order; the long raft docks;
//   a fallen co-op friend gets up when the other stands next to him
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN } from './input.js';
import { MODE_MAPS } from '../maps/modes.js';

let fails = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fails += 1;
};
const byId = (id) => MODE_MAPS.find((m) => m.id === id);

/** Bot 0 walks right and punches whatever is near; the others do `other(i, t)`. */
function run(map, { players = 1, ticks = 60 * 30, hp, other = () => 0, onTick } = {}) {
  const w = new World({ seed: 3, bounds: { xMin: 0, xMax: map.length, zMin: 0, zMax: 150 } });
  const ps = Array.from({ length: players }, (_, i) => w.spawn('player', map.start.x + i * 100, 80, { slot: i }));
  ps.forEach((p, i) => (p.hp = p.maxHp = hp ? hp(i) : 1e6));
  w.viewW = 1920;
  w.autoEntry = true;
  const d = new MapDirector(w, map);
  const seen = {};
  for (let t = 0; t < ticks && d.state !== 'done'; t += 1) {
    for (const f of w.fighters) if (f.waiting) f.waiting = false;
    const p = ps[0];
    const foes = w.fighters.filter((f) => !f.dead && f !== p && (f.team === 'enemy' || (w.pvp && f.kind === 'player')));
    let bits = 0;
    if (foes.length) {
      const e = foes[0];
      const dx = e.x - p.x;
      if (Math.abs(dx) > 90 || Math.sign(dx) !== p.facing) bits |= dx > 0 ? BTN.RIGHT : BTN.LEFT;
      if (Math.abs(e.z - p.z) > 12) bits |= e.z < p.z ? BTN.UP : BTN.DOWN;
      if (Math.abs(dx) < 140 && t % 8 === 0) bits |= BTN.LIGHT;
    } else bits |= BTN.RIGHT;
    w.setInput(0, bits);
    for (let i = 1; i < players; i += 1) w.setInput(i, other(i, t));
    onTick?.(w, ps, t);
    w.step();
    d.step();
    for (const ev of w.events) seen[ev.type] = (seen[ev.type] || 0) + 1;
    w.events.length = 0;
  }
  return { w, d, seen, ps };
}

for (const map of MODE_MAPS) {
  try {
    const r = run(map, { ticks: 60 * 8 });
    check(!!r.seen.arenaStart, `${map.id}: its arena starts`);
  } catch (e) {
    check(false, `${map.id}: ${e.message}`);
  }
}

// «Стенка на стенку»: player 2 is weak and stands still — rounds go to player 1, three of them
const pvp = run(byId('pvp'), { players: 2, ticks: 60 * 60, hp: (i) => (i ? 60 : 1e6) });
check(pvp.seen.pvpRound === 2 && pvp.seen.pvpWin === 1 && pvp.d.state === 'done', `pvp: rounds ${pvp.seen.pvpRound || 0} + the match (${pvp.d.state})`);
check(pvp.seen.revive >= 2, 'pvp: both get up for the next round');

// Race: two cars, the second one floors it
const race = run(byId('race_long'), { players: 2, ticks: 60 * 90, other: () => BTN.RIGHT });
const res = race.w.race?.results || [];
check(race.seen.raceFinish === 2 && race.d.state === 'done', `race: both cars finish (${race.seen.raceFinish || 0})`);

// The long raft reaches the pier
const raft = run(byId('raft_long'), { players: 2, ticks: 60 * 150 });
check(!!raft.seen.raftEnd, 'raft: the squad docks at the pier');

// Co-op revive: player 2 falls, player 1 stands next to him
const siege = byId('siege');
const rv = run(siege, {
  players: 2,
  ticks: 60 * 10,
  onTick: (w, ps, t) => {
    if (t === 60) {
      ps[1].hp = 0;
      ps[1].dead = true;
      ps[1].state = 'dead';
    }
    if (t > 60) {
      ps[0].x = ps[0].px = ps[1].x + 40;
      ps[0].z = ps[0].pz = ps[1].z;
      ps[0].state = 'idle';
      ps[0].cmd = 0;
    }
  },
});
check(!rv.ps[1].dead && rv.seen.revive >= 1, 'co-op: the fallen friend got up');
void res;

// Суперстрим: the chat votes about each of the two players, not only about everybody
{
  const map = byId('superstream');
  const w = new World({ seed: 9, bounds: { xMin: 0, xMax: map.length, zMin: 0, zMax: 150 } });
  const ps = [0, 1].map((i) => w.spawn('player', map.start.x + i * 80, 80, { slot: i }));
  ps.forEach((p) => (p.hp = p.maxHp = 1e6));
  w.viewW = 1920;
  w.autoEntry = true;
  const d = new MapDirector(w, map);
  const targets = new Set();
  let polls = 0;
  for (let t = 0; t < 60 * 120; t += 1) {
    for (const f of w.fighters) if (f.waiting) f.waiting = false;
    w.setInput(0, BTN.RIGHT | (t % 10 === 0 ? BTN.LIGHT : 0));
    w.setInput(1, BTN.RIGHT);
    w.step();
    d.step();
    for (const ev of w.events) {
      if (ev.type !== 'voteStart') continue;
      polls += 1;
      for (const o of ev.options) if (o.target != null) targets.add(o.target);
    }
    w.events.length = 0;
  }
  check(polls >= 3 && targets.has(ps[0].id) && targets.has(ps[1].id), `superstream: ${polls} polls, about both players (${[...targets].join(',')})`);
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('modes ok');
