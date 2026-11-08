// Headless check of the concert rap battle and summoned helpers: node src/remake/sim/step9.test.mjs
import { World } from './World.js';
import { MapDirector } from './director.js';
import { BTN, withSel } from './input.js';
import { KEY_BITS } from './bench.js';
import { SHOP } from './items.js';
import { concert, panelki } from '../maps/eras.js';
import { challengesFor } from '../maps/challenges.js';

function fight(w, p, t) {
  let bits = 0;
  const foes = w.fighters.filter((f) => !f.dead && f.team === 'enemy');
  if (foes.length) {
    const e = foes.reduce((a, b) => (Math.abs(a.x - p.x) < Math.abs(b.x - p.x) ? a : b));
    const dx = e.x - p.x;
    if (Math.abs(dx) > 90 || Math.sign(dx) !== p.facing) bits |= dx > 0 ? BTN.RIGHT : BTN.LEFT;
    if (Math.abs(e.z - p.z) > 12) bits |= e.z < p.z ? BTN.UP : BTN.DOWN;
    if (Math.abs(dx) < 140 && t % 8 === 0) bits |= BTN.LIGHT;
  } else bits |= BTN.RIGHT;
  return bits;
}

function run(map, label, bot, setup) {
  const w = new World({ seed: 44, bounds: { xMin: 0, xMax: map.length, zMin: 0, zMax: 150 } });
  const p = w.spawn('player', map.start.x, map.start.z, { slot: 0 });
  p.hp = p.maxHp = 1e6;
  w.viewW = 1920;
  setup?.(w, p);
  const d = new MapDirector(w, map);
  const seen = {};
  let bossHp = null;
  for (let t = 0; t < 60 * 60 * 20; t += 1) {
    for (const f of w.fighters) if (f.waiting) f.waiting = false;
    w.setInput(0, bot(w, p, t) ?? fight(w, p, t));
    w.step();
    d.step();
    for (const ev of w.events) {
      if (/^bench|^helper|cantBuy/.test(ev.type)) seen[ev.type] = (seen[ev.type] || 0) + 1;
      if (ev.type === 'benchEnd') seen.last = JSON.stringify(ev);
      if (ev.type === 'hit' && ev.targetTeam === 'enemy') seen.hitsOnEnemies = (seen.hitsOnEnemies || 0) + 1;
    }
    w.events.length = 0;
    const k = w.fighters.find((f) => f.kind === 'klas');
    if (k && bossHp == null) bossHp = k.maxHp;
    if (d.status().state === 'done') break;
  }
  const run = { secs: Math.round(w.tick / 60), damageTaken: w.stats.damageTaken, shots: w.stats.shots };
  const met = challengesFor(map).filter((c) => c.ok(run)).map((c) => c.id);
  console.log(label, JSON.stringify(seen), d.status().state, bossHp ? `klas maxHp ${bossHp}` : '', 'challenges', met.join(','), JSON.stringify(run));
}

// Rap battle: hit every note
run(concert, 'concert rap', (w, p, t) => {
  const m = w.mini;
  if (!m || m.type !== 'bench') return null;
  const n = m.notes.find((x) => x.hit === null && Math.abs(x.at - m.t) <= 2);
  if (!n || t % 2) return 0;
  return KEY_BITS[n.key];
});

// Helper: Дед is unlocked; buy him at the first fight
const slot = SHOP.findIndex((s) => s.helperSlot === 0);
let bought = false;
run(panelki, 'panelki helper', (w, p, t) => {
  if (!bought && w.enemiesAlive() > 2 && t % 3 === 0) {
    bought = w.fighters.some((f) => f.team === 'ally');
    return withSel(BTN.BUY, slot + 1);
  }
  return null;
}, (w, p) => {
  w.helpers = ['ded'];
  p.money = 30;
});
