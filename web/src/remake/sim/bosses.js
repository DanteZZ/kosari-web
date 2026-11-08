import { BTN } from './input.js';
import { FIGHTERS } from './fighters.js';
import { MOVES } from './moves.js';

/**
 * Original-game bosses. They write `cmd` bits like every other fighter
 * (LIGHT / HEAVY start their throw moves), plus switch world hazards per phase.
 */

const FREE = new Set(['idle', 'walk']);

function nearest(e, players) {
  let best = null;
  let bd = Infinity;
  for (const p of players) {
    const d = Math.abs(p.x - e.x);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function steer(e, goalX, goalZ, dead = 24) {
  let bits = 0;
  if (goalX < e.x - dead) bits |= BTN.LEFT;
  else if (goalX > e.x + dead) bits |= BTN.RIGHT;
  if (goalZ < e.z - 10) bits |= BTN.UP;
  else if (goalZ > e.z + 10) bits |= BTN.DOWN;
  return bits;
}

function wanderZ(world, e) {
  const ai = e.ai;
  if (!ai.zT || --ai.zT <= 0) {
    ai.zT = world.rng.int(90, 180);
    ai.goalZ = world.rng.range(world.bounds.zMin + 15, world.bounds.zMax - 15);
  }
  return ai.goalZ;
}

/** Spawn backup from both arena edges (used on boss phase changes). */
function backup(world, kinds) {
  const p = world.players()[0];
  const half = (world.viewW || 1280) / 2 + 100;
  const cx = p ? p.x : 0;
  kinds.forEach((k, i) => {
    const side = i % 2 ? -1 : 1;
    const x = cx + side * (half + i * 40);
    world.spawn(k, x, world.rng.range(world.bounds.zMin + 10, world.bounds.zMax - 10), { facing: -side });
  });
}

/**
 * Влад Борщ: keeps his distance, lobs bombs on a timer, faster each life.
 * Phase hazards: anvils always, airship from life 2, backup when hurt.
 */
function borsch(world, e, players) {
  const ai = e.ai;
  e.cmd = 0;
  const t = nearest(e, players);
  if (!t) return;
  e.faceX = t.x;
  const def = FIGHTERS[e.kind];
  const lives = def.hp;
  const phase = Math.min(3, Math.max(1, lives + 1 - Math.max(1, e.hp)));
  if (def.hazards !== false) {
    world.anvilEvery = [[230, 340], [170, 260], [120, 200]][phase - 1];
    world.airshipEvery = phase >= 2 ? [600, 900] : null;
  }
  if (ai.lastHp == null) ai.lastHp = e.hp;
  if (e.hp < ai.lastHp) {
    ai.lastHp = e.hp;
    backup(world, phase === 2 ? ['nikita', 'nikita', 'buiniy'] : ['nikita', 'buiniy', 'nikita', 'runner']);
  }
  if (!FREE.has(e.state)) return;

  const pb = world.playerBounds || world.bounds;
  const side = e.x >= t.x ? 1 : -1;
  let goalX = t.x + side * 430;
  if (goalX > pb.xMax - 70 || goalX < pb.xMin + 70) goalX = t.x - side * 430;
  goalX = Math.min(pb.xMax - 70, Math.max(pb.xMin + 70, goalX));
  let bits = steer(e, goalX, wanderZ(world, e), 30);

  if (ai.cd == null) ai.cd = 60;
  if (--ai.cd <= 0) {
    bits |= BTN.LIGHT;
    ai.cd = [92, 72, 54][phase - 1] + world.rng.int(0, 30);
  }
  e.cmd = bits;
}

/**
 * Повар: holds one side of the arena (right, left, right), alternates pots
 * and pans. When a phase's HP runs out he walks off, forks rain, and he comes
 * back from the other side with the next phase.
 */
function povar(world, e, players) {
  const ai = e.ai;
  const def = FIGHTERS[e.kind];
  e.cmd = 0;
  const pb = world.playerBounds || world.bounds;
  const t = nearest(e, players);
  const home = e.phase === 2 ? -1 : 1;

  if (e.retreating && !e.away) {
    // Walk off-screen on his side
    // Off past the arena edge (the map edge may come first — then he hides there)
    const W = world.bounds;
    const off = (t ? t.x : e.x) + home * ((world.viewW || 1280) / 2 + 260);
    const exitX = Math.min(W.xMax - 32, Math.max(W.xMin + 32, off));
    e.faceX = null;
    if (FREE.has(e.state)) e.cmd = steer(e, exitX, e.z, 12);
    if ((home > 0 && e.x >= exitX - 20) || (home < 0 && e.x <= exitX + 20)) {
      e.away = true;
      world.forkRainT = 600;
      world.rainSpec = def.rain || null;
      world.events.push({ type: 'forkRain', id: e.id });
    }
    return;
  }
  if (e.away) {
    if (world.forkRainT > 0) return;
    // Back for the next phase from the other side
    e.phase += 1;
    e.hp = e.maxHp = def.phases[e.phase - 1];
    e.retreating = false;
    e.away = false;
    e.iframes = 0;
    const nh = e.phase === 2 ? -1 : 1;
    const tp = nearest(e, players);
    e.x = (tp ? tp.x : e.x) + nh * ((world.viewW || 1280) / 2 + 160);
    world.events.push({ type: 'bossReturn', id: e.id, phase: e.phase });
    if (e.phase === 3) backup(world, ['nikita', 'buiniy']);
    return;
  }
  if (!t) return;
  e.faceX = t.x;
  if (!FREE.has(e.state)) return;

  const goalX = Math.min(pb.xMax - 150, Math.max(pb.xMin + 150, t.x + home * 470));
  let bits = steer(e, goalX, wanderZ(world, e), 30);
  if (ai.cd == null) ai.cd = 70;
  if (--ai.cd <= 0) {
    ai.flip = !ai.flip;
    // Pans only skim along the lane — use them when lined up
    const lined = Math.abs(t.z - e.z) < 18;
    bits |= ai.flip && lined ? BTN.HEAVY : BTN.LIGHT;
    ai.cd = [[100, 130], [76, 104], [58, 86]][e.phase - 1].reduce((a, b) => world.rng.int(a, b));
  }
  e.cmd = bits;
}


// ====================================================================== meme-era bosses

/** Backup from the current map's roster (the enemies the player knows by now). */
function rosterBackup(world, n) {
  const kinds = world.roster?.length ? world.roster : ['nikita'];
  backup(world, Array.from({ length: n }, (_, i) => kinds[(world.tick + i) % kinds.length]));
}

function aliveBackup(world) {
  return world.fighters.filter((f) => !f.dead && f.team === 'enemy' && !FIGHTERS[f.kind].boss).length;
}

/** Phase 1..n by the share of HP left (n equal parts). */
function hpPhase(e, n) {
  const k = e.hp / e.maxHp;
  return Math.min(n, Math.max(1, n - Math.ceil(k * n) + 1));
}

/** Common walk: keep `dist` from the target at its depth, wander a bit. */
function keepAt(world, e, t, dist, dead = 30) {
  const pb = world.playerBounds || world.bounds;
  const side = e.x >= t.x ? 1 : -1;
  let gx = t.x + side * dist;
  if (gx > pb.xMax - 70 || gx < pb.xMin + 70) gx = t.x - side * dist;
  gx = Math.min(pb.xMax - 70, Math.max(pb.xMin + 70, gx));
  return steer(e, gx, dist < 200 ? t.z : wanderZ(world, e), dead);
}

/** Announce a phase change (the view shows a banner). */
function cue(world, e, text, sub = '') {
  world.events.push({ type: 'bossCue', id: e.id, text, sub });
}

function tickCd(ai, key, min, max, world) {
  if (ai[key] == null) ai[key] = world.rng.int(min, max);
  if (--ai[key] > 0) return false;
  ai[key] = world.rng.int(min, max);
  return true;
}

/**
 * Пахом: прячется и появляется. Бросает банки, вблизи бьёт.
 * Фаза 2 — гаснет свет (видны только глаза), фаза 3 — банки сыплются с
 * потолка и прибегает подмога.
 */
function pahom(world, e, players) {
  const ai = e.ai;
  e.cmd = 0;
  const t = nearest(e, players);
  if (!t) return;
  e.faceX = t.x;
  const ph = hpPhase(e, 3);
  if (ph !== ai.ph) {
    ai.ph = ph;
    if (ph === 2) cue(world, e, 'Свет погас', 'Следи за глазами в темноте');
    if (ph === 3) {
      cue(world, e, 'Пахом угощает', 'Банки сыплются с потолка');
      rosterBackup(world, 2);
    }
  }
  // Lights: off 7 s / on 4 s from phase 2
  if (ph >= 2) {
    ai.darkT = (ai.darkT ?? 0) - 1;
    if (ai.darkT <= 0) {
      world.setDark(!world.dark);
      ai.darkT = world.dark ? 420 : 240;
    }
  }
  if (ph === 3 && world.forkRainT <= 0 && tickCd(ai, 'rainCd', 300, 420, world)) {
    world.forkRainT = 150;
    world.rainSpec = FIGHTERS.pahom.rain || null;
  }
  if (!FREE.has(e.state)) return;
  // Blink to another corner of the arena
  if (tickCd(ai, 'blinkCd', ph === 1 ? 300 : 200, ph === 1 ? 420 : 300, world)) {
    const pb = world.playerBounds || world.bounds;
    const x0 = e.x;
    const side = e.x > t.x ? -1 : 1;
    const reach = Math.min(520, (world.viewW || 1280) / 2 - 140);
    e.x = Math.min(pb.xMax - 120, Math.max(pb.xMin + 120, t.x + side * reach));
    e.z = world.rng.chance(0.5) ? world.bounds.zMin + 20 : world.bounds.zMax - 20;
    e.px = e.x;
    e.iframes = 20;
    world.events.push({ type: 'blink', id: e.id, x0, x: e.x, z: e.z });
    return;
  }
  const d = Math.abs(t.x - e.x);
  let bits = keepAt(world, e, t, d < 160 ? 90 : 320);
  if (tickCd(ai, 'cd', ph === 1 ? 70 : 50, ph === 1 ? 110 : 80, world)) {
    if (d < 150 && Math.abs(t.z - e.z) < 30) world.bossMove(e, world.rng.chance(0.35) ? 'b_slam' : 'b_jab');
    else world.bossMove(e, FIGHTERS.pahom.moves.throw);
    bits = 0;
  }
  e.cmd = bits;
}

/**
 * Папич: щит — обычные удары не проходят. Кидает донат-бомбы: отбитая бомба
 * «лагает» его на пять секунд, тогда бей. «ГЕНИЙ!» — волна по линии.
 * Каждая треть здоровья — зрители из чата.
 */
function papich(world, e, players) {
  const ai = e.ai;
  e.cmd = 0;
  const t = nearest(e, players);
  if (!t) return;
  e.faceX = t.x;
  if (e.vuln > 0) {
    e.vuln -= 1;
    // Lagging: stands still, twitches
    if (e.vuln === 0) cue(world, e, 'Пинг нормализовался', 'Снова щит');
    return;
  }
  const ph = hpPhase(e, 3);
  if (ph !== ai.ph) {
    if (ai.ph) {
      cue(world, e, 'Чат в атаке!', 'Зрители пришли на помощь');
      rosterBackup(world, ph + 1);
    }
    ai.ph = ph;
  }
  if (!FREE.has(e.state)) return;
  let bits = keepAt(world, e, t, 420);
  if (tickCd(ai, 'spear', [260, 200, 150][ph - 1], [360, 280, 220][ph - 1], world)) {
    // The spear: lines up with the player first, a red line warns
    e.z = t.z;
    world.bossMove(e, 'b_spear');
    cue(world, e, 'КОПЬЁ!', 'Уйди с линии!');
    bits = 0;
  } else if (tickCd(ai, 'cd', [80, 64, 50][ph - 1], [110, 90, 72][ph - 1], world)) {
    world.bossMove(e, FIGHTERS.papich.moves.throw);
    bits = 0;
  } else if (tickCd(ai, 'genius', 380, 520, world)) {
    world.bossMove(e, 'b_genius');
    cue(world, e, 'ГЕНИЙ!', '');
    bits = 0;
  }
  e.cmd = bits;
}

/**
 * Понасенков: парирует удары спереди. Выпад рапирой — после него окно.
 * Кидает книги. На 2/3 — оркестр (подмога), на 1/3 — лекция: стоит и читает,
 * книги сыплются, но в это время он открыт.
 */
function maestro(world, e, players) {
  const ai = e.ai;
  e.cmd = 0;
  const t = nearest(e, players);
  if (!t) return;
  const ph = hpPhase(e, 3);
  if (ph !== ai.ph) {
    if (ph === 2) {
      cue(world, e, 'Оркестр!', 'Маэстро позвал своих');
      rosterBackup(world, 3);
    }
    if (ph === 3) ai.lectureCd = 1;
    ai.ph = ph;
  }
  if (e.lecture > 0) {
    // Lecture about Napoleon: open from all sides, books rain
    e.lecture -= 1;
    e.faceX = null;
    if (e.lecture === 0) world.forkRainT = 0;
    return;
  }
  e.faceX = t.x;
  // Enlightenment: rises into the air, throws books from above, comes down with a wave
  if (e.hoverY > 0) {
    ai.flyT -= 1;
    if (FREE.has(e.state) && tickCd(ai, 'airCd', 40, 70, world)) world.bossMove(e, FIGHTERS.ponasenkov.moves.throw);
    if (FREE.has(e.state)) e.cmd = steer(e, t.x + (e.x > t.x ? 160 : -160), t.z, 20);
    if (ai.flyT <= 0) e.hoverY = 0;
    return;
  }
  if (!FREE.has(e.state)) return;
  if (tickCd(ai, 'enlight', 520, 720, world)) {
    e.hoverY = 190;
    ai.flyT = 300;
    cue(world, e, 'Маэстро просвещается', 'Бей в прыжке — или жди, пока спустится');
    return;
  }
  if (ph === 3 && tickCd(ai, 'lectureCd', 600, 760, world)) {
    e.lecture = 240;
    world.forkRainT = 240;
    world.rainSpec = FIGHTERS.ponasenkov.rain || null;
    cue(world, e, 'Лекция о Наполеоне', 'Он увлёкся — бей!');
    return;
  }
  // A parried hit is answered with a lunge
  if (e.counter) {
    e.counter = 0;
    world.bossMove(e, 'm_lunge');
    return;
  }
  const d = Math.abs(t.x - e.x);
  let bits = keepAt(world, e, t, d < 220 ? 130 : 260);
  if (tickCd(ai, 'cd', [70, 56, 46][ph - 1], [100, 84, 70][ph - 1], world)) {
    if (d < 180 && Math.abs(t.z - e.z) < 30) world.bossMove(e, 'm_lunge');
    else world.bossMove(e, FIGHTERS.ponasenkov.moves.throw);
    bits = 0;
  }
  e.cmd = bits;
}

/**
 * Гигачад: бить только в лицо. Позирует — кто смотрит на него, тот замирает.
 * Таран через всю арену. Вблизи — джеб и удар по земле с волной.
 */
function chad(world, e, players) {
  const ai = e.ai;
  e.cmd = 0;
  const t = nearest(e, players);
  if (!t) return;
  e.faceX = t.x;
  const ph = hpPhase(e, 2);
  if (ph !== ai.ph) {
    if (ai.ph) cue(world, e, 'Сигма-режим', 'Быстрее и злее');
    ai.ph = ph;
  }
  // The pose landed: everyone facing him freezes
  if (e.state === 'attack' && e.move === 'c_pose' && e.mt === MOVES.c_pose.startup) {
    for (const p of players) {
      const facing = Math.sign(e.x - p.x) === p.facing;
      if (facing && Math.abs(p.x - e.x) < 700) world.stun(p, 80);
    }
  }
  if (!FREE.has(e.state)) return;
  const d = Math.abs(t.x - e.x);
  if (tickCd(ai, 'pose', ph === 1 ? 420 : 300, ph === 1 ? 560 : 420, world)) {
    world.bossMove(e, 'c_pose');
    cue(world, e, 'Гигачад позирует', 'Отвернись!');
    return;
  }
  if (d > 300 && tickCd(ai, 'ram', 160, 260, world)) {
    world.bossMove(e, 'c_ram');
    return;
  }
  // Barrage done → uppercut finisher
  if (ai.finish) {
    ai.finish = false;
    world.bossMove(e, 'c_finish');
    return;
  }
  let bits = keepAt(world, e, t, 100, 20);
  if (d < 170 && Math.abs(t.z - e.z) < 30 && tickCd(ai, 'cd', ph === 1 ? 40 : 28, ph === 1 ? 70 : 50, world)) {
    const r = world.rng.range(0, 1);
    if (r < 0.45) {
      world.bossMove(e, 'c_barrage');
      ai.finish = true;
      cue(world, e, 'ДЕСЯТЬ УДАРОВ', '');
    } else {
      world.bossMove(e, r < 0.75 ? 'b_quake' : 'b_jab');
    }
    bits = 0;
  }
  e.cmd = bits;
}

/**
 * 1Kla$ — финальный босс, четыре фазы по четверти здоровья:
 *   1. Рэп: бит, на каждый второй — бас-дроп (волны в обе стороны), ноты.
 *   2. Деньги: с неба сыплются пачки-ловушки, выходит охрана.
 *   3. Пиротехника: огненные метки на полу — через секунду они взрываются.
 *   4. Последний куплет: всё сразу и быстрее; не успел за 45 с — трек
 *      на повтор, он восстанавливает здоровье до начала куплета.
 */
function klas(world, e, players) {
  const ai = e.ai;
  e.cmd = 0;
  const t = nearest(e, players);
  if (!t) return;
  e.faceX = t.x;
  const ph = hpPhase(e, 4);
  if (ph !== ai.ph) {
    ai.ph = ph;
    ai.beat = 0;
    if (ph === 1) cue(world, e, 'Куплет первый', 'Прыгай через бас-дроп');
    if (ph === 2) {
      cue(world, e, 'Деньги на ветер', 'Пачки взрываются — охрана на сцене');
      rosterBackup(world, 3);
    }
    if (ph === 3) cue(world, e, 'Пиротехника!', 'Уходи с огненных меток');
    if (ph === 4) {
      cue(world, e, 'Последний куплет', 'Успей до конца трека!');
      ai.verseT = 45 * 60;
      ai.verseHp = e.hp;
      world.events.push({ type: 'verse', id: e.id, ticks: ai.verseT });
    }
  }
  const fast = ph === 4;
  // Flies by default; lands for a few seconds every so often (the window to beat him)
  if (ai.air == null) {
    ai.air = true;
    e.hoverY = 210;
    ai.airT = 420;
  }
  ai.airT -= 1;
  if (ai.airT <= 0) {
    ai.air = !ai.air;
    e.hoverY = ai.air ? 210 : 0;
    ai.airT = ai.air ? (fast ? 300 : 420) : fast ? 160 : 220;
    if (!ai.air) cue(world, e, 'Спустился на сцену', 'Бей сейчас!');
  }
  // The microphone on its cord sweeps low around him — jump over it
  if (FREE.has(e.state) && tickCd(ai, 'mic', fast ? 200 : 300, fast ? 280 : 420, world)) {
    world.bossMove(e, 'k_mic');
    cue(world, e, 'Микрофон!', 'Перепрыгивай!');
  }
  // The beat: every 90 ticks (60 in the last verse); bass drop every second beat
  ai.beatT = (ai.beatT ?? 90) - 1;
  if (ai.beatT <= 0) {
    ai.beatT = fast ? 60 : 90;
    ai.beat = (ai.beat || 0) + 1;
    world.events.push({ type: 'beat', id: e.id, drop: ai.beat % 2 === 0 });
    if (ai.beat % 2 === 0 && (ph === 1 || fast)) world.bossMove(e, 'k_drop');
  }
  // Money rain (2, 4)
  if ((ph === 2 || fast) && world.forkRainT <= 0 && tickCd(ai, 'rainCd', 200, 300, world)) {
    world.forkRainT = 160;
    world.rainSpec = FIGHTERS.klas.rain || null;
  }
  // Security keeps coming in phase 2
  if (ph === 2 && aliveBackup(world) < 2 && tickCd(ai, 'guards', 500, 700, world)) rosterBackup(world, 2);
  // Pyro (3, 4)
  if ((ph === 3 || fast) && tickCd(ai, 'pyro', fast ? 50 : 70, fast ? 80 : 110, world)) {
    for (const p of players) world.addZone(p.x + world.rng.range(-40, 40), p.z + world.rng.range(-20, 20), fast ? 50 : 65);
    world.addZone(world.rng.range((world.playerBounds || world.bounds).xMin, (world.playerBounds || world.bounds).xMax), world.rng.range(world.bounds.zMin, world.bounds.zMax), 70);
  }
  // The last verse is on a timer
  if (fast && ai.verseT > 0) {
    ai.verseT -= 1;
    if (ai.verseT === 0) {
      e.hp = Math.min(e.maxHp, Math.max(e.hp, ai.verseHp));
      ai.verseT = 45 * 60;
      cue(world, e, 'Трек на повтор!', 'Он восстановился — ещё раз');
      world.events.push({ type: 'verse', id: e.id, ticks: ai.verseT });
    }
  }
  if (!FREE.has(e.state)) return;
  const d = Math.abs(t.x - e.x);
  let bits = keepAt(world, e, t, d < 160 ? 100 : 300);
  if (tickCd(ai, 'cd', fast ? 36 : 60, fast ? 60 : 96, world)) {
    if (d < 150 && Math.abs(t.z - e.z) < 30) world.bossMove(e, 'b_jab');
    else world.bossMove(e, FIGHTERS.klas.moves.throw);
    bits = 0;
  }
  e.cmd = bits;
}

export const BOSS_AI = { borsch, povar, pahom, papich, maestro, chad, klas };
