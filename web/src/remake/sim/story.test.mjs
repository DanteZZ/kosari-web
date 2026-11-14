// Headless check of the story outcomes (director.release): node src/remake/sim/story.test.mjs
//   peace with a boss → his arena (the last one) ends, the map is complete without a fight
//   ally with a debuting meme → he fights for the player and the arena still clears
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN } from './input.js';
import { FIGHTERS } from './fighters.js';
import opushka from '../maps/opushka.js';
import { village } from '../maps/eras.js';

let fails = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fails += 1;
};

/** Walk right and punch the nearest enemy; `onMeet(f)` decides each meeting (returns 'peace' | 'ally' | null). */
function run(map, startArena, onMeet, ticks = 60 * 60 * 6) {
  const w = new World({ seed: 3, bounds: { xMin: 0, xMax: map.length, zMin: 0, zMax: 150 } });
  const a0 = map.arenas[startArena];
  const p = w.spawn('player', a0.left + 60, 75, { slot: 0 });
  p.hp = p.maxHp = 1e9;
  w.viewW = 1920;
  w.autoEntry = true;
  const d = new MapDirector(w, map);
  d.idx = startArena;
  w.playerBounds = null;
  const met = new Set();
  let done = false;
  for (let t = 0; t < ticks && !done; t += 1) {
    for (const f of w.fighters) {
      if (!f.waiting || met.has(f.id)) continue;
      met.add(f.id);
      const out = onMeet(f);
      if (out) d.release(f.id, out);
      else f.waiting = false;
    }
    const foes = w.fighters.filter((f) => !f.dead && f.team === 'enemy' && !FIGHTERS[f.kind].prop);
    let bits = 0;
    if (foes.length) {
      const e = foes.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
      const dx = e.x - p.x;
      if (Math.abs(dx) > 90 || Math.sign(dx) !== p.facing) bits |= dx > 0 ? BTN.RIGHT : BTN.LEFT;
      if (Math.abs(e.z - p.z) > 12) bits |= e.z < p.z ? BTN.UP : BTN.DOWN;
      if (Math.abs(dx) < 140 && t % 8 === 0) bits |= BTN.LIGHT;
    } else bits |= BTN.RIGHT;
    w.setInput(0, bits);
    w.step();
    d.step();
    for (const ev of w.events) if (ev.type === 'mapComplete' || (ev.type === 'arenaClear' && ev.index === startArena)) done = ev;
    w.events.length = 0;
  }
  return { w, d, done, met };
}

// Повар walks away: the boss arena is over at once
{
  const boss = opushka.arenas.length - 1;
  let povarId = null;
  const r = run(opushka, boss, (f) => {
    if (f.kind !== 'povar') return null;
    povarId = f.id;
    return 'peace';
  }, 60 * 30);
  const povar = r.w.fighters.find((f) => f.id === povarId);
  check(povarId != null, 'Повар met');
  check(r.d.state === 'done', `peace with the boss completes the map (state ${r.d.state})`);
  check(!povar || povar.removed, 'Повар left the road');
}

// Дед joins the player: he fights the crowd, the first arena still clears
{
  let dedId = null;
  const r = run(village, 0, (f) => {
    if (f.kind !== 'ded') return null;
    dedId = f.id;
    return 'ally';
  });
  const ded = r.w.fighters.find((f) => f.id === dedId);
  check(dedId != null, 'Дед met');
  check(ded?.team === 'ally', 'Дед is on the player side');
  check(!!r.done, 'the arena with an ally in it still clears');
  check(!r.d.arenaIds.includes(dedId), 'the ally does not hold the arena open');
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log('story outcomes ok');
