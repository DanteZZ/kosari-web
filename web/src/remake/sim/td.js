import { BTN } from './input.js';

/**
 * Panelki tower defense (arena `td: { prep, max }`, together with the
 * «защити ларёк» goal): before the waves you get a few seconds to set traps
 * on the road the gopniks will take to the kiosk. No building — just junk:
 *
 *   грабли (rake)   stuns whoever steps on it, works 3 times
 *   петарда         one big bang
 *   лужа клея       slows everyone who walks through it
 *
 * Prep controls: J sets the trap at your feet, Q/E switch the kind. They cost
 * косари. Traps hit enemies only.
 * world.td = { phase: 'prep'|'fight', t, kind, traps: [...] }
 */

export const TRAPS = {
  rake: { title: 'Грабли', price: 3, r: 64, uses: 3, rearm: 120 },
  petard: { title: 'Петарда', price: 5, r: 130, uses: 1 },
  glue: { title: 'Клей', price: 4, r: 100, uses: Infinity },
};
const KINDS = Object.keys(TRAPS);

export function startTd(world, cfg) {
  world.td = { phase: 'prep', t: cfg.prep || 720, kind: 0, max: cfg.max || 6, traps: [], nextId: 1, done: false };
  world.events.push({ type: 'tdStart', t: world.td.t });
}

/** Before input is latched (prep only): J places a trap, Q/E switch the kind. */
export function preTd(world) {
  const td = world.td;
  if (!td || td.phase !== 'prep') return;
  const p = world.players()[0];
  if (!p) return;
  const pressed = p.cmd & ~(td.prevCmd || 0);
  td.prevCmd = p.cmd;
  if (pressed & BTN.WNEXT) td.kind = (td.kind + 1) % KINDS.length;
  if (pressed & BTN.WPREV) td.kind = (td.kind + KINDS.length - 1) % KINDS.length;
  if (pressed & BTN.LIGHT) place(world, td, p);
  // Placing is not punching / switching weapons
  p.cmd &= ~(BTN.LIGHT | BTN.WNEXT | BTN.WPREV);
}

function place(world, td, p) {
  const kind = KINDS[td.kind];
  const def = TRAPS[kind];
  if (td.traps.length >= td.max) {
    world.events.push({ type: 'tdNo', why: 'Больше не поставить' });
    return;
  }
  if ((p.money || 0) < def.price) {
    world.events.push({ type: 'tdNo', why: `Нужно ${def.price} косарей` });
    return;
  }
  if (td.traps.some((t) => Math.abs(t.x - p.x) < 70 && Math.abs(t.z - p.z) < 40)) {
    world.events.push({ type: 'tdNo', why: 'Тут уже стоит' });
    return;
  }
  p.money -= def.price;
  const t = { id: td.nextId++, kind, x: p.x, z: p.z, uses: def.uses, cd: 0 };
  td.traps.push(t);
  world.events.push({ type: 'tdPlace', id: t.id, kind, x: t.x, z: t.z });
}

export function stepTd(world) {
  const td = world.td;
  if (!td || td.done) return;
  if (td.phase === 'prep') {
    if (--td.t <= 0) {
      td.phase = 'fight';
      world.events.push({ type: 'tdFight' });
    }
    return;
  }
  for (const f of world.fighters) {
    if (f.team !== 'enemy' || f.dead || f.y > 20) continue;
    let slow = false;
    for (const t of td.traps) {
      const def = TRAPS[t.kind];
      if (t.uses <= 0 || Math.abs(t.x - f.x) > def.r || Math.abs(t.z - f.z) > def.r * 0.8) continue;
      if (t.kind === 'glue') {
        slow = true;
        continue;
      }
      if (t.cd > 0) continue;
      if (t.kind === 'rake') {
        world._applyHit({ id: -1, team: 'hazard', x: t.x, facing: 1, combo: 0, meter: 0 }, f, { dmg: 10, hitstun: 70, kb: 1, hitstop: 4 }, { x: t.x, facing: Math.sign(f.x - t.x) || 1 });
        t.uses -= 1;
        t.cd = TRAPS.rake.rearm;
        world.events.push({ type: 'tdTrigger', id: t.id, kind: t.kind, x: t.x, z: t.z });
      } else if (t.kind === 'petard') {
        t.uses = 0;
        world.events.push({ type: 'tdTrigger', id: t.id, kind: t.kind, x: t.x, z: t.z });
        world.events.push({ type: 'explode', kind: 'petard', x: t.x, z: t.z, y: 0 });
        for (const g of world.fighters) {
          if (g.team !== 'enemy' || g.dead) continue;
          if (Math.abs(g.x - t.x) > def.r || Math.abs(g.z - t.z) > def.r * 0.5) continue;
          world._applyHit({ id: -1, team: 'hazard', x: t.x, facing: 1, combo: 0, meter: 0 }, g, { dmg: 30, kb: 10, launch: true, knockdown: true, hitstop: 6, heavy: true }, { x: t.x, facing: Math.sign(g.x - t.x) || 1 });
        }
        break;
      }
    }
    // Glue: everyone stuck in it walks at 40 %
    if (slow && !f.glued) {
      f.glued = true;
      f.speedMul = (f.speedMul || 1) * 0.4;
    } else if (!slow && f.glued) {
      f.glued = false;
      f.speedMul = (f.speedMul || 1) / 0.4;
    }
  }
  for (const t of td.traps) if (t.cd > 0) t.cd -= 1;
  td.traps = td.traps.filter((t) => t.uses > 0);
}

export function tdText(world) {
  const td = world.td;
  if (!td || td.phase !== 'prep') return '';
  const k = KINDS[td.kind];
  const s = Math.ceil(td.t / 60);
  return `Расставь ловушки ${s}с · J — ${TRAPS[k].title} (${TRAPS[k].price} К) · Q/E — другая · ${td.traps.length}/${td.max}`;
}
