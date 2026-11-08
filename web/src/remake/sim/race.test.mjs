// Headless check of the Opushka race + roadside traffic: node src/remake/sim/race.test.mjs
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN } from './input.js';
import { OBS } from './race.js';
import opushka from '../maps/opushka.js';

const w = new World({ seed: 11, bounds: { xMin: 0, xMax: opushka.length, zMin: 0, zMax: 150 } });
const p = w.spawn('player', opushka.start.x, opushka.start.z, { slot: 0 });
p.hp = p.maxHp = 1e6;
w.viewW = 1920;
const d = new MapDirector(w, opushka);
const seen = {};
let raceTicks = 0;
let carHitsEnemy = 0;
for (let t = 0; t < 60 * 60 * 15; t += 1) {
  for (const f of w.fighters) if (f.waiting) f.waiting = false;
  let bits = 0;
  if (w.race && !w.race.done) {
    raceTicks += 1;
    // Dodge the nearest thing ahead in my lane; punch mopeds
    const ahead = w.race.obs.filter((o) => o.kind !== 'moped' && o.x + OBS[o.kind].halfW > p.x - 100 && o.x - p.x < 900 && Math.abs(o.z - p.z) < 40);
    if (ahead.length) bits |= (ahead[0].z > p.z && p.z > 25) || p.z > 125 ? BTN.UP : BTN.DOWN;
    const mark = w.race.marks.find((m) => Math.abs(m.z - p.z) < 34 && m.x > p.x);
    if (mark && !ahead.length) bits |= mark.z > p.z ? BTN.UP : BTN.DOWN;
    if (w.race.obs.some((o) => o.kind === 'moped' && Math.abs(o.x - p.x) < 180) && t % 10 === 0) bits |= BTN.LIGHT;
    bits |= BTN.RIGHT;
  } else {
    const foes = w.fighters.filter((f) => !f.dead && f.team === 'enemy');
    if (foes.length) {
      const e = foes.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
      const dx = e.x - p.x;
      if (Math.abs(dx) > 90 || Math.sign(dx) !== p.facing) bits |= dx > 0 ? BTN.RIGHT : BTN.LEFT;
      if (Math.abs(e.z - p.z) > 12) bits |= e.z < p.z ? BTN.UP : BTN.DOWN;
      if (Math.abs(dx) < 140 && t % 8 === 0) bits |= BTN.LIGHT;
    } else bits |= BTN.RIGHT;
  }
  w.setInput(0, bits);
  w.step();
  d.step();
  for (const ev of w.events) {
    if (/race|moped|pot|lane/i.test(ev.type)) seen[ev.type] = (seen[ev.type] || 0) + 1;
    if (ev.type === 'hit' && ev.targetTeam === 'enemy' && ev.dmg >= 20) carHitsEnemy += 1;
  }
  w.events.length = 0;
  if (d.status().state === 'done') break;
}
console.log(JSON.stringify(seen), 'race s', (raceTicks / 60).toFixed(1), 'arena', d.idx, 'state', d.status().state, 'bigHitsOnEnemies', carHitsEnemy, 'money', p.money);
