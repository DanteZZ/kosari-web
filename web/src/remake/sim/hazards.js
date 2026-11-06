/**
 * Projectile specs for the original game's bosses and hazards.
 * Units: px / ticks @ 60 Hz. See World._spawnProj for the fields.
 *
 * arc        — thrown ballistically at the nearest player (lands at their feet)
 * gravity    — px/tick² while flying
 * explode    — area blast on contact / landing
 * hitsAll    — hurts everyone (enemies too), not just the other team
 * shootable  — bullets set it off in mid-air
 * reflectable— a live player strike knocks it back: 'toOwner' flies back at the thrower
 * bossDmg    — damage a reflected hit does to a boss that only takes reflected hits
 * marker     — the view draws a landing marker
 */

/** Влад Борщ's fused bomb. */
export const BOMB = {
  kind: 'bomb', tex: 'bomb', speed: 0, arc: true, arcSpeed: 7.5, gravity: 0.42, life: 260,
  dmg: 0, hitsAll: true, shootable: true, reflectable: 'toOwner', bossDmg: 1, marker: true,
  explode: { radius: 115, depth: 52, dmg: 20, launch: 8, kb: 7 },
  muzzle: { x: 30, y: 210 },
};

/** Повар: pot lobbed in an arc. */
export const POT = {
  kind: 'pot', tex: 'pot', speed: 0, arc: true, arcSpeed: 7, gravity: 0.42, life: 260,
  dmg: 10, hitstun: 20, kb: 5, reflectable: 'toOwner', bossDmg: 10, marker: true,
  muzzle: { x: 30, y: 220 },
};

/** Повар: frying pan skimming straight at chest height. */
export const PAN = {
  kind: 'pan', tex: 'pan', speed: 6.5, gravity: 0, life: 240,
  dmg: 12, hitstun: 20, kb: 6, reflectable: 'toOwner', bossDmg: 10,
  muzzle: { x: 40, y: 140 },
};

/** Fork rain between Повар's phases (falls straight down). */
export const FORK = {
  kind: 'fork', tex: 'fork', speed: 0, gravity: 0.7, life: 240,
  dmg: 12, hitstun: 22, kb: 3, marker: true,
};

/** Airship bomb. */
export const DIRIG_BOMB = {
  kind: 'dirigbomb', tex: 'dirigbomb', speed: 0, gravity: 0.32, life: 300,
  dmg: 0, hitsAll: true, shootable: true, marker: true,
  explode: { radius: 120, depth: 55, dmg: 22, launch: 8, kb: 7 },
};

/** A punched anvil flying sideways through the crowd. */
export const ANVIL_FLY = {
  kind: 'anvil', tex: 'anvil', speed: 15, gravity: 0.5, vy: 6, life: 120,
  dmg: 30, kb: 9, knockdown: true, pierce: true,
};
