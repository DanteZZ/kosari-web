// Headless check of panelki traps (TD) and PC club votes: node src/remake/sim/tdvotes.test.mjs
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN } from './input.js';
import { panelki, pcClub } from '../maps/eras.js';

function run(map, label) {
  const w = new World({ seed: 9, bounds: { xMin: 0, xMax: map.length, zMin: 0, zMax: 300 } });
  const p = w.spawn('player', map.start.x, map.start.z, { slot: 0 });
  p.hp = p.maxHp = 1e6;
  p.money = 40;
  w.viewW = 1920;
  const d = new MapDirector(w, map);
  const seen = {};
  for (let t = 0; t < 60 * 60 * 15; t += 1) {
    for (const f of w.fighters) if (f.waiting) f.waiting = false;
    let bits = 0;
    if (w.td?.phase === 'prep') {
      // Lay traps around the kiosk, both sides, across the lane
      const k = w.fighters.find((f) => f.kind === 'objective');
      const n = w.td.traps.length;
      const tx = k.x + (n % 2 ? 260 : -260) + (n % 3) * 40;
      const tz = 40 + (n % 3) * 100;
      if (Math.abs(tx - p.x) > 12) bits |= tx > p.x ? BTN.RIGHT : BTN.LEFT;
      else if (Math.abs(tz - p.z) > 8) bits |= tz > p.z ? BTN.DOWN : BTN.UP;
      else if (t % 4 === 0) bits |= BTN.LIGHT;
      if (t % 70 === 0) bits |= BTN.WNEXT;
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
      if (/^td|^vote|explode/.test(ev.type)) seen[ev.type] = (seen[ev.type] || 0) + 1;
      if (ev.type === 'voteWin') seen[`win:${ev.id}`] = (seen[`win:${ev.id}`] || 0) + 1;
    }
    w.events.length = 0;
    if (d.status().state === 'done') break;
  }
  console.log(label, JSON.stringify(seen), d.status().state, 'grav', w.gravMul ?? 1, 'dmgAll', w.dmgAll ?? 1, 'es', w.enemySpeed ?? 1);
}

run(panelki, 'panelki');
run(pcClub, 'pc_club');
