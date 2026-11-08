// Headless check of the sigma pose-off, stream style meter, office lift + trading: node src/remake/sim/step8.test.mjs
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN } from './input.js';
import { sigmaGym, streamHouse, office } from '../maps/eras.js';

const ARROW = { W: BTN.UP, A: BTN.LEFT, S: BTN.DOWN, D: BTN.RIGHT };
const KEYI = ['W', 'A', 'S', 'D'];

function fight(w, p, t) {
  let bits = 0;
  const foes = w.fighters.filter((f) => !f.dead && f.team === 'enemy');
  if (foes.length) {
    const e = foes.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
    const dx = e.x - p.x;
    if (Math.abs(dx) > 90 || Math.sign(dx) !== p.facing) bits |= dx > 0 ? BTN.RIGHT : BTN.LEFT;
    if (Math.abs(e.z - p.z) > 12) bits |= e.z < p.z ? BTN.UP : BTN.DOWN;
    // Mix the moves (style!)
    if (Math.abs(dx) < 140 && t % 8 === 0) bits |= t % 24 === 0 ? BTN.HEAVY : BTN.LIGHT;
  } else bits |= BTN.RIGHT;
  return bits;
}

function run(map, label, bot) {
  const w = new World({ seed: 33, bounds: { xMin: 0, xMax: map.length, zMin: 0, zMax: 150 } });
  const p = w.spawn('player', map.start.x, map.start.z, { slot: 0 });
  p.hp = p.maxHp = 1e6;
  w.viewW = 1920;
  const d = new MapDirector(w, map);
  const seen = {};
  let maxView = 0;
  for (let t = 0; t < 60 * 60 * 20; t += 1) {
    for (const f of w.fighters) if (f.waiting) f.waiting = false;
    w.setInput(0, bot(w, p, t) ?? fight(w, p, t));
    w.step();
    d.step();
    if (w.style) maxView = Math.max(maxView, w.style.viewers);
    for (const ev of w.events) if (/^pose|^style|^donate|^elevator|^trade/.test(ev.type)) {
      const k = ev.type === 'styleRank' ? `rank:${ev.rank}` : ev.type;
      seen[k] = (seen[k] || 0) + 1;
      if (/End/.test(ev.type)) seen.last = JSON.stringify(ev);
    }
    w.events.length = 0;
    if (d.status().state === 'done') break;
  }
  console.log(label, JSON.stringify(seen), d.status().state, maxView ? `maxViewers ${Math.round(maxView)}` : '');
}

// Pose-off: repeat the chain (miss one key in the last round)
run(sigmaGym, 'sigma pose', (w, p, t) => {
  const m = w.mini;
  if (!m || m.type !== 'pose') return null;
  if (m.phase !== 'input' || t % 6) return 0;
  const k = m.seq[m.input];
  return ARROW[KEYI[m.round === 2 && m.input === 3 ? (k + 1) % 4 : k]];
});

run(streamHouse, 'stream style', () => null);

// Trading: buy low (after a dip), sell after a rise
run(office, 'office lift+trade', (w) => {
  const m = w.mini;
  if (!m || m.type !== 'trading') return null;
  const h = m.hist;
  if (h.length < 8) return 0;
  const k = h[h.length - 1] / h[h.length - 8];
  if (!m.held && k < 0.92) return BTN.LIGHT;
  if (m.held && k > 1.08) return BTN.HEAVY;
  return 0;
});
