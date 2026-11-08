// Headless check of the dacha basement (flashlight + fuses): node src/remake/sim/torch.test.mjs
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN } from './input.js';
import { dacha } from '../maps/eras.js';

const w = new World({ seed: 5, bounds: { xMin: 0, xMax: dacha.length, zMin: 0, zMax: 300 } });
const p = w.spawn('player', dacha.start.x, dacha.start.z, { slot: 0 });
p.hp = p.maxHp = 1e6;
w.viewW = 1920;
const d = new MapDirector(w, dacha);
const seen = {};
let darkTicks = 0;
for (let t = 0; t < 60 * 60 * 15; t += 1) {
  for (const f of w.fighters) if (f.waiting) f.waiting = false;
  let bits = 0;
  const tc = w.torch;
  if (tc && !tc.done) {
    darkTicks += 1;
    const sh = w.fighters.find((f) => f.kind === 'shade');
    const fuse = tc.fuses.filter((f) => !f.got).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (sh && Math.abs(sh.x - p.x) < 260 && !sh.lit && t % 3 === 0) {
      // Turn round and shine on him, then punch
      bits |= sh.x > p.x ? BTN.RIGHT : BTN.LEFT;
      if (Math.abs(sh.x - p.x) < 140) bits |= BTN.LIGHT;
    } else if (fuse) {
      if (Math.abs(fuse.x - p.x) > 20) bits |= fuse.x > p.x ? BTN.RIGHT : BTN.LEFT;
      if (Math.abs(fuse.z - p.z) > 10) bits |= fuse.z < p.z ? BTN.UP : BTN.DOWN;
    }
  } else {
    const foes = w.fighters.filter((f) => !f.dead && f.team === 'enemy');
    if (foes.length) {
      const e = foes.find((f) => f.kind === 'thief') || foes.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
      const dx = e.x - p.x;
      if (Math.abs(dx) > 90 || Math.sign(dx) !== p.facing) bits |= dx > 0 ? BTN.RIGHT : BTN.LEFT;
      if (Math.abs(e.z - p.z) > 12) bits |= e.z < p.z ? BTN.UP : BTN.DOWN;
      if (Math.abs(dx) < 140 && t % 8 === 0) bits |= BTN.LIGHT;
    } else bits |= BTN.RIGHT;
  }
  w.setInput(0, bits);
  w.step();
  d.step();
  for (const ev of w.events) if (/torch|fuse|shade|dark/i.test(ev.type)) seen[ev.type] = (seen[ev.type] || 0) + 1;
  w.events.length = 0;
  if (d.status().state === 'done') break;
}
console.log(JSON.stringify(seen), 'dark s', (darkTicks / 60).toFixed(1), 'arena', d.idx, d.status().state);
