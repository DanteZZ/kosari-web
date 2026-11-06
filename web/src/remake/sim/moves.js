/**
 * Frame data for every attack (ticks @ 60 Hz).
 *
 * startup  — wind-up before the hitbox turns on
 * active   — ticks the hitbox can connect
 * recovery — cool-down after; combo "next" steps may cancel it on hit
 * reach    — [min, max] px in front of the attacker (sweep: both sides)
 * depth    — max |dz| to connect (lane depth tolerance)
 * kb       — knockback px/tick on the victim
 * launch   — vertical launch speed (pops the victim into the air)
 * knockdown— victim falls and has to get up
 * lunge    — attacker slides forward px/tick during startup+active
 * clip     — bone-puppet clip id the view plays (game/player/animState.js),
 *            timed so its impact key lands on the first active tick
 * next     — combo routes: which move a buffered LIGHT / HEAVY chains into
 */
export const MOVES = {
  // ---- Player: light chain jab → jab → uppercut (launcher)
  jab1: {
    clip: 'punch_r',
    startup: 4, active: 3, recovery: 9,
    dmg: 7, reach: [10, 96], depth: 30,
    hitstun: 18, kb: 2.2, hitstop: 4, lunge: 2.2,
    next: { light: 'jab2', heavy: 'spin' },
    sfx: 'udar',
  },
  jab2: {
    clip: 'punch_l',
    startup: 4, active: 3, recovery: 10,
    dmg: 8, reach: [10, 100], depth: 30,
    hitstun: 20, kb: 2.6, hitstop: 4, lunge: 2.4,
    next: { light: 'upper', heavy: 'spin' },
    sfx: 'udar',
  },
  upper: {
    clip: 'punch_upper_r',
    startup: 6, active: 4, recovery: 16,
    dmg: 12, reach: [10, 104], depth: 32,
    hitstun: 0, kb: 3.5, launch: 13, hitstop: 7, lunge: 3,
    next: { heavy: 'highkick' },
    sfx: 'udar',
    heavy: true,
  },
  // ---- Player: heavy
  /** K1: quick front snap kick — staggers, chains into the head kick. */
  kick: {
    clip: 'kick_snap_r',
    startup: 7, active: 4, recovery: 13,
    dmg: 11, reach: [20, 120], depth: 32,
    hitstun: 24, kb: 4.5, hitstop: 6, lunge: 3,
    next: { heavy: 'highkick', light: 'jab1' },
    sfx: 'punch',
  },
  /** K2: Bruce Lee high kick to the head — pops the victim up. */
  highkick: {
    clip: 'kick_head_r',
    startup: 9, active: 5, recovery: 20,
    dmg: 19, reach: [20, 126], depth: 32,
    hitstun: 0, kb: 5, launch: 12, hitstop: 9, lunge: 2.5,
    sfx: 'superudar',
    heavy: true,
  },
  /** Chain finisher: spinning kick that hits both sides (crowd clear). */
  spin: {
    clip: 'kick_spin_r',
    startup: 7, active: 8, recovery: 18,
    dmg: 13, reach: [0, 118], depth: 40, sweep: true,
    hitstun: 0, kb: 8, knockdown: true, hitstop: 6, lunge: 1,
    sfx: 'superudar',
    heavy: true,
  },
  // ---- Air / dash
  airkick: {
    clip: 'kick_fly_r',
    startup: 3, active: 16, recovery: 6, air: true,
    dmg: 11, reach: [10, 108], depth: 34,
    hitstun: 22, kb: 5, knockdown: true, hitstop: 5, lunge: 0,
    sfx: 'punch',
  },
  dashpunch: {
    clip: 'punch_superman_r',
    startup: 2, active: 7, recovery: 14,
    dmg: 12, reach: [10, 104], depth: 32,
    hitstun: 0, kb: 10, knockdown: true, hitstop: 6, lunge: 9,
    sfx: 'superudar',
    heavy: true,
  },

  // ---- Enemies: slow, readable wind-ups
  e_jab: {
    clip: 'punch_r',
    startup: 16, active: 4, recovery: 22,
    dmg: 8, reach: [10, 92], depth: 26,
    hitstun: 16, kb: 3, hitstop: 4, lunge: 1.5,
    sfx: 'udar',
  },
  e_heavy: {
    clip: 'kick_knockout',
    startup: 24, active: 5, recovery: 28,
    dmg: 16, reach: [20, 116], depth: 28,
    hitstun: 0, kb: 8, knockdown: true, hitstop: 6, lunge: 2.5,
    sfx: 'punch',
    heavy: true,
  },
};

export function moveTotal(m) {
  return m.startup + m.active + m.recovery;
}
