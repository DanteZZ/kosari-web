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
 * Bosses of the meme eras. Until their own art exists they reuse the three
 * original boss brains (sim/bosses.js) and an existing rig (brawl/FighterView.js
 * VARIANTS):
 *   reflect — Борщ-style: throws, only his own projectiles punched back hurt (lives)
 *   phases  — Повар-style: 3 phases, retreats between them while things rain down
 *   brawler — big armored melee boss (boss1 stats)
 */
function eraBoss(base, extra) {
  const src = { reflect: FIGHTERS.borsch, phases: FIGHTERS.povar, brawler: FIGHTERS.boss1 }[base];
  return { ...src, ...extra, ai: { ...(src.ai || {}), ...(extra.ai || {}) } };
}

Object.assign(FIGHTERS, {
  ded: eraBoss('reflect', { title: 'Дед «я футбольный мячик»', hint: 'Отбей его снаряд обратно ударом!', hazards: false, hp: 3 }),
  pahom: eraBoss('phases', { title: 'Пахом', hint: 'Отбей банку в него ударом!', hp: 45, phases: [45, 75, 105] }),
  glad: eraBoss('brawler', { title: 'Глад Валакас', hp: 260, speedX: 3.6, armor: 18, poise: 50 }),
  mongol: eraBoss('brawler', { title: 'Олег Монгол', hp: 520, armor: 34, poise: 80 }),
  papich: eraBoss('reflect', { title: 'Папич', hint: 'Отбей донат-бомбу ему в лицо!', hp: 4 }),
  vertuha: eraBoss('brawler', { title: 'Чувак с вертухой', hp: 240, speedX: 4.2, speedZ: 2.8, armor: 12, poise: 45,
    ai: { attackCd: [20, 40], heavyChance: 0.6 } }),
  ruki: eraBoss('brawler', { title: 'Руки базуки', hp: 680, speedX: 2.2, armor: 48, poise: 110 }),
  ponasenkov: eraBoss('phases', { title: 'Понасенков', hint: 'Маэстро ранит только отбитое!', hp: 50, phases: [50, 80, 110] }),
  reka: eraBoss('phases', { title: 'Идущий к реке', hint: 'Отбей снаряд обратно — и держись подальше от воды.', hp: 55, phases: [55, 85, 115] }),
  gigachad: eraBoss('brawler', { title: 'Гигачад', hp: 820, speedX: 3.0, armor: 60, poise: 130 }),
  zubarev: eraBoss('reflect', { title: 'Зубарев', hint: 'Отбей его «донат» обратно!', hp: 5 }),
  gitelman: eraBoss('phases', { title: 'Гительман', hint: 'Инвестируй в удар: отбей снаряд!', hp: 60, phases: [60, 95, 130] }),
  klas: eraBoss('phases', { title: '1Kla$', hint: 'Финал! Отбей снаряды в него и не стой под бас-дропом.', hp: 70, phases: [70, 110, 150] }),
});
