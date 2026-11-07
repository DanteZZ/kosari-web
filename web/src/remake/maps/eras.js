/**
 * Meme-era chapters 2–6 and the finale. Same format as forest.js; built with
 * eraMap() so every map shares the proven arena geometry of «Опушка»:
 * three locked arenas, then the boss arena at the end of the road.
 *
 * world: background segments along the road (brawl/world/ThemeWorld.js). Joins sit
 *        in the gaps between arenas (1600 / 2930 / 4250), never inside a locked fight.
 * One boss per chapter (the second map). The first map of a chapter ends in
 * a «finale» arena instead: the debut of a new meme enemy (elite, with a short
 * meeting dialogue — `debuts`); after that he turns up in regular waves.
 */

const GEOM = [
  { trigger: 720, left: 380, right: 1500 },
  { trigger: 2000, left: 1700, right: 2850 },
  { trigger: 3300, left: 3000, right: 4150 },
];
const BOSS = { trigger: 4650, left: 4350, right: 5600 };
/** HP multiplier of a debuting meme enemy. */
const ELITE = 2.2;

/**
 * @param {object} o
 * @param {Array<Array<object>>} o.arenas  waves for each of the 3 arenas
 * @param {Array<object>} [o.boss]         waves of the boss arena
 * @param {Array<object>} [o.finale]       or: waves of a last, non-boss arena
 * @param {string[]} [o.debuts]            meme enemies first met on this map
 */
function eraMap(o) {
  return {
    id: o.id,
    name: o.name,
    chapter: o.chapter,
    next: o.next,
    length: 5600,
    start: { x: 260, z: 80 },
    scaling: o.scaling ?? 0.12,
    world: o.world,
    loading: o.loading,
    anvils: o.anvils ?? false,
    airships: o.airships ?? false,
    kosariRain: o.kosariRain,
    debuts: o.debuts || [],
    arenas: [
      ...o.arenas.map((waves, i) => ({
        id: `${o.id}${i + 1}`,
        ...GEOM[i],
        reward: [{ kind: 'heal', amount: 40 + i * 20 }],
        waves,
      })),
      o.boss
        ? { id: 'boss', boss: true, ...BOSS, waves: o.boss }
        : { id: 'finale', ...BOSS, reward: [{ kind: 'heal', amount: 100 }], waves: o.finale },
    ],
  };
}

const sp = (kind, count, from = 'both', every = 30) => ({ kind, count, from, every });
/** Elite spawn: a meme enemy's debut. */
const el = (kind, count = 1, from = 'right', every = 40) => ({ kind, count, from, every, elite: ELITE });

export const village = eraMap({
  id: 'village',
  name: 'Деревня',
  chapter: 'Глава 2 · Ранний ютуб',
  next: 'dacha',
  world: [{ theme: 'village', to: 4250 }, { theme: 'stadium' }],
  loading: {
    title: 'Деревня',
    art: 'ded',
    text: [
      '2009 год. Интернет медленный, видео — мутные, а звёзды рождаются прямо в огородах.',
      'В деревне за полем есть стадион. Ворота без сетки, трибуна на три лавки, и один дед, который уверен, что он футбольный мячик.',
      'Спорить с ним никто не решался. Наш герой — решился.',
    ],
    tip: 'Дед держится подальше и пинает мячи. Мяч можно отбить ударом обратно в него.',
  },
  debuts: ['ded'],
  arenas: [
    [{ spawns: [sp('nikita', 3, 'right', 40)] }, { spawns: [sp('nikita', 4, 'both', 28)] }],
    [{ nextAt: 1, spawns: [sp('nikita', 3), sp('runner', 2, 'left', 50)] }, { banner: 'Болельщики!', spawns: [sp('runner', 4, 'both', 26)] }],
    [{ spawns: [sp('thrower', 2, 'right', 60), sp('nikita', 3)] }, { banner: 'С поля!', spawns: [sp('buiniy', 2), sp('nikita', 3, 'drop', 30)] }],
  ],
  finale: [
    { banner: 'Дед «я футбольный мячик»', spawns: [el('ded')] },
    { banner: 'Дедова команда', spawns: [sp('ded', 2, 'both', 60), sp('runner', 2)] },
  ],
});

export const dacha = eraMap({
  id: 'dacha',
  name: 'Дача',
  chapter: 'Глава 2 · Ранний ютуб',
  next: 'panelki',
  world: [{ theme: 'dacha', to: 4250 }, { theme: 'cellar' }],
  loading: {
    title: 'Дача',
    art: 'pahom',
    text: [
      'Дачный посёлок: теплицы, сараи, банки с огурцами. И подвал, о котором соседи говорят шёпотом.',
      'Там, среди банок и труб, живёт Пахом. Зелёный свет, тихая песня и очень странный взгляд.',
      'Косари, говорят, лежат как раз в том подвале.',
    ],
    tip: 'Пахом уходит в тень между фазами — в это время с потолка сыплется всякое. Держись в движении.',
  },
  arenas: [
    [{ spawns: [sp('nikita', 4, 'both', 30)] }, { banner: 'Дачники!', spawns: [sp('thrower', 2, 'left', 50), sp('nikita', 2)] }],
    [{ nextAt: 1, spawns: [sp('ded', 1, 'right'), sp('nikita', 3)] }, { spawns: [sp('buiniy', 2), sp('runner', 2, 'right', 40)] }],
    [{ spawns: [sp('ded', 2, 'both', 50), sp('thrower', 1)] }, { banner: 'В подвал', spawns: [sp('nikita', 5, 'drop', 20), sp('blocker', 1, 'left')] }],
  ],
  boss: [{ banner: 'Пахом', spawns: [sp('pahom', 1, 'right')] }],
});

export const panelki = eraMap({
  id: 'panelki',
  name: 'Панельки',
  chapter: 'Глава 3 · Эпоха стримов',
  next: 'pc_club',
  world: [{ theme: 'panelki' }],
  loading: {
    title: 'Панельки',
    art: 'mongol',
    text: [
      '2014-й. Во дворах между панельками решаются все вопросы, и решаются быстро.',
      'Футбольные деды добрались и сюда. А за гаражами ждёт Олег Монгол — и это уже не слухи.',
      'Пройти двор можно только насквозь.',
    ],
    tip: 'Монгол бьёт тяжело и терпит лёгкие удары. Бросай в него его же дворовых или пробивай комбо с рывка.',
  },
  debuts: ['mongol'],
  arenas: [
    [{ spawns: [sp('nikita', 4, 'both', 26)] }, { banner: 'Гопота!', spawns: [sp('runner', 3), sp('buiniy', 1, 'right')] }],
    [{ spawns: [sp('ded', 2, 'right', 50), sp('nikita', 3)] }, { spawns: [sp('blocker', 2), sp('runner', 2)] }],
    [{ nextAt: 1, spawns: [sp('blocker', 2), sp('thrower', 2, 'right', 50)] }, { banner: 'За гаражами', spawns: [sp('buiniy', 2), sp('ded', 1), sp('runner', 2)] }],
  ],
  finale: [
    { banner: 'Олег Монгол', spawns: [el('mongol')] },
    { banner: 'Дворовые', spawns: [sp('mongol', 1, 'left'), sp('nikita', 4, 'both', 30)] },
  ],
});

export const pcClub = eraMap({
  id: 'pc_club',
  name: 'Компьютерный клуб',
  chapter: 'Глава 3 · Эпоха стримов',
  next: 'gym',
  world: [{ theme: 'pc_club' }],
  loading: {
    title: 'Компьютерный клуб',
    art: 'glad',
    text: [
      'Подвальный клуб: ЭЛТ-мониторы, липкие клавиатуры, запах энергетика.',
      'Где-то за дальним компом орёт Глад Валакас — так, что дрожат стёкла. Он слышит всё и всех.',
      'Зрители сегодня злые.',
    ],
    tip: 'Глад налетает с рывка через всю арену. Отойди в сторону по глубине — и бей, пока он встаёт.',
  },
  debuts: ['glad'],
  arenas: [
    [{ spawns: [sp('nikita', 4)] }, { banner: 'Школьники!', spawns: [sp('runner', 4, 'both', 24)] }],
    [{ nextAt: 1, spawns: [sp('mongol', 1, 'right'), sp('thrower', 2)] }, { spawns: [sp('blocker', 2), sp('ded', 2)] }],
    [{ spawns: [sp('buiniy', 2), sp('runner', 2)] }, { banner: 'Чат в атаке', spawns: [sp('nikita', 6, 'drop', 18)] }],
  ],
  finale: [
    { banner: 'Глад Валакас', spawns: [el('glad')] },
    { banner: 'Рейд из чата', spawns: [sp('glad', 2, 'both', 50), sp('mongol', 1, 'right')] },
  ],
});

export const gym = eraMap({
  id: 'gym',
  name: 'Качалка',
  chapter: 'Глава 4 · Пабликовая эпоха',
  next: 'museum',
  world: [{ theme: 'gym_street', to: 1600 }, { theme: 'gym' }],
  loading: {
    title: 'Качалка',
    art: 'ruki',
    text: [
      '2017-й. Паблики, хайп и качалка в подвале жилого дома.',
      'У входа крутится чувак, прославившийся вертухой. Внутри — Руки базуки: руки как у статуи, мозг — по остаточному принципу.',
      'В качалке не разговаривают. В качалке бьют.',
    ],
    tip: 'Вертуха держит блок спереди — бей с ноги или заходи сбоку. Руки базуки почти не вздрагивает: уходи рывком от его удара по земле.',
  },
  debuts: ['vertuha', 'ruki'],
  arenas: [
    [{ spawns: [sp('nikita', 3), sp('glad', 1)] }, { banner: 'Чувак с вертухой', spawns: [el('vertuha')] }],
    [{ nextAt: 1, spawns: [sp('blocker', 3, 'both', 40)] }, { banner: 'Качки!', spawns: [sp('buiniy', 2, 'both', 50), sp('mongol', 1)] }],
    [{ spawns: [sp('vertuha', 1), sp('thrower', 2)] }, { spawns: [sp('buiniy', 2), sp('glad', 2)] }],
  ],
  finale: [
    { banner: 'Руки базуки', spawns: [el('ruki')] },
    { banner: 'Вся качалка', spawns: [sp('vertuha', 1, 'left'), sp('buiniy', 2)] },
  ],
});

export const museum = eraMap({
  id: 'museum',
  name: 'Музей',
  chapter: 'Глава 4 · Пабликовая эпоха',
  next: 'river',
  world: [{ theme: 'museum' }],
  loading: {
    title: 'Музей',
    art: 'ponasenkov',
    text: [
      'Залы с колоннами, бюсты, картины в золочёных рамах.',
      'Здесь хозяйничает Маэстро. Он знает всё о Наполеоне и ещё больше — о собственной гениальности.',
      'Смотрители музея охраняют его покой с неожиданным рвением.',
    ],
    tip: 'Маэстро ранит только то, что ты отбил ему обратно. Между фазами он уходит — уворачивайся от падающего.',
  },
  arenas: [
    [{ spawns: [sp('blocker', 2), sp('nikita', 2)] }, { spawns: [sp('vertuha', 2, 'both', 40)] }],
    [{ nextAt: 1, spawns: [sp('ded', 2), sp('thrower', 1)] }, { banner: 'Смотрители!', spawns: [sp('blocker', 3, 'both', 40), sp('mongol', 1)] }],
    [{ spawns: [sp('ruki', 1, 'right'), sp('glad', 2)] }, { spawns: [sp('vertuha', 1), sp('blocker', 2)] }],
  ],
  boss: [{ banner: 'Понасенков', spawns: [sp('ponasenkov', 1, 'right')] }],
});

export const river = eraMap({
  id: 'river',
  name: 'Река',
  chapter: 'Глава 5 · Сигма-эпоха',
  next: 'sigma_gym',
  world: [{ theme: 'river' }],
  loading: {
    title: 'Река',
    art: 'reka',
    text: [
      '2019-й. Туман над водой, ивы, фонари на набережной.',
      'Кто-то просто идёт к реке. Спокойно. Без спешки. А за ним — ещё один. И ещё.',
      'Рыбаки на берегу явно что-то знают.',
    ],
    tip: 'Идущих к реке не остановить ударом — они идут прямо на тебя. Зато падают быстро: не давай себя окружить.',
  },
  debuts: ['reka'],
  arenas: [
    [{ spawns: [sp('nikita', 4)] }, { banner: 'Рыбаки!', spawns: [sp('ded', 2, 'both', 40), sp('thrower', 1)] }],
    [{ nextAt: 1, spawns: [sp('glad', 2, 'both', 40)] }, { spawns: [sp('ruki', 1), sp('blocker', 2)] }],
    [{ spawns: [sp('vertuha', 1), sp('runner', 3)] }, { banner: 'Туман', spawns: [sp('nikita', 4, 'drop', 18), sp('mongol', 1)] }],
  ],
  finale: [
    { banner: 'Идущий к реке', spawns: [el('reka')] },
    { banner: 'Все идут к реке', spawns: [sp('reka', 5, 'both', 30)] },
  ],
});

export const sigmaGym = eraMap({
  id: 'sigma_gym',
  name: 'Зал сигм',
  chapter: 'Глава 5 · Сигма-эпоха',
  next: 'stream_house',
  world: [{ theme: 'sigma_gym', to: 4250 }, { theme: 'ring' }],
  loading: {
    title: 'Зал сигм',
    art: 'gigachad',
    text: [
      'Мир стал чёрно-белым. Резкий свет, античные статуи и тишина, которую нарушает только звон блинов.',
      'Где-то в центре этой тишины стоит Гигачад. Ему не нужно ничего доказывать.',
      'А вот тебе — придётся.',
    ],
    tip: 'Гигачад — самый бронированный из всех. Ищи окно после его удара и не жалей ярость.',
  },
  arenas: [
    [{ spawns: [sp('blocker', 2), sp('reka', 2)] }, { banner: 'Сигмы!', spawns: [sp('runner', 2), sp('vertuha', 2)] }],
    [{ nextAt: 1, spawns: [sp('ruki', 1), sp('reka', 2)] }, { spawns: [sp('mongol', 2), sp('ded', 1)] }],
    [{ spawns: [sp('glad', 2), sp('blocker', 2)] }, { spawns: [sp('ruki', 1, 'left'), sp('reka', 3, 'both', 30)] }],
  ],
  boss: [
    { banner: 'Гигачад', nextAt: 1, spawns: [sp('gigachad', 1, 'right')] },
    { bossHpBelow: 0.5, spawns: [sp('reka', 3)] },
  ],
});

export const streamHouse = eraMap({
  id: 'stream_house',
  name: 'Стрим-хата',
  chapter: 'Глава 6 · Новая волна',
  next: 'office',
  world: [{ theme: 'stream_house' }],
  loading: {
    title: 'Стрим-хата',
    art: 'papich',
    text: [
      '2022-й. Неон, кольцевые лампы и камеры в каждом углу.',
      'В стрим-хате живут громко: Зубарев прыгает, орёт и швыряет донатами. А главный эфир ведёт Папич — и чат сегодня на его стороне.',
      'Каждый удар здесь кто-то снимает.',
    ],
    tip: 'Папич бросает «донаты». Отбей их ударом ему в лицо — гением тут будешь ты.',
  },
  debuts: ['zubarev'],
  arenas: [
    [{ spawns: [sp('runner', 3), sp('glad', 1)] }, { banner: 'Донатеры!', spawns: [sp('ded', 2), sp('thrower', 1)] }],
    [{ banner: 'Зубарев', spawns: [el('zubarev')] }, { spawns: [sp('zubarev', 2, 'both', 40), sp('blocker', 2)] }],
    [{ spawns: [sp('reka', 3), sp('vertuha', 1)] }, { banner: 'Чат в атаке', spawns: [sp('zubarev', 1), sp('nikita', 4, 'drop', 18)] }],
  ],
  boss: [
    { banner: 'Папич', nextAt: 1, spawns: [sp('papich', 1, 'right')] },
    { spawns: [sp('zubarev', 2, 'both', 60)] },
  ],
});

export const office = eraMap({
  id: 'office',
  name: 'Бизнес-центр',
  chapter: 'Глава 6 · Новая волна',
  next: 'concert',
  world: [{ theme: 'office', to: 4250 }, { theme: 'trading' }],
  loading: {
    title: 'Бизнес-центр',
    art: 'gitelman',
    text: [
      'Стекло, ковролин и мониторы с графиками, которые всегда идут не туда.',
      'Гительман предлагает инвестиции. Отказы не принимаются — их перехватывают охрана и стримеры, которым он уже продал курс.',
      'Пора закрыть позицию. Кулаком.',
    ],
    tip: 'Гительман держит блок спереди и кидается монетами. Монету можно отбить, а самого — бить с ноги или со спины.',
  },
  debuts: ['gitelman'],
  arenas: [
    [{ spawns: [sp('blocker', 2), sp('zubarev', 2)] }, { banner: 'Охрана!', spawns: [sp('mongol', 1), sp('blocker', 2)] }],
    [{ nextAt: 1, spawns: [sp('ded', 2), sp('glad', 2)] }, { spawns: [sp('ruki', 1), sp('vertuha', 1)] }],
    [{ spawns: [sp('zubarev', 2), sp('reka', 3)] }, { banner: 'Торговый зал', spawns: [sp('nikita', 4, 'drop', 18), sp('mongol', 1)] }],
  ],
  finale: [
    { banner: 'Гительман', spawns: [el('gitelman')] },
    { banner: 'Отдел продаж', spawns: [sp('gitelman', 2, 'both', 50), sp('zubarev', 1)] },
  ],
});

export const concert = eraMap({
  id: 'concert',
  name: 'Концерт',
  chapter: 'Финал',
  next: null,
  scaling: 0.15,
  world: [{ theme: 'night_street', to: 2930 }, { theme: 'stage' }],
  anvils: [700, 1000],
  loading: {
    title: 'Концерт',
    art: 'klas',
    text: [
      'Ночной город, очередь до угла и бас, от которого дрожит асфальт.',
      'Все мемы, которых ты прошёл, были лишь разогревом. На сцене — 1Kla$.',
      'Охрана, фанаты, пиротехника. Последний куплет за тобой.',
    ],
    tip: 'Финальный босс: три фазы, между ними с неба летит всё подряд. Отбивай его снаряды и береги ярость на конец.',
  },
  arenas: [
    [{ spawns: [sp('mongol', 1), sp('runner', 2), sp('ded', 1)] }, { banner: 'Охрана!', spawns: [sp('blocker', 2), sp('ruki', 1)] }],
    [{ nextAt: 1, spawns: [sp('glad', 3, 'both', 30)] }, { banner: 'Фанаты!', spawns: [sp('zubarev', 2), sp('reka', 3, 'both', 30)] }],
    [{ spawns: [sp('vertuha', 2), sp('gitelman', 1)] }, { banner: 'К сцене', spawns: [sp('mongol', 1), sp('glad', 2), sp('zubarev', 1)] }],
  ],
  boss: [{ banner: '1Kla$', spawns: [sp('klas', 1, 'right')] }],
});

export const ERA_MAPS = [village, dacha, panelki, pcClub, gym, museum, river, sigmaGym, streamHouse, office, concert];
