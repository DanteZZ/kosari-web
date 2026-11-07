/**
 * Meme-era chapters 2–6 and the finale. Same format as forest.js; built with
 * eraMap() so every map shares the proven arena geometry of «Опушка»:
 * three locked arenas, then the boss arena at the end of the road.
 *
 * world: background segments along the road (brawl/world/ThemeWorld.js).
 * Bosses use stand-in rigs until their art exists (see sim/fighters.js).
 */

const GEOM = [
  { trigger: 720, left: 380, right: 1500 },
  { trigger: 2000, left: 1700, right: 2850 },
  { trigger: 3300, left: 3000, right: 4150 },
];
const BOSS = { trigger: 4650, left: 4350, right: 5600 };

/**
 * @param {object} o
 * @param {Array<Array<object>>} o.arenas  waves for each of the 3 arenas
 * @param {Array<object>} o.boss           waves of the boss arena
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
    arenas: [
      ...o.arenas.map((waves, i) => ({
        id: `${o.id}${i + 1}`,
        ...GEOM[i],
        reward: [{ kind: 'heal', amount: 40 + i * 20 }],
        waves,
      })),
      { id: 'boss', boss: true, ...BOSS, waves: o.boss },
    ],
  };
}

const sp = (kind, count, from = 'both', every = 30) => ({ kind, count, from, every });

export const village = eraMap({
  id: 'village',
  name: 'Деревня',
  chapter: 'Глава 2 · Ранний ютуб',
  next: 'dacha',
  world: [{ theme: 'village', to: 3900 }, { theme: 'stadium' }],
  loading: {
    title: 'Деревня',
    art: 'ded.jpg',
    text: [
      '2009 год. Интернет медленный, видео — мутные, а звёзды рождаются прямо в огородах.',
      'В деревне за полем есть стадион. Ворота без сетки, трибуна на три лавки, и один дед, который уверен, что он футбольный мячик.',
      'Спорить с ним никто не решался. Наш герой — решился.',
    ],
    tip: 'Дед катается и пинает мячи. Мяч можно отбить ударом — только так его и пробить.',
  },
  arenas: [
    [{ spawns: [sp('nikita', 3, 'right', 40)] }, { spawns: [sp('nikita', 4, 'both', 28)] }],
    [{ nextAt: 1, spawns: [sp('nikita', 3), sp('runner', 2, 'left', 50)] }, { banner: 'Болельщики!', spawns: [sp('runner', 4, 'both', 26)] }],
    [{ spawns: [sp('thrower', 2, 'right', 60), sp('nikita', 3)] }, { banner: 'С поля!', spawns: [sp('buiniy', 2), sp('nikita', 3, 'drop', 30)] }],
  ],
  boss: [{ banner: 'Дед «я футбольный мячик»', spawns: [sp('ded', 1, 'right')] }],
});

export const dacha = eraMap({
  id: 'dacha',
  name: 'Дача',
  chapter: 'Глава 2 · Ранний ютуб',
  next: 'panelki',
  world: [{ theme: 'dacha', to: 4200 }, { theme: 'cellar' }],
  loading: {
    title: 'Дача',
    art: 'pahom.jpg',
    text: [
      'Дачный посёлок: теплицы, сараи, банки с огурцами. И подвал, о котором соседи говорят шёпотом.',
      'Там, среди банок и труб, живёт Пахом. Зелёный свет, тихая песня и очень странный взгляд.',
      'Косари, говорят, лежат как раз в том подвале.',
    ],
    tip: 'Пахом уходит в тень между фазами — в это время с потолка сыплется всякое. Держись в движении.',
  },
  arenas: [
    [{ spawns: [sp('nikita', 4, 'both', 30)] }, { banner: 'Дачники!', spawns: [sp('thrower', 2, 'left', 50), sp('nikita', 2)] }],
    [{ nextAt: 1, spawns: [sp('blocker', 2), sp('nikita', 3)] }, { spawns: [sp('buiniy', 2), sp('runner', 2, 'right', 40)] }],
    [{ spawns: [sp('thrower', 3, 'both', 40)] }, { banner: 'В подвал', spawns: [sp('nikita', 5, 'drop', 20), sp('blocker', 1, 'left')] }],
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
    art: 'mongol.jpg',
    text: [
      '2014-й. Во дворах между панельками решаются все вопросы, и решаются быстро.',
      'Ходят слухи про Глада Валакаса — он орёт так, что дрожат стёкла. А за гаражами ждёт Олег Монгол, и это уже не слухи.',
      'Пройти двор можно только насквозь.',
    ],
    tip: 'Монгол бьёт тяжело и терпит лёгкие удары. Бросай в него его же дворовых или пробивай комбо с рывка.',
  },
  arenas: [
    [{ spawns: [sp('nikita', 4, 'both', 26)] }, { banner: 'Гопота!', spawns: [sp('runner', 3), sp('buiniy', 1, 'right')] }],
    [{ banner: 'Глад Валакас', spawns: [sp('glad', 1, 'right')] }, { spawns: [sp('nikita', 3)] }],
    [{ nextAt: 1, spawns: [sp('blocker', 2), sp('thrower', 2, 'right', 50)] }, { banner: 'За гаражами', spawns: [sp('buiniy', 2), sp('runner', 3)] }],
  ],
  boss: [
    { banner: 'Олег Монгол', nextAt: 1, spawns: [sp('mongol', 1, 'right')] },
    { bossHpBelow: 0.5, spawns: [sp('nikita', 3, 'both', 40)] },
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
    art: 'papich.jpg',
    text: [
      'Подвальный клуб: ЭЛТ-мониторы, липкие клавиатуры, запах энергетика.',
      'В дальнем углу стримит Папич. Чат бесится, донаты летят — и иногда это совсем не деньги.',
      'Зрители сегодня злые.',
    ],
    tip: 'Папич бросает «донаты». Отбей их ударом — гением тут будешь ты.',
  },
  arenas: [
    [{ spawns: [sp('nikita', 4)] }, { banner: 'Школьники!', spawns: [sp('runner', 4, 'both', 24)] }],
    [{ nextAt: 1, spawns: [sp('thrower', 3, 'both', 40)] }, { spawns: [sp('blocker', 2), sp('nikita', 3)] }],
    [{ spawns: [sp('buiniy', 2), sp('runner', 2)] }, { banner: 'Чат в атаке', spawns: [sp('nikita', 6, 'drop', 18)] }],
  ],
  boss: [{ banner: 'Папич', spawns: [sp('papich', 1, 'right')] }],
});

export const gym = eraMap({
  id: 'gym',
  name: 'Качалка',
  chapter: 'Глава 4 · Пабликовая эпоха',
  next: 'museum',
  world: [{ theme: 'gym_street', to: 2000 }, { theme: 'gym' }],
  loading: {
    title: 'Качалка',
    art: 'ruki_bazuki.jpg',
    text: [
      '2017-й. Паблики, хайп и качалка в подвале жилого дома.',
      'У входа крутится чувак, прославившийся вертухой. Внутри — Руки базуки: руки как у статуи, мозг — по остаточному принципу.',
      'В качалке не разговаривают. В качалке бьют.',
    ],
    tip: 'Руки базуки почти не вздрагивает от ударов. Бросай качков, используй оружие и уходи рывком от его замаха.',
  },
  arenas: [
    [{ spawns: [sp('nikita', 3)] }, { banner: 'Чувак с вертухой', spawns: [sp('vertuha', 1, 'right')] }],
    [{ nextAt: 1, spawns: [sp('blocker', 3, 'both', 40)] }, { banner: 'Качки!', spawns: [sp('buiniy', 3, 'both', 50)] }],
    [{ spawns: [sp('blocker', 2), sp('thrower', 2)] }, { spawns: [sp('buiniy', 2), sp('runner', 3)] }],
  ],
  boss: [
    { banner: 'Руки базуки', nextAt: 1, spawns: [sp('ruki', 1, 'right')] },
    { bossHpBelow: 0.5, spawns: [sp('blocker', 2)] },
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
    art: 'ponasenkov.jpg',
    text: [
      'Залы с колоннами, бюсты, картины в золочёных рамах.',
      'Здесь хозяйничает Маэстро. Он знает всё о Наполеоне и ещё больше — о собственной гениальности.',
      'Смотрители музея охраняют его покой с неожиданным рвением.',
    ],
    tip: 'Маэстро ранит только то, что ты отбил ему обратно. Между фазами он уходит — уворачивайся от падающего.',
  },
  arenas: [
    [{ spawns: [sp('blocker', 2), sp('nikita', 2)] }, { spawns: [sp('nikita', 4, 'both', 26)] }],
    [{ nextAt: 1, spawns: [sp('thrower', 3)] }, { banner: 'Смотрители!', spawns: [sp('blocker', 3, 'both', 40)] }],
    [{ spawns: [sp('runner', 3), sp('buiniy', 2)] }, { spawns: [sp('thrower', 2), sp('blocker', 2)] }],
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
    art: 'reka.jpg',
    text: [
      '2019-й. Туман над водой, ивы, фонари на набережной.',
      'Кто-то просто идёт к реке. Спокойно. Без спешки. И почему-то от этого спокойствия становится не по себе.',
      'Рыбаки на берегу явно что-то знают.',
    ],
    tip: 'Идущий к реке отступает к воде между фазами. Отбивай его снаряды и не стой на месте.',
  },
  arenas: [
    [{ spawns: [sp('nikita', 4)] }, { banner: 'Рыбаки!', spawns: [sp('thrower', 3, 'both', 40)] }],
    [{ nextAt: 1, spawns: [sp('runner', 4, 'both', 22)] }, { spawns: [sp('buiniy', 2), sp('blocker', 2)] }],
    [{ spawns: [sp('thrower', 2), sp('runner', 3)] }, { banner: 'Туман', spawns: [sp('nikita', 6, 'drop', 18)] }],
  ],
  boss: [{ banner: 'Идущий к реке', spawns: [sp('reka', 1, 'right')] }],
});

export const sigmaGym = eraMap({
  id: 'sigma_gym',
  name: 'Зал сигм',
  chapter: 'Глава 5 · Сигма-эпоха',
  next: 'stream_house',
  world: [{ theme: 'sigma_gym', to: 4100 }, { theme: 'ring' }],
  loading: {
    title: 'Зал сигм',
    art: 'gigachad.jpg',
    text: [
      'Мир стал чёрно-белым. Резкий свет, античные статуи и тишина, которую нарушает только звон блинов.',
      'Где-то в центре этой тишины стоит Гигачад. Ему не нужно ничего доказывать.',
      'А вот тебе — придётся.',
    ],
    tip: 'Гигачад — самый бронированный из всех. Ищи окно после его удара и не жалей ярость.',
  },
  arenas: [
    [{ spawns: [sp('blocker', 2), sp('nikita', 2)] }, { banner: 'Сигмы!', spawns: [sp('runner', 4)] }],
    [{ nextAt: 1, spawns: [sp('buiniy', 3)] }, { spawns: [sp('blocker', 3), sp('thrower', 1)] }],
    [{ spawns: [sp('runner', 3), sp('blocker', 2)] }, { spawns: [sp('buiniy', 3, 'both', 40)] }],
  ],
  boss: [
    { banner: 'Гигачад', nextAt: 1, spawns: [sp('gigachad', 1, 'right')] },
    { bossHpBelow: 0.5, spawns: [sp('runner', 3)] },
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
    art: 'zubarev.jpg',
    text: [
      '2022-й. Неон, кольцевые лампы и камеры в каждом углу.',
      'В стрим-хате живут громко. Особенно Зубарев: он прыгает, орёт и швыряет донатами.',
      'Каждый удар здесь кто-то снимает.',
    ],
    tip: 'Зубарев бросает «донаты» — отбивай их обратно, пока он не устанет.',
  },
  arenas: [
    [{ spawns: [sp('runner', 3), sp('nikita', 2)] }, { banner: 'Донатеры!', spawns: [sp('thrower', 3)] }],
    [{ nextAt: 1, spawns: [sp('nikita', 5, 'both', 20)] }, { spawns: [sp('blocker', 2), sp('buiniy', 2)] }],
    [{ spawns: [sp('thrower', 2), sp('runner', 3)] }, { spawns: [sp('buiniy', 3)] }],
  ],
  boss: [{ banner: 'Зубарев', spawns: [sp('zubarev', 1, 'right')] }],
});

export const office = eraMap({
  id: 'office',
  name: 'Бизнес-центр',
  chapter: 'Глава 6 · Новая волна',
  next: 'concert',
  world: [{ theme: 'office', to: 4100 }, { theme: 'trading' }],
  loading: {
    title: 'Бизнес-центр',
    art: 'gitelman.jpg',
    text: [
      'Стекло, ковролин и мониторы с графиками, которые всегда идут не туда.',
      'Гительман предлагает инвестиции. Отказы не принимаются — их перехватывают трейдеры в костюмах.',
      'Пора закрыть позицию. Кулаком.',
    ],
    tip: 'Гительман уходит на «перерыв» между фазами — тогда с потолка сыплется. Отбивай его снаряды.',
  },
  arenas: [
    [{ spawns: [sp('blocker', 2), sp('nikita', 3)] }, { banner: 'Трейдеры!', spawns: [sp('blocker', 3)] }],
    [{ nextAt: 1, spawns: [sp('thrower', 3)] }, { spawns: [sp('runner', 4)] }],
    [{ spawns: [sp('buiniy', 2), sp('blocker', 2)] }, { banner: 'Торговый зал', spawns: [sp('nikita', 6, 'drop', 18)] }],
  ],
  boss: [{ banner: 'Гительман', spawns: [sp('gitelman', 1, 'right')] }],
});

export const concert = eraMap({
  id: 'concert',
  name: 'Концерт',
  chapter: 'Финал',
  next: null,
  scaling: 0.15,
  world: [{ theme: 'night_street', to: 2000 }, { theme: 'club', to: 4200 }, { theme: 'stage' }],
  anvils: [700, 1000],
  loading: {
    title: 'Концерт',
    art: '1klas.jpg',
    text: [
      'Ночной город, очередь до угла и бас, от которого дрожит асфальт.',
      'Все мемы, которых ты прошёл, были лишь разогревом. На сцене — 1Kla$.',
      'Охрана, фанаты, пиротехника. Последний куплет за тобой.',
    ],
    tip: 'Финальный босс: три фазы, между ними с неба летит всё подряд. Отбивай его снаряды и береги ярость на конец.',
  },
  arenas: [
    [{ spawns: [sp('nikita', 4), sp('runner', 2)] }, { banner: 'Охрана!', spawns: [sp('blocker', 3)] }],
    [{ nextAt: 1, spawns: [sp('runner', 5, 'both', 20)] }, { banner: 'Фанаты!', spawns: [sp('nikita', 6, 'drop', 16)] }],
    [{ spawns: [sp('blocker', 2), sp('buiniy', 2), sp('thrower', 2)] }, { banner: 'К сцене', spawns: [sp('glad', 1, 'right'), sp('runner', 2)] }],
  ],
  boss: [{ banner: '1Kla$', spawns: [sp('klas', 1, 'right')] }],
});

export const ERA_MAPS = [village, dacha, panelki, pcClub, gym, museum, river, sigmaGym, streamHouse, office, concert];
