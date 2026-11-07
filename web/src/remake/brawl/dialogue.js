/**
 * Cutscene lines. `hero` lines are said by whoever the player picked.
 *
 * intro[mapId]   — when a map starts
 * bosses[kind]   — { voice, arrive: [...], defeat: [...] }; each line is
 *                  [who, text] where who is 'boss' or 'hero'
 * voice          — blip pitch (Hz) and oscillator wave for the typed text
 */

export const HERO_VOICE = {
  pocik: { pitch: 330, wave: 'square' },
  svidetel: { pitch: 260, wave: 'triangle' },
  pistoletov: { pitch: 200, wave: 'sawtooth' },
  kama: { pitch: 150, wave: 'square' },
};

export const INTRO = {
  forest: ['Говорят, в лесу раздают косари. Проверим.'],
  opushka: ['Лес кончился. Дальше трасса… и чем-то вкусно пахнет.'],
  village: ['Деревня. Тихо, спокойно… подозрительно спокойно.'],
  dacha: ['Дачи. Где-то тут подвал, про который все молчат.'],
  panelki: ['Родные панельки. Тут каждый двор — чья-то территория.'],
  pc_club: ['Компьютерный клуб. Пахнет энергетиком и чужими победами.'],
  gym: ['Качалка. Сюда без формы не пускают. Значит, войду с ноги.'],
  museum: ['Музей. Главное — ничего не разбить. Ну, почти ничего.'],
  river: ['Река. Туман такой, что своих ног не видно.'],
  sigma_gym: ['Мир стал чёрно-белым. Похоже, я на территории сигм.'],
  stream_house: ['Стрим-хата. Всё, что тут происходит, уже в прямом эфире.'],
  office: ['Бизнес-центр. Сегодня я — главный риск для ваших инвестиций.'],
  concert: ['Финал. Все мемы, что были до этого, — просто разогрев.'],
};

export const BOSSES = {
  borsch: {
    voice: { pitch: 120, wave: 'sawtooth' },
    arrive: [
      ['boss', 'Это Влад Борщ!'],
      ['boss', 'Косари мои. И бомбы тоже мои. Лови!'],
      ['hero', 'Поймаю. И верну.'],
    ],
    defeat: [['boss', 'Ладно… бомбы были лишние.']],
  },
  povar: {
    voice: { pitch: 170, wave: 'square' },
    arrive: [
      ['boss', 'Ещё один голодный? Профессия у меня такая — кормить.'],
      ['boss', 'Только сегодня в меню — посуда.'],
      ['hero', 'Счёт, пожалуйста.'],
    ],
    defeat: [['boss', 'Шаурма… за счёт заведения…']],
  },
  ded: {
    voice: { pitch: 140, wave: 'triangle' },
    arrive: [
      ['boss', 'Внучок, а ты знаешь, кто я?'],
      ['boss', 'Я — футбольный мячик!'],
      ['hero', 'Тогда я — вратарь.'],
    ],
    defeat: [['boss', 'Укатился… к внукам…']],
  },
  pahom: {
    voice: { pitch: 100, wave: 'sine' },
    arrive: [
      ['boss', 'Братишка… я тебе покушать принёс.'],
      ['hero', 'Спасибо, я не голоден.'],
      ['boss', 'А придётся.'],
    ],
    defeat: [['boss', 'Ухожу в тень… братишка…']],
  },
  glad: {
    voice: { pitch: 380, wave: 'sawtooth' },
    arrive: [['boss', 'АХАХАХАХА! Ты кто вообще такой?!']],
    defeat: [['boss', 'Ааа… я так не играю!']],
  },
  mongol: {
    voice: { pitch: 110, wave: 'square' },
    arrive: [
      ['boss', 'Ты за гаражи зашёл. Знаешь, что тут бывает?'],
      ['hero', 'Сейчас узнаю.'],
    ],
    defeat: [['boss', 'Пусть это будет… ошибкой…']],
  },
  papich: {
    voice: { pitch: 240, wave: 'square' },
    arrive: [
      ['boss', 'Чат, смотрите, кто пришёл. Ещё один «про».'],
      ['boss', 'Сейчас покажу вам, что такое гений.'],
      ['hero', 'Донат за проигрыш принимаешь?'],
    ],
    defeat: [['boss', 'Это… не я проиграл. Это лаги.']],
  },
  vertuha: {
    voice: { pitch: 210, wave: 'triangle' },
    arrive: [['boss', 'Хочешь с вертухи? Держи с вертухи!']],
    defeat: [['boss', 'Вертуха… дала сбой.']],
  },
  ruki: {
    voice: { pitch: 90, wave: 'sawtooth' },
    arrive: [
      ['boss', 'Видишь руки? Это руки базуки.'],
      ['hero', 'А мозг где?'],
      ['boss', 'Мозг на массе.'],
    ],
    defeat: [['boss', 'Мышцы… отказали…']],
  },
  ponasenkov: {
    voice: { pitch: 190, wave: 'triangle' },
    arrive: [
      ['boss', 'Перед вами — маэстро. Аплодисменты можно не сдерживать.'],
      ['boss', 'Вы, конечно, проиграете. Это исторический факт.'],
      ['hero', 'Историю пишут победители.'],
    ],
    defeat: [['boss', 'Это была… тактическая ретирада.']],
  },
  reka: {
    voice: { pitch: 130, wave: 'sine' },
    arrive: [
      ['boss', '…'],
      ['boss', 'Я просто иду к реке.'],
      ['hero', 'Через меня не пройдёшь.'],
    ],
    defeat: [['boss', 'Река… подождёт.']],
  },
  gigachad: {
    voice: { pitch: 80, wave: 'sine' },
    arrive: [
      ['boss', '…'],
      ['hero', 'Ты вообще говоришь?'],
      ['boss', 'Нет.'],
    ],
    defeat: [['boss', 'Достойно.']],
  },
  zubarev: {
    voice: { pitch: 300, wave: 'sawtooth' },
    arrive: [
      ['boss', 'Всем привет, мы в эфире! Тут ко мне гость!'],
      ['boss', 'Чат, ставим, сколько он продержится!'],
      ['hero', 'Ставь на меня.'],
    ],
    defeat: [['boss', 'Стрим… окончен…']],
  },
  gitelman: {
    voice: { pitch: 180, wave: 'square' },
    arrive: [
      ['boss', 'Молодой человек, вы инвестируете или просто мимо?'],
      ['boss', 'Входной билет — все ваши косари.'],
      ['hero', 'Мои косари — в моих кулаках.'],
    ],
    defeat: [['boss', 'Рынок… развернулся…']],
  },
  klas: {
    voice: { pitch: 160, wave: 'sawtooth' },
    arrive: [
      ['boss', 'Йо! Ты дошёл до сцены. Уважение.'],
      ['boss', 'Но последний куплет — мой.'],
      ['hero', 'Тогда я — финальный бит.'],
    ],
    defeat: [
      ['boss', 'Толпа… кричит не моё имя…'],
      ['hero', 'Косари собраны. Мемы — побеждены.'],
    ],
  },
};
