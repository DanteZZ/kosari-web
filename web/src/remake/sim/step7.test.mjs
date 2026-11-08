// Headless check of the gym bench press, museum stealth and river raft: node src/remake/sim/step7.test.mjs
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN } from './input.js';
import { guardSees } from './stealth.js';
import { gym, museum, river } from '../maps/eras.js';

function fight(w, p, t) {
  let bits = 0;
  const foes = w.fighters.filter((f) => !f.dead && f.team === 'enemy');
  if (foes.length) {
    const e = foes.find((f) => f.kind === 'thief') || foes.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
    const dx = e.x - p.x;
    if (Math.abs(dx) > 90 || Math.sign(dx) !== p.facing) bits |= dx > 0 ? BTN.RIGHT : BTN.LEFT;
    if (Math.abs(e.z - p.z) > 12) bits |= e.z < p.z ? BTN.UP : BTN.DOWN;
    if (Math.abs(dx) < 140 && t % 8 === 0) bits |= BTN.LIGHT;
  } else bits |= BTN.RIGHT;
  return bits;
}

function run(map, label, bot) {
  const w = new World({ seed: 21, bounds: { xMin: 0, xMax: map.length, zMin: 0, zMax: 150 } });
  const p = w.spawn('player', map.start.x, map.start.z, { slot: 0 });
  p.hp = p.maxHp = 1e6;
  w.viewW = 1920;
  const d = new MapDirector(w, map);
  const seen = {};
  let ticks = 0;
  for (let t = 0; t < 60 * 60 * 20; t += 1) {
    for (const f of w.fighters) if (f.waiting) f.waiting = false;
    const own = bot(w, p, t, d);
    if (own != null) ticks += 1;
    w.setInput(0, own ?? fight(w, p, t));
    w.step();
    d.step();
    for (const ev of w.events) if (/^bench|^stealth|^raft|laneWarn/.test(ev.type)) {
      const k = ev.type === 'benchHit' ? `hit:${ev.grade}` : ev.type;
      seen[k] = (seen[k] || 0) + 1;
      if (/End|Done|Alarm/.test(ev.type)) seen.last = JSON.stringify(ev);
    }
    w.events.length = 0;
    if (d.status().state === 'done') break;
  }
  console.log(label, JSON.stringify(seen), 'own s', (ticks / 60).toFixed(1), d.status().state);
}

// Bench: press the right key when a note is in the ring (a bit sloppy)
run(gym, 'gym bench', (w, p, t) => {
  const m = w.mini;
  if (!m || m.type !== 'bench') return null;
  const n = m.notes.find((x) => x.hit === null && Math.abs(x.at - m.t) <= 3 + (t % 7));
  if (!n || t % 2) return 0;
  return n.key === 'J' ? BTN.LIGHT : BTN.HEAVY;
});

// Stealth: wait behind a crate (on our side of it) until the way ahead is clear
run(museum, 'museum stealth', (w, p) => {
  const m = w.mini;
  if (!m || m.type !== 'stealth') return null;
  const gs = m.guards.map((id) => w.fighters.find((f) => f.id === id)).filter((g) => g && !g.dead);
  // Would anyone see me a few steps further on?
  const danger = (x) => gs.some((g) => guardSees(m, g, x, p.z) || guardSees(m, g, x + 80, p.z));
  if (!danger(p.x + 40)) return BTN.RIGHT;
  // Back to the nearest crate behind me
  const c = [...m.covers].reverse().find((cv) => cv.x - 50 <= p.x + 5);
  if (c && p.x > c.x - 50) return BTN.LEFT;
  return 0;
});

// Raft: jump the logs, fight the rest
run(river, 'river raft', (w, p, t) => {
  if (!w.raftBox) return null;
  const log = w.projectiles.find((pr) => pr.spec.kind === 'log' && Math.abs(pr.z - p.z) < 40 && pr.x - p.x > 0 && pr.x - p.x < 140);
  if (log && p.y === 0) return BTN.JUMP;
  return fight(w, p, t);
});
