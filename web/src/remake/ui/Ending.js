import { el } from './dom.js';
import { showLoading, hideLoading } from './LoadingScreen.js';
import { volume } from '../state/GameState.js';
import { HEROES } from '../game/heroes.js';
import { storyText, storyVoice } from '../story.js';
import MUSIC_CREDITS from '../music.credits.json';

/**
 * The ending, in two parts:
 *   1. Afterword — like a loading screen: the hero's painting, the narrator
 *      reads what became of him, then the shared epilogue (subtitles in sync).
 *   2. Credits — rolling up like in the movies, with the credits music.
 */

const HERO_FACE = {
  pocik: 'assets/loading/hero_pocik.png',
  svidetel: 'assets/loading/hero_svidetel.png',
  pistoletov: 'assets/loading/hero_pistoletov.png',
  kama: 'assets/loading/hero_kama.png',
};

const CREDITS = [
  ['big', 'КОСАРИ'],
  ['sub', 'Remake · 2026'],
  ['gap'],
  ['head', 'Над проектом работали'],
  ['role', 'DNTZ', 'архитектор, промпт-инженер, главный по «а давай ещё вот так»'],
  ['role', 'Claude', 'программист'],
  ['role', 'Cursor', 'дизайнер'],
  ['gap'],
  ['head', 'По мотивам'],
  ['role', 'Косари (2011)', 'Trubakoff Industry — Евгений Терехов, Илья Трубаков'],
  ['gap'],
  ['head', 'В ролях'],
  ['role', 'Поцык', 'вернул косарь. Дал в долг. Снова'],
  ['role', 'Свидетель из Фрязино', 'не сказал ни слова. Ни одного'],
  ['role', 'Александр Пистолетов', 'нашёл клад. Морально'],
  ['role', 'Кама Пуля', '«Ша-а-а»'],
  ['role', 'Никиты', 'все Никиты, сколько их было'],
  ['gap'],
  ['head', 'Особые роли'],
  ['role', 'Дед', 'футбольный мячик (дублёр — настоящий мячик)'],
  ['role', 'Пахом', 'свет, а точнее его отсутствие'],
  ['role', 'Гигачад', 'хореография поз и молчание'],
  ['role', 'Руки базуки', 'тренер по жиму, мозг на массе'],
  ['role', 'Гительман', 'финансовый консультант. Не является инвестиционной рекомендацией'],
  ['role', 'Глад Валакас', 'звукорежиссёр (громкость не регулируется)'],
  ['role', '1Kla$', 'последний куплет'],
  ['gap'],
  ['head', 'Голос рассказчика'],
  ['role', 'Друг DNTZ', 'читал Шерлока Холмса — и вот к чему это привело'],
  ['gap'],
  ['head', 'Каскадёры'],
  ['role', 'Буйные', 'падали за всех'],
  ['role', 'Вор', 'бегал от всех'],
  ['role', 'Продавщица ларька', 'выдала грабли. Ларёк цел'],
  ['gap'],
  ['head', 'Мешапы боссов и мемов'],
  ['line', 'MEMEZGANG — «Рашн фестиваль на Гроув-стрит»'],
  ['line', 'ZeeMan — «Ебашилово в саду»'],
  ['line', '«Робо-карнавал» — «Ну, погоди!» & Пахом'],
  ['line', 'даня — «Без фонка»'],
  ['line', 'ymo — «Когда выпал автомат!!!»'],
  ['line', 'JACKPHONK'],
  ['line', 'tranzipone — «Включите мужику с завода фонк из альта»'],
  ['line', '1.Kla$ — «DOOMины дети»'],
  ['line', 'VØJ × ATSMXN × 1.Kla$ — «1.Kla$ ушёл в разнос» (mashup by .xanax)'],
  ['line', 'YURIST feat. Тамбовский дед — «Футбольный мячик»'],
  ['line', 'Геннадий Горин — «Футбол» (grindcore mashup)'],
  ['line', 'dastovsd ft. Glad Valakas — «PAROL DEATH»'],
  ['gap'],
  ['head', 'Музыка'],
  ...MUSIC_CREDITS.map((m) => ['role', m.title, 'Kevin MacLeod (incompetech.com)']),
  ['small', 'Licensed under Creative Commons: By Attribution 4.0 — creativecommons.org/licenses/by/4.0'],
  ['gap'],
  ['head', 'Благодарности'],
  ['line', 'Бесконечному интернету — за всех, кто в нём остался навсегда'],
  ['line', 'Энергетикам — за ночи, которые не кончались'],
  ['line', 'Пиву «Охота крепкое» — за вдохновение и смелость'],
  ['line', 'Всем мемам, которые согласились бы, если бы их спросили'],
  ['line', 'И тебе — за то, что дошёл до конца'],
  ['gap'],
  ['small', 'Ни один Никита не пострадал. Почти.'],
  ['small', 'Косарь возвращён владельцу. Владелец снова дал его в долг.'],
  ['small', 'Все совпадения с реальными людьми — мемы.'],
  ['gap'],
  ['big', 'Спасибо, что играли'],
];

let node = null;
let music = null;

function stopCredits() {
  music?.pause();
  music = null;
  node?.remove();
  node = null;
}

/** Part 2: movie-style credits. Enter / Esc / click — done. */
export function showCredits(parent, onDone) {
  stopCredits();
  const roll = el(
    'div',
    { className: 'cr-roll' },
    CREDITS.map(([kind, a, b]) => {
      if (kind === 'gap') return el('div', { className: 'cr-gap' });
      if (kind === 'role') return el('div', { className: 'cr-role' }, [el('span', { className: 'cr-name', text: a }), el('span', { className: 'cr-what', text: b })]);
      return el('div', { className: `cr-${kind}`, text: a });
    }),
  );
  const hint = el('div', { className: 'cr-hint', text: 'Enter — в меню' });
  node = el('div', { className: 'cr' }, [el('div', { className: 'cr-scan' }), roll, hint]);
  parent.append(node);
  try {
    music = new Audio('assets/music/ui_credits.mp3');
    music.volume = 0.5 * volume('music');
    music.loop = true;
    music.play().catch(() => {});
  } catch (_) {
    music = null;
  }
  // Roll speed: the whole list passes in ~70 s
  requestAnimationFrame(() => {
    const h = roll.scrollHeight + window.innerHeight;
    roll.style.setProperty('--cr-dist', `${h}px`);
    roll.classList.add('go');
  });
  const finish = () => {
    window.removeEventListener('keydown', onKey);
    node?.classList.add('out');
    setTimeout(() => {
      stopCredits();
      onDone?.();
    }, 500);
  };
  const onKey = (e) => {
    if (e.repeat) return;
    if (['Enter', 'Escape', 'Space', 'KeyJ'].includes(e.code)) finish();
  };
  // Keys only after a moment, so the key that closed the afterword does not skip the credits
  setTimeout(() => window.addEventListener('keydown', onKey), 900);
  roll.addEventListener('animationend', () => hint.classList.add('on'));
  node.addEventListener('click', () => node && finish());
}

/** Part 1 + 2: the hero's afterword, then the credits. */
export function playEnding(parent, heroId, onDone) {
  const hero = HEROES[heroId] ? heroId : 'pocik';
  const h = HEROES[hero];
  const ld = showLoading(parent, {
    story: {
      bg: `assets/loading/scenes/ending_${hero}.jpg`,
      chapter: 'Послесловие',
      title: h?.label || 'Конец',
      goal: 'История закончилась. Почти.',
      text: storyText('ending', hero),
      voice: storyVoice('ending', hero),
      face: HERO_FACE[hero],
      tip: null,
      music: 'ui_ending',
    },
  });
  ld.progress(1);
  // Let the narrator start before «press any key» shows up
  setTimeout(() => {
    ld.done(() => {
      hideLoading();
      showCredits(parent, onDone);
    });
  }, 5000);
}
