/**
 * Fighter archetypes (stats only — visuals live in the view layer by `kind`).
 * Speeds in px/tick @ 60 Hz.
 */
export const FIGHTERS = {
  player: {
    team: 'player',
    hp: 200,
    speedX: 5.2,
    speedZ: 3.4,
    jumpV: 13.5,
    /** Second (air) jump — always a somersault. */
    jumpV2: 12,
    dashSpeed: 15,
    dashTicks: 14,
    dashIframes: 9,
    canGrab: true,
    moves: { light: 'jab1', heavy: 'kick', air: 'airkick', dash: 'dashpunch', special: 'rage' },
  },
  nikita: {
    team: 'enemy',
    hp: 46,
    speedX: 3.0,
    speedZ: 2.1,
    jumpV: 0,
    moves: { light: 'e_jab' },
    ai: { standoff: 190, aggression: 0.7, attackCd: [40, 80], retreat: [24, 50] },
  },
  buiniy: {
    team: 'enemy',
    hp: 80,
    speedX: 2.4,
    speedZ: 1.8,
    jumpV: 0,
    /** Shrugs off light hits (no flinch) until this much damage stacks up. */
    armor: 14,
    moves: { light: 'e_heavy' },
    ai: { standoff: 210, aggression: 0.55, attackCd: [60, 110], retreat: [30, 60] },
  },
  /** Шустрый: fast, fragile, charges in from far away with a flying tackle. */
  runner: {
    team: 'enemy',
    hp: 30,
    speedX: 5.4,
    speedZ: 3.3,
    jumpV: 0,
    moves: { light: 'e_rush' },
    ai: { standoff: 300, aggression: 1, attackCd: [40, 80], retreat: [36, 60] },
  },
  /** Метатель: keeps his distance and lobs bottles (punch them back!). */
  thrower: {
    team: 'enemy',
    hp: 38,
    speedX: 2.6,
    speedZ: 2.3,
    jumpV: 0,
    moves: { light: 'e_bottle' },
    ai: { standoff: 420, aggression: 0.9, attackCd: [50, 90], retreat: [10, 24], ignoreTokens: true },
  },
  /** Блокер: guards against punches from the front — kick, throw or flank him. */
  blocker: {
    team: 'enemy',
    hp: 70,
    speedX: 2.5,
    speedZ: 1.9,
    jumpV: 0,
    guard: true,
    moves: { light: 'e_jab' },
    ai: { standoff: 200, aggression: 0.6, attackCd: [50, 90], retreat: [24, 44] },
  },
  /** Breakable loot crate dropped from the sky (team 'prop': anyone can smash it). */
  crate: {
    team: 'prop',
    prop: true,
    noGrab: true,
    hp: 36,
    speedX: 0,
    speedZ: 0,
    jumpV: 0,
    moves: {},
  },
  /** Map boss: big, armored, two attacks, ignores the crowd attack-token limit. */
  boss1: {
    team: 'enemy',
    boss: true,
    noGrab: true,
    hp: 420,
    speedX: 2.8,
    speedZ: 2.0,
    jumpV: 0,
    /** Light hits don't flinch until 30 stacked dmg; knockdowns need 70. */
    armor: 30,
    poise: 70,
    moves: { light: 'b_jab', heavy: 'b_slam' },
    ai: { standoff: 230, aggression: 1, attackCd: [24, 54], retreat: [20, 40], heavyChance: 0.38, ignoreTokens: true },
  },
};
