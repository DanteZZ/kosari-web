import { MOVES } from './moves.js';
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

Object.assign(FIGHTERS, {
  pahom: eraBoss('phases', { title: 'Пахом', hint: 'Отбей банку в него ударом!', hp: 45, phases: [45, 75, 105] }),
  papich: eraBoss('reflect', { title: 'Папич', hint: 'Отбей донат-бомбу ему в лицо!', hp: 4 }),
  ponasenkov: eraBoss('phases', { title: 'Понасенков', hint: 'Маэстро ранит только отбитое!', hp: 50, phases: [50, 80, 110] }),
  gigachad: eraBoss('brawler', { title: 'Гигачад', hp: 820, speedX: 3.0, armor: 60, poise: 130 }),
  klas: eraBoss('phases', { title: '1Kla$', hint: 'Финал! Отбей снаряды в него и не стой под бас-дропом.', hp: 70, phases: [70, 110, 150] }),
});

/** A thrower's toss with another projectile picture (punch it back as usual). */
function toss(tex, extra = {}) {
  const base = MOVES.e_bottle;
  return { ...base, projectile: { ...base.projectile, tex, ...extra } };
}
MOVES.e_ball = toss('football', { dmg: 10, speed: 8 });
MOVES.e_money = toss('money_pack', { dmg: 12 });
MOVES.e_coin = toss('coin', { dmg: 8, speed: 11 });

/**
 * Meme enemies: former bosses that now come in waves. Each one debuts in its
 * own map (short meeting dialogue, maps/eras.js `debuts`) and keeps turning up
 * in the maps after it. `title` names them on the meeting card.
 */
Object.assign(FIGHTERS, {
  /** Метатель мячей: держит дистанцию и пинает мяч (отбивается), вблизи катится в ноги. */
  ded: {
    team: 'enemy', title: 'Дед «я футбольный мячик»', hp: 70, speedX: 2.4, speedZ: 2.2, jumpV: 0,
    moves: { light: 'e_ball', heavy: 'e_rush' },
    ai: { standoff: 380, aggression: 0.85, attackCd: [50, 90], retreat: [12, 26], heavyChance: 0.3 },
  },
  /** Бешеный бегун: налетает с рывка через всю арену и добивает с руки. */
  glad: {
    team: 'enemy', title: 'Глад Валакас', hp: 60, speedX: 5.8, speedZ: 3.4, jumpV: 0,
    moves: { light: 'e_rush', heavy: 'e_jab' },
    ai: { standoff: 300, aggression: 1, attackCd: [30, 60], retreat: [30, 50], heavyChance: 0.35 },
  },
  /** Тяжёлый: терпит лёгкие удары, бьёт с ноги в нокаут. */
  mongol: {
    team: 'enemy', title: 'Олег Монгол', hp: 160, speedX: 2.6, speedZ: 1.9, jumpV: 0, armor: 26,
    moves: { light: 'e_jab', heavy: 'e_heavy' },
    ai: { standoff: 200, aggression: 0.8, attackCd: [40, 80], retreat: [24, 44], heavyChance: 0.45 },
  },
  /** Танк: медленный, в броне, удар по земле пускает волну. */
  ruki: {
    team: 'enemy', title: 'Руки базуки', hp: 230, speedX: 1.9, speedZ: 1.5, jumpV: 0, armor: 45,
    moves: { light: 'e_heavy', heavy: 'b_quake' },
    ai: { standoff: 220, aggression: 0.6, attackCd: [70, 120], retreat: [30, 60], heavyChance: 0.3 },
  },
  /** Дуэлянт: держит блок спереди и контрит вертухой. Обходи или бей с ноги. */
  vertuha: {
    team: 'enemy', title: 'Чувак с вертухой', hp: 90, speedX: 3.6, speedZ: 2.6, jumpV: 0, guard: true,
    moves: { light: 'e_jab', heavy: 'e_heavy' },
    ai: { standoff: 190, aggression: 0.9, attackCd: [24, 50], retreat: [16, 34], heavyChance: 0.6 },
  },
  /** Ходок: идёт напролом, удары его не останавливают — но здоровья мало. */
  reka: {
    team: 'enemy', title: 'Идущий к реке', hp: 55, speedX: 1.7, speedZ: 1.4, jumpV: 0, armor: 999,
    moves: { light: 'e_jab' },
    ai: { standoff: 110, aggression: 1, attackCd: [40, 70], retreat: [0, 4] },
  },
  /** Прыгун: швыряет донат-пачки издалека и налетает в прыжке. */
  zubarev: {
    team: 'enemy', title: 'Зубарев', hp: 65, speedX: 4.0, speedZ: 3.0, jumpV: 0,
    moves: { light: 'e_money', heavy: 'e_rush' },
    ai: { standoff: 360, aggression: 0.95, attackCd: [40, 75], retreat: [14, 30], heavyChance: 0.35, ignoreTokens: true },
  },
  /** Трейдер: в костюме держит блок спереди и кидается монетами. */
  gitelman: {
    team: 'enemy', title: 'Гительман', hp: 80, speedX: 2.4, speedZ: 2.0, jumpV: 0, guard: true,
    moves: { light: 'e_coin', heavy: 'e_jab' },
    ai: { standoff: 340, aggression: 0.8, attackCd: [45, 85], retreat: [12, 28], heavyChance: 0.25 },
  },
});

/**
 * Give each era boss its own throws (re-skinned original throw moves) and the
 * thing that rains down between its phases.
 */
for (const [id, t] of Object.entries(ERA_THROWS)) {
  const def = FIGHTERS[id];
  if (!def?.boss) continue;
  const base = def.bossAI === 'borsch' ? MOVES.b_bomb : MOVES.p_pot;
  if (t.light) {
    MOVES[`t_${id}_l`] = { ...base, projectile: t.light };
    def.moves = { ...def.moves, light: `t_${id}_l` };
  }
  if (t.heavy && def.bossAI === 'povar') {
    MOVES[`t_${id}_h`] = { ...MOVES.p_pan, projectile: t.heavy };
    def.moves = { ...def.moves, heavy: `t_${id}_h` };
  }
  if (t.rain) def.rain = t.rain;
}
FIGHTERS.gigachad.moves = { ...FIGHTERS.gigachad.moves, heavy: 'b_quake' };
