// Headless check of the Gigachad QTE: node src/remake/sim/qte.test.mjs
import { World } from './World.js';
import { KEY_BITS } from './bench.js';

for (const mode of ['perfect', 'miss']) {
  const w = new World({ seed: 8, bounds: { xMin: 0, xMax: 4000, zMin: 0, zMax: 150 } });
  const p = w.spawn('player', 1000, 75, { slot: 0 });
  const g = w.spawn('gigachad', 1300, 75, { facing: -1 });
  g.hp = Math.round(g.maxHp * 0.5);
  const hp0 = g.hp;
  const php0 = p.hp;
  const seen = [];
  let prev = 0;
  for (let t = 0; t < 900; t += 1) {
    let bits = 0;
    const q = w.qte;
    if (q && !q.done && q.intro === 0 && q.t > 10) {
      const want = KEY_BITS[q.seq[q.i]];
      bits = mode === 'perfect' ? want : q.i === 2 ? KEY_BITS[q.seq[q.i] === 'J' ? 'K' : 'J'] : want;
    }
    // press = edge: release every other tick
    w.setInput(0, bits && !prev ? bits : 0);
    prev = bits && !prev ? bits : 0;
    w.step();
    for (const ev of w.events) if (/^qte/.test(ev.type)) seen.push(ev.type + (ev.ok != null ? `:${ev.ok}` : ''));
    w.events.length = 0;
    if (seen.some((s) => s.startsWith('qteEnd'))) break;
  }
  console.log(mode, seen.join(' '), 'boss hp', hp0, '->', g.hp, 'player hp', php0, '->', p.hp);
}
