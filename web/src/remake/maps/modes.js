import forest from './forest.js';
import opushka from './opushka.js';
import { panelki, river, streamHouse } from './eras.js';

/**
 * Online modes beside the story («Обычный» = the chapters in co-op), picked in
 * the lobby (ui/Lobby.js). Only what makes sense with friends: one-player
 * minigames (penalties, the bench, the stock exchange...) stay in «Полигон».
 * Every mode is a hidden map (no story scenes, nothing unlocked by it):
 *
 *   Гонка            — everybody in his own Lada, three times the usual road,
 *                      the first one at the finish wins (sim/race.js)
 *   Стенка на стенку — players against each other, rounds, first to 3 wins
 *   Наступление      — the crowd from both sides, growing, hold out 5 minutes;
 *                      a fallen friend gets up if you stand next to him
 *   Сплав            — a long raft trip, the whole squad on one raft
 *   Суперстрим       — Papich's stream house live: the chat (brawl/StreamChat.js)
 *                      writes about every player and votes in every arena —
 *                      for all, or a gift / a trick for one streamer
 */
const sp = (kind, count, from = 'both', every = 30) => ({ kind, count, from, every });

/** A mode from one arena of a story map: same road and scenery, start right before it. */
function arenaMode(map, idx, o) {
  const a = map.arenas[idx];
  const startX = Math.max(80, a.left + 120);
  return {
    ...map,
    id: o.id,
    baseId: map.baseId || map.id,
    hidden: true,
    name: o.title,
    chapter: `Режим «${o.title}»`,
    next: null,
    start: { x: startX, z: 80 },
    debuts: [],
    kosariRain: false,
    arenas: [{ ...a, trigger: startX + 40, reward: [], ...(o.arena || {}) }],
    loading: {
      ...(map.loading || {}),
      title: o.title,
      text: [o.sub, ...(map.loading?.text || []).slice(0, 1)],
      tip: o.tip || map.loading?.tip,
    },
  };
}

// ---------------------------------------------------------------- Гонка
const RACE_LEN = 48000;
const raceArena = opushka.arenas.find((a) => a.race);

export const RACE_LONG = {
  ...opushka,
  id: 'race_long',
  baseId: 'opushka',
  hidden: true,
  name: 'Гонка',
  chapter: 'Режим «Гонка»',
  next: null,
  world: [{ theme: 'highway' }],
  length: 400 + RACE_LEN + 1200,
  start: { x: 220, z: 80 },
  crates: false,
  kosariRain: false,
  debuts: [],
  loading: {
    ...opushka.loading,
    title: 'Гонка',
    text: [
      'Трасса без конца: «Жигули», встречные фуры, мопедисты сзади и кастрюли Повара с неба.',
      'Втрое длиннее обычной гонки. С друзьями — каждый в своей машине, первый на финише забирает бонус.',
    ],
    tip: 'D — газ, A — тормоз, W/S — полоса. Мопедиста сзади сбивай ударом J.',
  },
  arenas: [{ ...raceArena, id: 'race', left: 400, right: 400 + RACE_LEN, trigger: 440, entry: { ...raceArena.entry, at: 360 }, reward: [] }],
};

// ---------------------------------------------------------------- Стенка на стенку
const pvpArena = forest.arenas[1];
export const PVP = {
  ...forest,
  id: 'pvp',
  baseId: 'forest',
  hidden: true,
  name: 'Стенка на стенку',
  chapter: 'Режим «Стенка на стенку»',
  next: null,
  start: { x: pvpArena.left + 300, z: 80 },
  crates: [500, 800],
  kosariRain: false,
  anvils: false,
  airships: false,
  debuts: [],
  loading: {
    ...forest.loading,
    title: 'Стенка на стенку',
    text: ['Игроки против игроков. Никаких Никит — только вы и лесная поляна.', 'Раунд за последним на ногах. Кто первым возьмёт три — победил. С неба падают ящики с оружием.'],
    tip: 'Лови ящики — в них стволы. Захват + бросок работают и на друзей.',
  },
  arenas: [{ id: 'pvp', pvp: true, rounds: 3, left: pvpArena.left, right: pvpArena.right, trigger: pvpArena.left + 340, reward: [], waves: [{ spawns: [] }] }],
};

// ---------------------------------------------------------------- Наступление
const siegeArena = panelki.arenas[2];
const MIX = ['nikita', 'buiniy', 'runner', 'thrower', 'ded', 'mongol', 'glad', 'vertuha'];
export const SIEGE = {
  ...panelki,
  id: 'siege',
  baseId: 'panelki',
  hidden: true,
  name: 'Наступление',
  chapter: 'Режим «Наступление»',
  next: null,
  start: { x: siegeArena.left + 300, z: 80 },
  kosariRain: [300, 500],
  debuts: [],
  loading: {
    ...panelki.loading,
    title: 'Наступление',
    text: ['Двор окружён. Гопота, деды, Глады и Монголы лезут со всех сторон — и с каждой волной их больше.', 'Продержись пять минут. Упавшего друга подними: постой рядом с ним две секунды.'],
    tip: 'Не стой в центре: отходи к стене, чтобы враги шли с одной стороны.',
  },
  arenas: [
    {
      id: 'siege',
      left: siegeArena.left,
      right: siegeArena.right,
      trigger: siegeArena.left + 340,
      goal: { type: 'survive', ticks: 60 * 300 },
      reward: [],
      waves: [
        { spawns: [sp('nikita', 4), sp('buiniy', 2)] },
        { banner: 'Со всех сторон!', spawns: MIX.slice(0, 5).map((k) => sp(k, 2, 'both', 34)) },
        { banner: 'Ещё!', spawns: MIX.map((k) => sp(k, 1, 'both', 26)) },
      ],
    },
  ],
};

// ---------------------------------------------------------------- Сплав
const RAFT_EXTRA = 7000;
const raftArena = river.arenas[1];
const raftWaves = raftArena.waves;
export const RAFT_LONG = {
  ...arenaMode(river, 1, { id: 'raft_long', title: 'Сплав', sub: 'Долгий сплав всем отрядом на одном плоту: брёвна, рыбаки с мостов, никуда не деться.' }),
  length: river.length + RAFT_EXTRA,
};
RAFT_LONG.arenas = [{ ...RAFT_LONG.arenas[0], right: raftArena.right + RAFT_EXTRA, waves: [...raftWaves, ...raftWaves, ...raftWaves].map((w, i) => (i % raftWaves.length ? w : { ...w, banner: i ? 'Ещё рыбаки!' : w.banner })) }];

// ---------------------------------------------------------------- Суперстрим
export const SUPERSTREAM = {
  ...streamHouse,
  id: 'superstream',
  baseId: 'stream_house',
  hidden: true,
  name: 'Суперстрим',
  chapter: 'Режим «Суперстрим»',
  next: null,
  debuts: [],
  // The whole map is live: the chat votes in every arena, the boss included
  arenas: streamHouse.arenas.map((a) => ({ ...a, votes: { every: 620, first: 200 } })),
  loading: {
    ...streamHouse.loading,
    title: 'Суперстрим',
    text: [
      'Вся стрим-хата в прямом эфире, и вы в нём все разом. Чат пишет про каждого, донатит и голосует.',
      'Голосования — то на всех, то на кого-то одного: кому РПГ, кому неуязвимость, а кому ватные ноги. В конце — Папич.',
    ],
    tip: 'Чем больше бьёшь — тем больше у тебя фанатов в голосовании за тебя.',
  },
};

export const MODE_MAPS = [RACE_LONG, PVP, SIEGE, RAFT_LONG, SUPERSTREAM];

/**
 * Lobby list: id, title, line, the map it plays (`map: null` — the chapter
 * picked below), `min` players needed.
 */
export const MODES = [
  { id: 'story', title: 'Обычный', sub: 'Главы истории: волны, боссы, разговоры', map: null, icon: '▶' },
  { id: 'superstream', title: 'Суперстрим', sub: 'Кооп в эфире: чат, донаты, голосования за баффы каждому · Папич', map: SUPERSTREAM.id, icon: '🔴' },
  { id: 'race', title: 'Гонка', sub: 'Каждый в своих «Жигулях» · первый на финише победил', map: RACE_LONG.id, icon: '🚗' },
  { id: 'pvp', title: 'Стенка на стенку', sub: 'Игроки против игроков · раунды до 3 побед', map: PVP.id, icon: '🥊', min: 2 },
  { id: 'siege', title: 'Наступление', sub: 'Кооп: враги со всех сторон · продержись 5 минут', map: SIEGE.id, icon: '🛡' },
  { id: 'raft', title: 'Сплав', sub: 'Кооп: весь отряд на одном плоту · рыбаки и брёвна', map: RAFT_LONG.id, icon: '🌊' },
];

export const modeOfMap = (mapId) => MODES.find((m) => m.map === mapId) || MODES[0];
