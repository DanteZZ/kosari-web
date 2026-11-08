// Headless check of the village penalties: node src/remake/sim/penalty.test.mjs
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN } from './input.js';
import { village } from '../maps/eras.js';

const w = new World({ seed: 3, bounds: { xMin: 0, xMax: village.length, zMin: 0, zMax: 300 } });
const p = w.spawn('player', village.start.x, village.start.z, { slot: 0 });
p.hp = p.maxHp = 1e6;
w.viewW = 1920;
const d = new MapDirector(w, village);
const seen = {};
let res = null;
for (let t = 0; t < 60 * 60 * 20; t += 1) {
  for (const f of w.fighters) if (f.waiting) f.waiting = false;
  let bits = 0;
  const m = w.mini;
  if (m && !m.done) {
    if (m.phase === 'aim') {
      const want = 30;
      if (Math.abs(m.aimZ - want) > 6) bits |= m.aimZ > want ? BTN.UP : BTN.DOWN;
      else if (m.power > 0.6 && m.power < 0.85 && t % 2 === 0) bits |= BTN.LIGHT;
    } else if (m.phase === 'run' || m.phase === 'save') {
      const want = m.look ?? m.target ?? 150;
      if (Math.abs(p.z - want) > 8) bits |= p.z > want ? BTN.UP : BTN.DOWN;
    }
  } else {
    const foes = w.fighters.filter((f) => !f.dead && f.team === 'enemy');
    if (foes.length) {
      const e = foes.find((f) => f.kind === 'thief') || foes.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
      const dx = e.x - p.x;
      if (Math.abs(dx) > 90) bits |= dx > 0 ? BTN.RIGHT : BTN.LEFT;
      if (Math.abs(e.z - p.z) > 12) bits |= e.z < p.z ? BTN.UP : BTN.DOWN;
      if (Math.abs(dx) < 140 && t % 8 === 0) bits |= BTN.LIGHT;
    } else bits |= BTN.RIGHT;
  }
  w.setInput(0, bits);
  w.step();
  d.step();
  for (const ev of w.events) {
    if (/penalty|dedLooks|Dive/i.test(ev.type)) seen[ev.type] = (seen[ev.type] || 0) + 1;
    if (ev.type === 'penaltyResult') console.log('  ', ev.who, ev.text, JSON.stringify(ev.score));
    if (ev.type === 'penaltyEnd') res = ev;
  }
  w.events.length = 0;
  if (d.status().state === 'done') break;
}
console.log(JSON.stringify(seen), 'end', JSON.stringify(res), 'state', d.status().state, 'money', p.money);
