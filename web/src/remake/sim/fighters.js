import { MOVES } from './moves.js';
import { WEAPONS } from './items.js';
import { ERA_THROWS, SHOCKWAVE } from './eraHazards.js';

/**
 * Fighter archetypes (stats only — visuals live in the view layer by `kind`).
 * Speeds in px/tick @ 60 Hz.
 */
export const FIGHTERS = {
  player: {
    team: 'player',
    hp: 400,
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
    ai: { standoff: 520, aggression: 0.9, attackCd: [50, 90], retreat: [10, 24], ignoreTokens: true, keepAway: true },
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
  /** Arena goal «защити»: a kiosk the enemies go for (team player, does not move). */
  objective: {
    team: 'prop',
    prop: true,
    objective: true,
    noGrab: true,
    hp: 260,
    speedX: 0,
    speedZ: 0,
    jumpV: 0,
    moves: {},
  },
  /** Arena goal «разбей»: a camera on a tripod (no loot). */
  target_cam: {
    team: 'prop',
    prop: true,
    target: true,
    noGrab: true,
    hp: 40,
    speedX: 0,
    speedZ: 0,
    jumpV: 0,
    moves: {},
  },
  /** Museum guard: walks his beat, looks ahead (sim/stealth.js). */
  guard: {
    team: 'enemy',
    title: 'Охранник',
    hp: 70,
    speedX: 3.6,
    speedZ: 2.4,
    jumpV: 0,
    bossAI: 'guard',
    moves: { light: 'e_jab' },
    ai: {},
  },
  /** Concert: 1Kla$ in the rap battle before the fight (sim/bench.js, rap). */
  mc: {
    team: 'prop',
    prop: true,
    keeper: true,
    noGrab: true,
    hp: 9999,
    speedX: 0,
    speedZ: 0,
    jumpV: 0,
    moves: {},
  },
  /** Sigma gym: Гигачад in the pose-off (sim/pose.js). */
  poser: {
    team: 'prop',
    prop: true,
    keeper: true,
    noGrab: true,
    hp: 9999,
    speedX: 0,
    speedZ: 0,
    jumpV: 0,
    moves: {},
  },
  /** Gym: Руки базуки on the next bench (sim/bench.js). */
  rival: {
    team: 'prop',
    prop: true,
    keeper: true,
    noGrab: true,
    hp: 9999,
    speedX: 0,
    speedZ: 0,
    jumpV: 0,
    moves: {},
  },
  /** Village penalties: Дед in goal / at the spot (driven by sim/penalty.js). */
  keeper: {
    team: 'prop',
    prop: true,
    keeper: true,
    noGrab: true,
    hp: 9999,
    speedX: 0,
    speedZ: 0,
    jumpV: 0,
    moves: {},
  },
  /** Dacha basement: Пахом's shadow — freezes in the flashlight beam, a hit banishes him. */
  shade: {
    team: 'enemy',
    title: 'Тень Пахома',
    hp: 999,
    speedX: 3.7,
    speedZ: 2.4,
    jumpV: 0,
    noGrab: true,
    bossAI: 'shade',
    moves: { light: 'e_jab' },
    ai: {},
  },
  /** Arena goal «догони»: runs off with a bag of косари. */
  thief: {
    team: 'enemy',
    title: 'Вор',
    hp: 46,
    speedX: 4.0,
    speedZ: 3.0,
    jumpV: 0,
    bossAI: 'thief',
    moves: { light: 'e_jab' },
    ai: {},
  },
  /** Falling anvil from the original game: crushes, punch it to send it flying. */
  anvil: {
    team: 'prop',
    prop: true,
    anvil: true,
    noGrab: true,
    hp: 1,
    crush: 28,
    lie: 50,
    speedX: 0,
    speedZ: 0,
    jumpV: 0,
    moves: {},
  },
  /**
   * Original boss 1 — Влад Борщ. Throws fused bombs; only bombs punched back
   * at him hurt (3 lives). Brings anvils, later the airship and backup.
   */
  borsch: {
    team: 'enemy',
    boss: true,
    title: 'Влад Борщ',
    hint: 'Отбей бомбу в него ударом!',
    noGrab: true,
    onlyReflected: true,
    bossAI: 'borsch',
    hp: 3,
    speedX: 2.2,
    speedZ: 1.6,
    jumpV: 0,
    moves: { light: 'b_bomb' },
    ai: {},
  },
  /**
   * Original boss 2 — Повар. Lobs pots and skims frying pans; only kitchenware
   * punched back hurts him. Three phases (40/70/100); between them he runs off
   * and forks rain from the sky.
   */
  povar: {
    team: 'enemy',
    boss: true,
    title: 'Повар',
    hint: 'Отбей посуду в него ударом!',
    noGrab: true,
    onlyReflected: true,
    bossAI: 'povar',
    hp: 40,
    phases: [40, 70, 100],
    speedX: 1.9,
    speedZ: 1.4,
    jumpV: 0,
    moves: { light: 'p_pot', heavy: 'p_pan' },
    ai: {},
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

/**
 * Bosses of the meme eras (one per chapter). They reuse the three
 * original boss brains (sim/bosses.js) and an existing rig (brawl/FighterView.js
 * VARIANTS):
 *   reflect — Борщ-style: throws, only his own projectiles punched back hurt (lives)
 *   phases  — Повар-style: 3 phases, retreats between them while things rain down
 *   brawler — big armored melee boss (boss1 stats)
 */
function eraBoss(base, extra) {
  const src = { reflect: FIGHTERS.borsch, phases: FIGHTERS.povar, brawler: FIGHTERS.boss1 }[base];
  return { ...src, ...extra, moves: { ...src.moves, ...(extra.moves || {}) }, ai: { ...(src.ai || {}), ...(extra.ai || {}) } };
}

/** Ground slam that sends a shockwave along the lane (brawler bosses). */
MOVES.b_quake = { ...MOVES.b_slam, projectile: SHOCKWAVE };

/** A thrower's toss with another projectile picture (punch it back as usual). */
function toss(tex, extra = {}) {
  const base = MOVES.e_bottle;
  return { ...base, projectile: { ...base.projectile, tex, ...extra } };
}
/** A small shockwave along the ground. */
const wave = (extra = {}) => ({ ...SHOCKWAVE, ...extra });

Object.assign(MOVES, {
  e_ball: { ...toss('football', { dmg: 10, speed: 8 }), aiRange: [320, 680] },
  e_money: { ...toss('money_pack', { dmg: 12 }), aiRange: [320, 680] },
  e_coin: toss('coin', { dmg: 8, speed: 11 }),
  /** Дед: curls into a ball and rolls through you (Sonic style). */
  e_roll: {
    clip: 'punch_superman_r', roll: true,
    startup: 22, active: 46, recovery: 22,
    dmg: 12, reach: [-20, 70], depth: 30,
    hitstun: 0, kb: 9, knockdown: true, hitstop: 5, lunge: 9.5, lungeActive: true,
    aiRange: [150, 460], aiDepth: 16, sfx: 'punch', heavy: true,
  },
  /** Гительман (sumo): belly push that shoves you across the arena. */
  e_sumo: {
    clip: 'punch_superman_r',
    startup: 16, active: 8, recovery: 22,
    dmg: 10, reach: [0, 104], depth: 34,
    hitstun: 0, kb: 15, knockdown: true, hitstop: 6, lunge: 5, lungeActive: true,
    aiRange: [60, 170], aiDepth: 18, sfx: 'punch', heavy: true,
  },
  /** Гительман: sumo stomp — the floor shakes in both directions. */
  e_stomp: {
    clip: 'rage_stomp',
    startup: 30, active: 4, recovery: 26,
    dmg: 12, reach: [0, 130], depth: 50, sweep: true,
    hitstun: 0, kb: 8, knockdown: true, hitstop: 8, lunge: 0,
    projectile: wave({ life: 40, dmg: 9 }), waveBoth: true,
    aiRange: [0, 200], aiDepth: 40, sfx: 'superudar', heavy: true,
  },
  /** Глад: a scream that stuns everyone in the line. */
  e_scream: {
    clip: 'rage_stomp',
    startup: 24, active: 2, recovery: 26,
    dmg: 0, reach: [0, 0], depth: 0, hitstun: 0, kb: 0, hitstop: 0, lunge: 0,
    projectile: { kind: 'wave', tex: 'shockwave', speed: 11, gravity: 0, life: 45, dmg: 5, hitstun: 50, kb: 2, pierce: true, muzzle: { x: 60, y: 30 } },
    aiRange: [140, 480], aiDepth: 18, sfx: null,
  },
  /** Монгол: shoulder tackle from a run-up. */
  e_tackle: {
    clip: 'punch_superman_r',
    startup: 18, active: 12, recovery: 26,
    dmg: 14, reach: [0, 92], depth: 26,
    hitstun: 0, kb: 10, knockdown: true, hitstop: 6, lunge: 9, lungeActive: true,
    aiRange: [140, 300], aiDepth: 12, sfx: 'superudar', heavy: true,
  },
  /** Руки базуки: slow, huge straight that reaches far. */
  e_bazooka: {
    clip: 'punch_r',
    startup: 24, active: 4, recovery: 24,
    dmg: 20, reach: [20, 172], depth: 30,
    hitstun: 0, kb: 13, knockdown: true, hitstop: 9, lunge: 4,
    aiRange: [90, 170], aiDepth: 14, sfx: 'superudar', heavy: true,
  },
  /** Вертуха: the spinning kick, hits all around. */
  e_vertuha: {
    clip: 'kick_spin_r',
    startup: 14, active: 10, recovery: 20,
    dmg: 15, reach: [0, 136], depth: 40, sweep: true,
    hitstun: 0, kb: 10, knockdown: true, hitstop: 7, lunge: 2,
    aiRange: [30, 130], aiDepth: 24, sfx: 'superudar', heavy: true,
  },
  /** Идущий к реке: a calm palm push out of his way. */
  e_push: {
    clip: 'punch_r',
    startup: 20, active: 4, recovery: 30,
    dmg: 4, reach: [0, 112], depth: 30,
    hitstun: 0, kb: 16, knockdown: true, hitstop: 4, lunge: 1,
    aiRange: [20, 110], aiDepth: 18, sfx: 'udar',
  },
  /** Зубарев: leaps across the arena and lands with a shockwave. */
  e_leap: {
    clip: 'kick_fly_r', air: true, leap: { vy: 13, vx: 7.5 },
    startup: 12, active: 60, recovery: 16,
    dmg: 12, reach: [0, 92], depth: 34,
    hitstun: 0, kb: 8, knockdown: true, hitstop: 6, lunge: 0,
    landWave: wave({ life: 30, dmg: 8 }),
    aiRange: [180, 420], aiDepth: 20, sfx: 'punch', heavy: true,
  },

  // ---- Heroes: each one fights a bit differently
  /** Кама: heavier, slower jabs; a low kick that drops. */
  k_jab1: { ...MOVES.jab1, startup: 5, dmg: 10, kb: 3, next: { light: 'k_jab2', heavy: 'k_low' } },
  k_jab2: { ...MOVES.jab2, startup: 5, dmg: 11, kb: 3.4, next: { light: 'upper', heavy: 'k_low' } },
  k_low: { ...MOVES.kick, startup: 9, dmg: 15, kb: 6, knockdown: true, hitstun: 0, next: { heavy: 'highkick' } },
  /** Свидетель: quick weak triple jab, the spin kick right away on heavy. */
  s_jab1: { ...MOVES.jab1, startup: 3, recovery: 7, dmg: 6, next: { light: 's_jab2', heavy: 'spin' } },
  s_jab2: { ...MOVES.jab2, startup: 3, recovery: 7, dmg: 6, next: { light: 's_jab3', heavy: 'spin' } },
  s_jab3: { ...MOVES.jab1, startup: 3, recovery: 9, dmg: 7, next: { light: 'upper', heavy: 'spin' } },
  /** Пистолетов: boarding charge with the shoulder. */
  p_board: { ...MOVES.dashpunch, startup: 6, active: 9, dmg: 14, lunge: 7.5, next: { light: 'jab1' } },

  // ---- Bosses
  /** Папич: «ГЕНИЙ!» — a wave down the lane both ways. */
  b_genius: {
    clip: 'rage_stomp',
    startup: 30, active: 2, recovery: 24,
    dmg: 0, reach: [0, 0], depth: 0, hitstun: 0, kb: 0, hitstop: 0, lunge: 0,
    projectile: wave({ speed: 10, life: 90, dmg: 14 }), waveBoth: true, sfx: 'superudar',
  },
  /** Понасенков: a fencer's lunge (his long recovery is the window to hit him). */
  m_lunge: {
    clip: 'punch_r',
    startup: 16, active: 5, recovery: 34,
    dmg: 16, reach: [20, 150], depth: 30,
    hitstun: 0, kb: 9, knockdown: true, hitstop: 7, lunge: 7,
    aiRange: [60, 170], sfx: 'superudar', heavy: true,
  },
  /** Гигачад: sprint ram across the arena. */
  c_ram: {
    clip: 'punch_superman_r',
    startup: 26, active: 40, recovery: 30,
    dmg: 18, reach: [0, 96], depth: 32,
    hitstun: 0, kb: 12, knockdown: true, hitstop: 8, lunge: 12, lungeActive: true, sfx: 'superudar', heavy: true,
  },
  /** Гигачад: the pose. Whoever looks at him freezes (sim/bosses.js stuns them). */
  c_pose: {
    clip: 'rage_stomp', pose: true,
    startup: 50, active: 3, recovery: 30,
    dmg: 0, reach: [0, 0], depth: 0, hitstun: 0, kb: 0, hitstop: 0, lunge: 0, sfx: null,
  },
  /** 1Kla$: bass drop — shockwaves both ways. */
  k_drop: {
    clip: 'rage_stomp',
    startup: 20, active: 2, recovery: 18,
    dmg: 0, reach: [0, 0], depth: 0, hitstun: 0, kb: 0, hitstop: 0, lunge: 0,
    projectile: wave({ speed: 11, life: 80, dmg: 12 }), waveBoth: true, sfx: 'superudar',
  },
});

/** Gun moves for the few enemies that carry one (the view puts the gun in their hands). */
Object.assign(MOVES, {
  /** Руки базуки: an actual bazooka — slow rocket, big blast. */
  e_rpg: {
    clip: 'throw_bottle',
    startup: 32, active: 1, recovery: 30,
    dmg: 0, reach: [0, 0], depth: 0, hitstun: 0, kb: 0, hitstop: 0, lunge: 0,
    projectile: { ...WEAPONS[4].proj, speed: 10, muzzle: { x: 90, y: 160 }, explode: { radius: 120, depth: 56, dmg: 22, launch: 8, kb: 8 } },
    shot: 4, aiRange: [300, 680], aiDepth: 16, sfx: null, heavy: true,
  },
  /** Монгол: sawn-off shotgun — short range, a spread of pellets. */
  e_shotgun: {
    clip: 'throw_bottle',
    startup: 24, active: 1, recovery: 32,
    dmg: 0, reach: [0, 0], depth: 0, hitstun: 0, kb: 0, hitstop: 0, lunge: 0,
    projectile: { ...WEAPONS[2].proj, dmg: 7, muzzle: { x: 100, y: 150 } }, pellets: 5,
    shot: 2, aiRange: [300, 520], aiDepth: 14, sfx: null,
  },
  /** Гигачад: «десять ударов подряд» — a blur of fists, then the finisher. */
  c_barrage: {
    clip: 'punch_r', barrage: true,
    startup: 10, active: 60, recovery: 18,
    dmg: 4, reach: [0, 126], depth: 34,
    hitstun: 16, kb: 0.7, hitstop: 2, lunge: 0.5, multiHit: 6, sfx: 'udar',
  },
  c_finish: {
    clip: 'punch_upper_r',
    startup: 6, active: 4, recovery: 26,
    dmg: 16, reach: [0, 126], depth: 34,
    hitstun: 0, kb: 6, launch: 13, knockdown: true, hitstop: 12, lunge: 3, sfx: 'superudar', heavy: true,
  },
  /** Папич: the spear — a red line marks the lane, then it flies hard and straight. */
  b_spear: {
    clip: 'throw_bottle', aimWarn: true,
    startup: 34, active: 1, recovery: 26,
    dmg: 0, reach: [0, 0], depth: 0, hitstun: 0, kb: 0, hitstop: 0, lunge: 0,
    projectile: { kind: 'spear', tex: 'spear', speed: 24, gravity: 0, life: 70, dmg: 20, hitstun: 0, kb: 10, knockdown: true, muzzle: { x: 50, y: 170 } },
    sfx: null, heavy: true,
  },
  /** 1Kla$: spins with the microphone on its cord — it sweeps low around him: jump! */
  k_mic: {
    clip: 'kick_spin_r', sweep: true,
    startup: 16, active: 2, recovery: 18,
    dmg: 0, reach: [0, 0], depth: 0, hitstun: 0, kb: 0, hitstop: 0, lunge: 0,
    projectile: { kind: 'mic', tex: 'microphone', speed: 0, gravity: 0, life: 210, dmg: 14, hitstun: 0, kb: 8, knockdown: true, pierce: true, orbit: { r: 420, w: 0.06, y: 14 } },
    sfx: 'superudar',
  },
});

/** Boss whose body can be hit (not only by reflected throws). */
function brawlBoss(extra) {
  return { team: 'enemy', boss: true, noGrab: true, jumpV: 0, ai: {}, ...extra };
}

/**
 * Bosses of the meme eras — each one fights differently (sim/bosses.js):
 *   Пахом      — blinks between corners, turns the lights off, jar rain
 *   Папич      — shielded: only a donation bomb punched back «lags» him open
 *   Понасенков — parries hits from the front; hit his back or after his lunge
 *   Гигачад    — hit him only in the face; his pose freezes you; sprint ram
 *   1Kla$      — four phases: bass drops, money rain + security, pyro, the last verse
 */
Object.assign(FIGHTERS, {
  pahom: brawlBoss({
    title: 'Пахом', hint: 'Он прячется в тени — лови, когда появится.', bossAI: 'pahom',
    hp: 560, armor: 18, poise: 60, speedX: 2.4, speedZ: 1.8,
    moves: { light: 'b_jab', heavy: 'b_slam' },
  }),
  papich: brawlBoss({
    title: 'Папич', hint: 'Отбей донат-бомбу ему в лицо — пока лагает, бей!', bossAI: 'papich', shield: true,
    hp: 300, speedX: 2.6, speedZ: 1.9,
    moves: { light: 'b_bomb', heavy: 'b_genius' },
  }),
  ponasenkov: brawlBoss({
    title: 'Понасенков', hint: 'Маэстро парирует спереди. Бей со спины или после его выпада.', bossAI: 'maestro', parry: true,
    landWave: wave({ speed: 10, life: 70, dmg: 14 }),
    hp: 480, armor: 10, poise: 70, speedX: 2.8, speedZ: 2.0,
    moves: { light: 'p_pot', heavy: 'm_lunge' },
  }),
  gigachad: brawlBoss({
    title: 'Гигачад', hint: 'Сзади его не пробить — только в лицо. Отвернись, когда позирует!', bossAI: 'chad', frontOnly: true,
    hp: 760, armor: 40, poise: 110, speedX: 3.0, speedZ: 2.0,
    moves: { light: 'c_barrage', heavy: 'b_quake' },
  }),
  klas: brawlBoss({
    title: '1Kla$', hint: 'Финал! Прыгай через бас-дропы, не стой в огне и успей до конца трека.', bossAI: 'klas',
    hp: 900, armor: 22, poise: 80, speedX: 2.8, speedZ: 2.0,
    moves: { light: 'p_pot', heavy: 'b_jab' },
  }),
});

/**
 * Meme enemies: former bosses that now come in waves. Each one debuts in its
 * own map (short meeting dialogue, maps/eras.js `debuts`) and keeps turning up
 * in the maps after it. Every one has his own trick.
 */
Object.assign(FIGHTERS, {
  /** Дед: держит дистанцию, пинает мяч (отбивается), сворачивается в мячик и катится. */
  ded: {
    team: 'enemy', title: 'Дед «я футбольный мячик»', hp: 70, speedX: 2.4, speedZ: 2.2, jumpV: 0,
    moves: { light: 'e_ball', heavy: 'e_roll' },
    ai: { standoff: 480, aggression: 0.85, attackCd: [50, 90], retreat: [12, 26], heavyChance: 0.5, keepAway: true, byChance: true },
  },
  /** Глад: налетает с рывка, визгом оглушает всех в линию. */
  glad: {
    team: 'enemy', title: 'Глад Валакас', hp: 60, speedX: 5.0, speedZ: 3.4, jumpV: 0,
    moves: { light: 'e_rush', heavy: 'e_scream' },
    ai: { standoff: 300, aggression: 1, attackCd: [30, 60], retreat: [30, 50], heavyChance: 0.35 },
  },
  /** Монгол: тяжёлый, терпит удары, сносит плечом с разбега. */
  mongol: {
    team: 'enemy', title: 'Олег Монгол', hp: 160, speedX: 2.6, speedZ: 1.9, jumpV: 0, armor: 26, weapon: 2,
    moves: { light: 'e_shotgun', heavy: 'e_tackle' },
    ai: { standoff: 420, aggression: 0.8, attackCd: [40, 80], retreat: [24, 44], heavyChance: 0.45, rangeSwitch: 300 },
  },
  /** Руки базуки: танк; базука-прямой издалека и удар по земле с волной. */
  ruki: {
    team: 'enemy', title: 'Руки базуки', hp: 230, speedX: 1.9, speedZ: 1.5, jumpV: 0, armor: 45, weapon: 4,
    moves: { light: 'e_bazooka', heavy: 'e_rpg' },
    ai: { standoff: 460, aggression: 0.6, attackCd: [70, 120], retreat: [30, 60], heavyChance: 0.4, rangeSwitch: 300 },
  },
  /** Вертуха: держит блок спереди и контрит вертухой во все стороны. */
  vertuha: {
    team: 'enemy', title: 'Чувак с вертухой', hp: 90, speedX: 3.6, speedZ: 2.6, jumpV: 0, guard: true,
    moves: { light: 'e_jab', heavy: 'e_vertuha' },
    ai: { standoff: 190, aggression: 0.9, attackCd: [24, 50], retreat: [16, 34], heavyChance: 0.55 },
  },
  /** Идущий к реке: идёт напролом, удары не останавливают; спокойно отталкивает. */
  reka: {
    team: 'enemy', title: 'Идущий к реке', hp: 55, speedX: 1.7, speedZ: 1.4, jumpV: 0, armor: 999,
    moves: { light: 'e_jab', heavy: 'e_push' },
    ai: { standoff: 110, aggression: 1, attackCd: [40, 70], retreat: [0, 4], heavyChance: 0.3 },
  },
  /** Зубарев: кидается донат-пачками и прыгает через всю арену с ударной волной. */
  zubarev: {
    team: 'enemy', title: 'Зубарев', hp: 65, speedX: 4.0, speedZ: 3.0, jumpV: 0,
    moves: { light: 'e_leap', heavy: 'e_money' },
    ai: { standoff: 460, aggression: 0.95, attackCd: [40, 75], retreat: [14, 30], heavyChance: 0.3, ignoreTokens: true, keepAway: true },
  },
  /** Гительман: сумоист — толкает пузом через всю арену, топает с волной. */
  gitelman: {
    team: 'enemy', title: 'Гительман', hp: 150, speedX: 1.9, speedZ: 1.6, jumpV: 0, armor: 30,
    moves: { light: 'e_sumo', heavy: 'e_stomp' },
    ai: { standoff: 200, aggression: 0.85, attackCd: [45, 85], retreat: [16, 30], heavyChance: 0.35 },
  },
});

/** Re-skinned throws for the bosses that throw (Пахом's jars, Папич's bombs, books, notes). */
for (const [id, t] of Object.entries(ERA_THROWS)) {
  const def = FIGHTERS[id];
  if (!def?.boss || !t.light) continue;
  const base = id === 'papich' ? MOVES.b_bomb : MOVES.p_pot;
  MOVES[`t_${id}_l`] = { ...base, projectile: t.light };
  def.moves = { ...def.moves, throw: `t_${id}_l` };
  if (t.rain) def.rain = t.rain;
}

/**
 * Everybody moves faster than at first (walking only — lunges and throws keep
 * their distances): enemies and bosses ×1.5, the player ×1.55 (heroes add
 * their own multiplier on top, game/heroes.js).
 */
for (const def of Object.values(FIGHTERS)) {
  if (def.prop) continue;
  const k = def.team === 'player' ? 1.55 : 1.5;
  def.speedX *= k;
  def.speedZ *= k;
}
FIGHTERS.player.dashSpeed = 19;
// Floor so the walk cycle looks like walking, not sliding (brawl/FighterView
// also matches the leg cadence to the real speed)
for (const def of Object.values(FIGHTERS)) {
  if (def.prop || def.team === 'player') continue;
  // (Идущий к реке's huge armor is about not flinching, not about being heavy)
  const heavy = ((def.armor || 0) >= 26 && def.armor < 500) || def.boss;
  const min = heavy ? 4.4 : 5.2;
  if (def.speedX < min) {
    def.speedZ *= min / def.speedX;
    def.speedX = min;
  }
}
// Heroes jump higher
FIGHTERS.player.jumpV = 16.5;
FIGHTERS.player.jumpV2 = 14.5;
