// Headless check of the arena goals: node src/remake/sim/goals.test.mjs
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN } from './input.js';
import { FIGHTERS } from './fighters.js';
import { village, dacha, panelki, streamHouse } from '../maps/eras.js';

function run(map, label) {
  const w = new World({ seed: 7, bounds: { xMin: 0, xMax: map.length, zMin: 0, zMax: 300 } });
  const p = w.spawn('player', map.start.x, map.start.z, { slot: 0 });
  p.hp = p.maxHp = 1e9;
  w.viewW = 1920;
  const d = new MapDirector(w, map);
  const seen = {};
  let lastGoal = '';
  for (let t = 0; t < 60 * 60 * 12; t += 1) {
    // Bot: walk to the nearest thing worth hitting and punch it
    for (const f of w.fighters) if (f.waiting) f.waiting = false;
    const foes = w.fighters.filter((f) => !f.dead && (f.team === 'enemy' || FIGHTERS[f.kind].target));
    let bits = 0;
    if (foes.length) {
      const prio = foes.find((f) => f.kind === 'thief') || foes.find((f) => FIGHTERS[f.kind].target);
      const e = prio || foes.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
      const dx = e.x - p.x;
      if (Math.abs(dx) > 90 || Math.sign(dx) !== p.facing) bits |= dx > 0 ? BTN.RIGHT : BTN.LEFT;
      if (Math.abs(e.z - p.z) > 12) bits |= e.z < p.z ? BTN.UP : BTN.DOWN;
      if (Math.abs(dx) < 140 && t % 8 === 0) bits |= BTN.LIGHT;
      if (Math.abs(dx) > 400 && t % 40 === 0) bits |= BTN.DASH;
    } else bits |= BTN.RIGHT;
    w.setInput(0, bits);
    w.step();
    d.step();
    for (const ev of w.events) {
      if (/goal|thief|obj|target/i.test(ev.type)) seen[ev.type] = (seen[ev.type] || 0) + 1;
    }
    w.events.length = 0;
    const s = d.status();
    if (s.goal && s.goal.split(':')[0] !== lastGoal.split(':')[0]) lastGoal = s.goal;
    if (s.state === 'done' || d.done) break;
    if (t % 3600 === 0 && s.goal) console.log(`  ${label} t=${t / 60}s ${s.goal}`);
  }
  console.log(JSON.stringify(d.status()), p.x, w.fighters.filter(f=>!f.dead).map(f=>f.kind+":"+Math.round(f.x)+(f.waiting?"w":"")).join(" "));
  console.log(label, JSON.stringify(seen), 'arena', d.idx, 'money', p.money);
}

run(village, 'village(survive a3)');
run(dacha, 'dacha(chase a2)');
run(panelki, 'panelki(defend a2)');
run(streamHouse, 'stream(destroy a2)');
