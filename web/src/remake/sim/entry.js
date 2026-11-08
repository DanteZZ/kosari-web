import { BTN } from './input.js';

/**
 * How an arena's special mode begins (map arena `entry`):
 *
 *   entry: { art, at, prompt, intro: [[who, text], ...], early }
 *
 *   art     — what stands there: a parked car, a raft at the bank, lift doors,
 *             a trader's desk... (item art). 'none' = an invisible spot (the
 *             penalty ball is drawn by the minigame itself). No art and `auto` =
 *             no object: the intro lines just play when the arena locks.
 *   at      — x offset from the arena's left edge
 *   prompt  — the hint over it («J — сесть в машину»)
 *   intro   — lines played (by the scene) after the hero uses it
 *   early   — the mode is set up right away but waits (`world.mini.standby`)
 *             until the entry is used — so Дед already stands in goal
 *
 * Flow: walk up → J → event 'entryUse' → the scene plays the intro and sets
 * world.entry.go → the director begins the mode.
 */

export function startEntry(world, b, cfg) {
  const p = world.players()[0];
  const zMid = (world.bounds.zMin + world.bounds.zMax) / 2;
  const e = { cfg, used: false, go: false, near: false, id: null, x: b.left + (cfg.at ?? 700), z: cfg.z ?? zMid };
  if (cfg.auto) {
    e.used = true;
    world.events.push({ type: 'entryUse', auto: true });
  } else if (cfg.art && cfg.art !== 'none') {
    const f = world.spawn('entry', e.x, e.z, { facing: -1 });
    f.art = cfg.art;
    f.artH = cfg.h || 200;
    e.id = f.id;
  }
  world.entry = e;
  if (p && !cfg.auto) p.x = Math.min(p.x, e.x - 260);
  world.events.push({ type: 'entryStart', x: e.x, z: e.z, prompt: cfg.prompt || 'J', art: cfg.art || null });
}

/** Before input is latched: J next to the entry uses it (instead of punching). */
export function preEntry(world) {
  const e = world.entry;
  if (!e || e.used) return;
  const p = world.players()[0];
  if (!p) return;
  e.near = Math.abs(p.x - e.x) < (e.cfg.reach || 150) && Math.abs(p.z - e.z) < 70;
  const pressed = p.cmd & ~(e.prevCmd || 0);
  e.prevCmd = p.cmd;
  if (!e.near) return;
  if (pressed & BTN.LIGHT) {
    e.used = true;
    p.vx = 0;
    world.events.push({ type: 'entryUse', x: e.x, z: e.z, art: e.cfg.art });
  }
  p.cmd &= ~BTN.LIGHT;
}

/** Remove the entry object once the mode has begun (the car drives off with you, etc.). */
export function endEntry(world) {
  const e = world.entry;
  if (!e) return;
  // The mode may want the spot (the kiosk stands where the seller was)
  world.entryX = e.x;
  if (e.id != null && !e.cfg.keep) {
    const f = world.fighters.find((x) => x.id === e.id);
    if (f) {
      f.dead = true;
      f.removed = true;
    }
  }
  world.entry = null;
}
