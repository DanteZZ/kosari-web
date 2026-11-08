import { el } from './dom.js';
import { playSfx } from './audio.js';
import { GameState, SaveLoad, volume, chooseHero } from '../state/GameState.js';
import { MAPS } from '../maps/index.js';
import { HEROES, HERO_IDS } from '../game/heroes.js';
import { STORY, HERO_GOALS, storyText } from '../story.js';

let menuMusic = null;

const BEST_KEY = 'kosari.remake.best';

/** Best result per map, written by the brawl results screen. */
export function readBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function startMusic() {
  if (volume('music') > 0 && !menuMusic) menuMusic = playSfx('menu1.mp3', { volume: 0.45 * volume('music'), loop: true });
}

export function stopMenuMusic() {
  if (menuMusic) {
    menuMusic.pause();
    menuMusic = null;
  }
}

const HERO_ART = (id) => `assets/loading/hero_${id}.png`;
const HERO_FACE = {
  pocik: 'assets/player/parts/pocik_0002_head.png',
  svidetel: 'assets/enemies/svidetel/parts/head.png',
  pistoletov: 'assets/enemies/pistoletov/parts/head.png',
  kama: 'assets/enemies/kama/parts/head.png',
};
const MAP_BOSS = { forest: 'borsch', opushka: 'povar', dacha: 'pahom', museum: 'ponasenkov', sigma_gym: 'gigachad', stream_house: 'papich', concert: 'klas' };
const BOSS_NAME = { borsch: 'Влад Борщ', povar: 'Повар', pahom: 'Пахом', ponasenkov: 'Понасенков', gigachad: 'Гигачад', papich: 'Папич', klas: '1Kla$' };

/**
 * Title + a multi-level menu (retro CRT look with neon — the «cyber-retro»
 * style). Every page has a breadcrumb and slides in; Esc / Backspace goes up.
 *
 *   Главное ─ Продолжить ─ Главы (focus on the next unfinished one) ─ [H] Сменить героя
 *          ├ Новая игра ─ Выбор героя ─ start at the first chapter
 *          ├ Боссы ─ Выбор героя ─ boss rush
 *          ├ Галерея · Настройки · Управление · Создатели
 *
 * Keyboard (arrows / WASD, Enter, Esc / Backspace), mouse, touch and the
 * gamepad (brawl/gamepad.js turns it into key presses) all work.
 */
export function renderMenu(root, { go }) {
  const storyIds = Object.keys(MAPS).filter((id) => !MAPS[id].hidden && id !== 'sandbox');
  const best = readBest();
  const P = () => GameState.progress;
  let dev = new URLSearchParams(window.location.search).has('dev');
  const unlocked = (id) => dev || P().unlocked.includes(id);
  const done = (id) => P().done.includes(id);
  const nextChapter = () => storyIds.find((id) => unlocked(id) && !done(id)) || [...storyIds].reverse().find(unlocked) || storyIds[0];

  let stage = 'title';
  /** Page stack: { id, sel, mode? } */
  const stack = [];
  const cur = () => stack[stack.length - 1];
  let viewer = null;

  const sfx = (rate = 1, vol = 0.3) => {
    const a = playSfx('beep.wav', { volume: vol * volume('sfx') });
    a.playbackRate = rate;
  };

  // ---------------------------------------------------------------- DOM
  const slideA = el('div', { className: 'cx-slide' });
  const slideB = el('div', { className: 'cx-slide' });
  const crumbs = el('div', { className: 'cx-crumbs' });
  const page = el('div', { className: 'cx-page' });
  const press = el('div', { className: 'mm-press', text: 'НАЖМИ ENTER' });
  const logo = el('img', { className: 'mm-logo', src: 'assets/sprites/logo/0_alpha.png', alt: 'КОСАРИ' });
  const flash = el('div', { className: 'mm-flash' });
  const screen = el('div', { className: 'mm cx' }, [
    el('div', { className: 'cx-bg' }, [slideA, slideB]),
    el('div', { className: 'cx-tint' }),
    el('div', { className: 'cx-grid' }),
    el('div', { className: 'mm-embers' }, Array.from({ length: 24 }, (_, i) => el('i', { style: `--i:${i}` }))),
    el('div', { className: 'mm-content cx-title' }, [logo, press]),
    el('div', { className: 'cx-shell' }, [el('img', { className: 'cx-logo-sm', src: 'assets/sprites/logo/0_alpha.png', alt: '' }), crumbs, page]),
    el('div', { className: 'mm-foot', html: 'ORIGINAL © 2011 TRUBAKOFF INDUSTRY · REMAKE &amp; PORT © 2026 DNTZ' }),
    el('div', { className: 'mm-scan' }),
    flash,
  ]);
  root.append(screen);
  startMusic();

  // Background: unlocked chapter paintings cross-fade slowly
  const slides = () => storyIds.filter(unlocked).map((id) => `assets/loading/scenes/${id}.jpg`);
  let slideI = 0;
  let slideFront = slideA;
  const nextSlide = (src) => {
    const list = slides();
    const url = src || list[slideI++ % Math.max(1, list.length)];
    const back = slideFront === slideA ? slideB : slideA;
    back.style.backgroundImage = `url(${url})`;
    back.classList.remove('on');
    void back.offsetWidth;
    back.classList.add('on');
    slideFront.classList.remove('on');
    slideFront = back;
  };
  nextSlide();
  const slideTimer = setInterval(() => {
    if (cur()?.id === 'main' || stage === 'title') nextSlide();
  }, 7000);

  const t1 = setTimeout(() => {
    flash.classList.add('on');
    playSfx('superudar.WAV', { volume: 0.35 * volume('sfx') });
    screen.classList.add('ready');
  }, 1100);

  // ---------------------------------------------------------------- pages
  const TITLES = {
    main: 'ГЛАВНОЕ', chapters: 'ГЛАВЫ', hero: 'ГЕРОЙ', gallery: 'ГАЛЕРЕЯ',
    settings: 'НАСТРОЙКИ', controls: 'УПРАВЛЕНИЕ', credits: 'СОЗДАТЕЛИ',
  };

  const mainItems = () => {
    const its = [];
    const anyProgress = P().done.length > 0 || P().last;
    if (anyProgress) its.push({ id: 'continue', label: 'ПРОДОЛЖИТЬ', hint: `Следующая: ${MAPS[nextChapter()].name}` });
    its.push(
      { id: 'new', label: 'НОВАЯ ИГРА', hint: 'Выбери героя — и в лес' },
      ...(anyProgress ? [] : []),
      { id: 'chapters', label: 'ГЛАВЫ', hint: 'Любая открытая глава' },
      { id: 'bossrush', label: 'БОССЫ', hint: 'Все семь боссов подряд' },
      { id: 'gallery', label: 'ГАЛЕРЕЯ', hint: 'Арты глав и портреты боссов' },
      { id: 'settings', label: 'НАСТРОЙКИ', hint: 'Звук, тряска, управление' },
      { id: 'controls', label: 'УПРАВЛЕНИЕ', hint: 'Клавиатура · геймпад · сенсор' },
      { id: 'credits', label: 'СОЗДАТЕЛИ', hint: '' },
    );
    if (dev) its.push({ id: 'sandbox', label: 'ПЕСОЧНИЦА', dev: true }, { id: 'bones', label: 'КОСТИ', dev: true }, { id: 'anims', label: 'АНИМАЦИИ', dev: true });
    return its;
  };
  const settingsRows = () => {
    const st = GameState.settings;
    const pct = (v) => `${Math.round(v * 10)}/10`;
    return [
      { id: 'music', label: 'Музыка', value: pct(st.music), bar: st.music },
      { id: 'sfx', label: 'Звуки', value: pct(st.sfx), bar: st.sfx },
      { id: 'voice', label: 'Голоса', value: pct(st.voice), bar: st.voice },
      { id: 'shake', label: 'Тряска экрана', value: st.shake ? 'ВКЛ' : 'ВЫКЛ' },
      { id: 'touch', label: 'Сенсорное управление', value: { auto: 'АВТО', on: 'ВКЛ', off: 'ВЫКЛ' }[st.touch] },
      { id: 'fullscreen', label: 'Полный экран', value: document.fullscreenElement ? 'ВКЛ' : 'ВЫКЛ' },
      { id: 'reset', label: 'Сбросить прогресс', value: 'ENTER' },
    ];
  };
  const galleryItems = () => {
    const its = storyIds.map((id) => ({ kind: 'scene', id, open: unlocked(id), title: MAPS[id].name, src: `assets/loading/scenes/${id}.jpg` }));
    for (const b of Object.values(MAP_BOSS)) its.push({ kind: 'boss', id: b, open: dev || P().bosses.includes(b), title: BOSS_NAME[b], src: `assets/loading/${b}.png` });
    return its;
  };
  const count = (p) => ({
    main: mainItems().length,
    chapters: storyIds.length,
    hero: HERO_IDS.length,
    settings: settingsRows().length,
    gallery: galleryItems().length,
  }[p.id] || 0);

  const push = (id, extra = {}) => {
    const p = { id, sel: 0, ...extra };
    if (id === 'chapters') p.sel = Math.max(0, storyIds.indexOf(extra.focus || nextChapter()));
    if (id === 'hero') p.sel = Math.max(0, HERO_IDS.indexOf(GameState.hero));
    stack.push(p);
    sfx(1.1);
    render(true);
  };
  const pop = () => {
    if (viewer) return closeViewer();
    if (stack.length <= 1) return;
    stack.pop();
    sfx(0.8);
    render(true);
  };

  // ---------------------------------------------------------------- render
  const render = (anim = false) => {
    const p = cur();
    const n = count(p);
    if (n) p.sel = Math.max(0, Math.min(p.sel, n - 1));
    crumbs.innerHTML = '';
    stack.forEach((s, i) => {
      if (i) crumbs.append(el('span', { className: 'cx-sep', text: '›' }));
      crumbs.append(el('span', { className: i === stack.length - 1 ? 'on' : '', text: s.id === 'hero' ? (s.mode === 'new' ? 'НОВАЯ ИГРА · ГЕРОЙ' : s.mode === 'bossrush' ? 'БОССЫ · ГЕРОЙ' : 'ГЕРОЙ') : TITLES[s.id] }));
    });
    page.innerHTML = '';
    page.className = `cx-page p-${p.id}${anim ? ' enter' : ''}`;
    ({ main: renderMain, chapters: renderChapters, hero: renderHero, gallery: renderGallery, settings: renderSettings, controls: renderControls, credits: renderCredits })[p.id]();
  };

  const hover = (node, i) => {
    node.addEventListener('mouseenter', () => {
      if (cur().sel !== i) {
        cur().sel = i;
        sfx(1.5, 0.15);
        render();
      }
    });
    node.addEventListener('click', () => {
      cur().sel = i;
      activate();
    });
    return node;
  };
  const foot = (text) => el('div', { className: 'cx-foot', text: `${text}${stack.length > 1 ? ' · Esc — назад' : ''}` });

  function renderMain() {
    const its = mainItems();
    const p = cur();
    const menu = el('div', { className: 'cx-menu' });
    its.forEach((it, i) => {
      menu.append(hover(el('div', { className: `cx-mi${i === p.sel ? ' on' : ''}${it.dev ? ' dev' : ''}` }, [
        el('span', { className: 'cx-num', text: String(i + 1).padStart(2, '0') }),
        el('span', { className: 'cx-lbl', text: it.label, 'data-text': it.label }),
      ]), i));
    });
    const hero = HEROES[GameState.hero] || HEROES.pocik;
    page.append(
      el('div', { className: 'cx-left' }, [menu, el('div', { className: 'cx-hint', text: its[p.sel]?.hint || '' })]),
      el('div', { className: 'cx-hero-show' }, [
        el('img', { src: HERO_ART(hero.id), alt: '' }),
        el('div', { className: 'cx-hero-tag' }, [el('b', { text: hero.label }), el('span', { text: `цель: ${HERO_GOALS[hero.id] || ''}` })]),
      ]),
      foot('↑↓ — выбор · Enter — открыть'),
    );
  }

  function renderChapters() {
    const p = cur();
    const id = storyIds[p.sel];
    const m = MAPS[id];
    const open = unlocked(id);
    const list = el('div', { className: 'cx-chlist' });
    let lastChap = '';
    storyIds.forEach((cid, i) => {
      const cm = MAPS[cid];
      if (cm.chapter !== lastChap) {
        lastChap = cm.chapter;
        list.append(el('div', { className: 'cx-chhead', text: cm.chapter || '' }));
      }
      const st = done(cid) ? '✔' : unlocked(cid) ? '●' : '🔒';
      list.append(hover(el('div', { className: `cx-ch${i === p.sel ? ' on' : ''}${unlocked(cid) ? '' : ' locked'}${cid === nextChapter() ? ' next' : ''}` }, [
        el('span', { className: 'cx-chst', text: st }),
        el('span', { text: unlocked(cid) ? cm.name : '???' }),
      ]), i));
    });
    const hero = HEROES[GameState.hero] || HEROES.pocik;
    const text = open ? (storyText(id, hero.id) || [])[0] || '' : 'Глава ещё не открыта: пройди предыдущие.';
    const b = best[id];
    page.append(
      el('div', { className: 'cx-left narrow' }, [list]),
      el('div', { className: 'cx-preview' }, [
        el('div', { className: `cx-pimg${open ? '' : ' locked'}`, style: open ? `background-image:url(assets/loading/scenes/${id}.jpg)` : '' }),
        el('div', { className: 'cx-pinfo' }, [
          el('div', { className: 'cx-pchap', text: m.chapter || '' }),
          el('h2', { className: 'cx-glitch', 'data-text': open ? m.name : '???', text: open ? m.name : '???' }),
          el('div', { className: 'cx-pstat', text: done(id) ? `Пройдено${b ? ` · оценка ${b.grade} · ${b.time}` : ''}` : open ? (id === nextChapter() ? 'Следующая глава' : 'Открыта') : 'Закрыта' }),
          el('p', { className: 'cx-ptext', text }),
          el('div', { className: 'cx-phero' }, [el('img', { src: HERO_FACE[hero.id], alt: '' }), el('span', { text: `${hero.label} · H — сменить героя` })]),
        ]),
      ]),
      foot('↑↓ — глава · Enter — играть · H — герой'),
    );
  }

  function renderHero() {
    const p = cur();
    const id = HERO_IDS[p.sel];
    const h = HEROES[id];
    const tabs = el('div', { className: 'cx-tabs' });
    HERO_IDS.forEach((hid, i) => {
      tabs.append(hover(el('div', { className: `cx-tab${i === p.sel ? ' on' : ''}${GameState.hero === hid ? ' chosen' : ''}` }, [
        el('img', { src: HERO_FACE[hid], alt: '' }),
        el('span', { text: HEROES[hid].label }),
      ]), i));
    });
    const bar = (label, v) => el('div', { className: 'cx-stat' }, [el('span', { text: label }), el('i', { style: `--v:${Math.min(1, v / 1.4)}` })]);
    const action = p.mode === 'new' ? 'Enter — начать игру' : p.mode === 'bossrush' ? 'Enter — к боссам' : 'Enter — выбрать';
    page.append(
      el('div', { className: 'cx-hero-big' }, [el('img', { key: id, src: HERO_ART(id), alt: '' })]),
      el('div', { className: 'cx-hero-info' }, [
        el('div', { className: 'cx-pchap', text: `Герой ${p.sel + 1} / ${HERO_IDS.length}` }),
        el('h2', { className: 'cx-glitch', 'data-text': h.label, text: h.label }),
        el('div', { className: 'cx-goal', text: `Цель: ${HERO_GOALS[id] || ''}` }),
        el('p', { className: 'cx-ptext', text: (STORY.forest[id] || '').split('. ').slice(0, 2).join('. ') + '.' }),
        el('div', { className: 'cx-blurb', text: h.blurb }),
        bar('Здоровье', h.hp),
        bar('Скорость', h.speed),
        bar('Урон', h.dmg),
        el('div', { className: 'cx-cta', text: action }),
      ]),
      tabs,
      foot('← → — герой · Enter — выбрать'),
    );
  }

  function renderGallery() {
    const p = cur();
    const grid = el('div', { className: 'cx-gallery' });
    galleryItems().forEach((g, i) => {
      grid.append(hover(el('div', { className: `cx-gi ${g.kind}${i === p.sel ? ' on' : ''}${g.open ? '' : ' locked'}` }, [
        el('div', { className: 'cx-gimg', style: g.open ? `background-image:url(${g.src})` : '' }),
        el('span', { text: g.open ? g.title : '???' }),
      ]), i));
    });
    page.append(grid, foot('стрелки — выбор · Enter — смотреть'));
  }

  function renderSettings() {
    const p = cur();
    const box = el('div', { className: 'cx-rows' });
    settingsRows().forEach((r, i) => {
      const row = el('div', { className: `cx-row${i === p.sel ? ' on' : ''}` }, [
        el('span', { className: 'cx-rl', text: r.label }),
        r.bar != null ? el('i', { className: 'cx-rbar', style: `--v:${r.bar}` }) : null,
        el('span', { className: 'cx-rv', text: r.value }),
      ]);
      row.addEventListener('mouseenter', () => {
        if (p.sel !== i) {
          p.sel = i;
          render();
        }
      });
      row.addEventListener('click', (e) => {
        p.sel = i;
        const rr = row.getBoundingClientRect();
        if (r.id === 'reset' || r.id === 'fullscreen') activate();
        else change(e.clientX > rr.left + rr.width * 0.7 ? 1 : -1);
      });
      box.append(row);
    });
    page.append(box, foot('↑↓ — пункт · ← → — изменить · сохраняется сразу'));
  }

  function renderControls() {
    const t = (rows) => el('table', { className: 'cx-keys' }, rows.map(([a, b]) => el('tr', {}, [el('td', { text: a }), el('td', { text: b })])));
    page.append(
      el('div', { className: 'cx-cols' }, [
        el('div', {}, [el('h3', { text: 'Клавиатура' }), t([
          ['WASD / стрелки', 'ходить'], ['Space', 'прыжок, ×2 — сальто'], ['J', 'удар / выстрел'], ['K', 'нога'],
          ['L / Shift', 'рывок'], ['J+K или I', 'ярость'], ['в упор к врагу', 'захват'], ['Q / E, 1–5', 'оружие'],
          ['B', 'закупка'], ['P', 'пауза'], ['Enter', 'дальше в диалоге'], ['Esc', 'меню'],
        ])]),
        el('div', {}, [el('h3', { text: 'Геймпад' }), t([
          ['Стик / крестовина', 'ходить'], ['A / ✕', 'прыжок · в меню — выбрать'], ['X / □', 'удар'], ['Y / △', 'нога'],
          ['B / ○', 'рывок · в меню — назад'], ['RB / RT', 'ярость'], ['LB / LT', 'смена оружия'], ['Start', 'пауза / меню'],
        ])]),
        el('div', {}, [el('h3', { text: 'Телефон / планшет' }), t([
          ['Левая половина', 'джойстик (где коснулся)'], ['Кнопки справа', 'удар, нога, прыжок, рывок, ярость, оружие'],
          ['II вверху', 'пауза'], ['Тап по экрану', 'дальше в диалоге'],
        ])]),
      ]),
      foot(''),
    );
  }

  function renderCredits() {
    page.append(
      el('div', { className: 'cx-credits' }, [
        el('p', { html: '<small>ОРИГИНАЛ 2011</small><br><b>Trubakoff Industry</b><br>Евгений Терехов · Илья Трубаков' }),
        el('p', { html: '<small>ПОРТ КЛАССИКИ</small><br><b>DNTZ</b>' }),
        el('p', { html: '<small>REMAKE 2026</small><br><b>DNTZ</b>' }),
      ]),
      foot(''),
    );
  }

  // ---------------------------------------------------------------- actions
  const leave = (screenId, opts) => {
    cleanup();
    stopMenuMusic();
    go(screenId, opts);
  };
  const play = (mapId) => {
    screen.classList.add('launch');
    playSfx('superudar.WAV', { volume: 0.45 * volume('sfx') });
    setTimeout(() => leave('brawl', { map: mapId }), 450);
  };

  const change = (dir) => {
    const p = cur();
    if (p.id === 'hero' || p.id === 'gallery') return move(dir);
    if (p.id !== 'settings') return null;
    const r = settingsRows()[p.sel];
    const st = GameState.settings;
    if (['music', 'sfx', 'voice'].includes(r.id)) {
      st[r.id] = Math.max(0, Math.min(1, Math.round((st[r.id] + dir * 0.1) * 10) / 10));
      if (r.id === 'music') {
        GameState.musicPlay = st.music > 0;
        stopMenuMusic();
        startMusic();
      }
    } else if (r.id === 'shake') st.shake = !st.shake;
    else if (r.id === 'touch') {
      const order = ['auto', 'on', 'off'];
      st.touch = order[(order.indexOf(st.touch) + (dir > 0 ? 1 : 2)) % 3];
    } else return null;
    SaveLoad.save();
    sfx(1.2);
    render();
    return null;
  };

  const move = (d) => {
    const p = cur();
    const n = count(p);
    if (!n) return;
    p.sel = (p.sel + d + n) % n;
    sfx(1.5, 0.15);
    if (p.id === 'chapters' && unlocked(storyIds[p.sel])) nextSlide(`assets/loading/scenes/${storyIds[p.sel]}.jpg`);
    render();
  };

  const openViewer = () => {
    const its = galleryItems().filter((g) => g.open);
    const g0 = galleryItems()[cur().sel];
    let k = Math.max(0, its.findIndex((g) => g.src === g0.src));
    const img = el('div', { className: 'mm-view-img' });
    const cap = el('div', { className: 'mm-view-cap' });
    const show = () => {
      const g = its[k];
      img.style.backgroundImage = `url(${g.src})`;
      const story = g.kind === 'scene' ? STORY[g.id]?.scene : '';
      cap.innerHTML = `<b>${g.title}</b>${story ? `<br>${story}` : ''}<br><small>← → листать · Esc — закрыть</small>`;
    };
    viewer = {
      node: el('div', { className: 'mm-viewer' }, [img, cap]),
      step: (d) => {
        k = (k + d + its.length) % its.length;
        show();
      },
    };
    viewer.node.addEventListener('click', closeViewer);
    screen.append(viewer.node);
    show();
    sfx();
  };
  const closeViewer = () => {
    viewer?.node.remove();
    viewer = null;
    sfx(0.8);
  };

  const activate = () => {
    const p = cur();
    if (p.id === 'main') {
      const it = mainItems()[p.sel];
      if (!it) return;
      if (it.id === 'continue') push('chapters');
      else if (it.id === 'new') push('hero', { mode: 'new' });
      else if (it.id === 'chapters') push('chapters');
      else if (it.id === 'bossrush') push('hero', { mode: 'bossrush' });
      else if (it.id === 'sandbox') leave('brawl', { map: 'sandbox' });
      else if (it.id === 'bones') leave('bones');
      else if (it.id === 'anims') leave('anims');
      else push(it.id);
    } else if (p.id === 'chapters') {
      const id = storyIds[p.sel];
      if (!unlocked(id)) return sfx(0.5);
      play(id);
    } else if (p.id === 'hero') {
      chooseHero(HERO_IDS[p.sel]);
      if (p.mode === 'new') play(storyIds[0]);
      else if (p.mode === 'bossrush') play('bossrush_1');
      else pop();
    } else if (p.id === 'gallery') {
      if (!galleryItems()[p.sel]?.open) return sfx(0.5);
      openViewer();
    } else if (p.id === 'settings') {
      const r = settingsRows()[p.sel];
      if (r.id === 'fullscreen') {
        const fs = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
        Promise.resolve(fs).finally(() => setTimeout(render, 200));
      } else if (r.id === 'reset') {
        // eslint-disable-next-line no-alert
        if (window.confirm('Сбросить прогресс глав? Настройки и герой останутся.')) {
          SaveLoad.reset();
          sfx(0.6);
          render();
        }
      } else change(1);
    }
    return null;
  };

  const showMenu = () => {
    if (stage !== 'title') return;
    stage = 'menu';
    clearTimeout(t1);
    screen.classList.add('ready', 'menu-on', 'cx-on');
    playSfx('beep.wav', { volume: 0.45 * volume('sfx') });
    stack.length = 0;
    stack.push({ id: 'main', sel: 0 });
    render(true);
  };

  const onKey = (e) => {
    if (stage === 'title') {
      if (!e.repeat) showMenu();
      return;
    }
    if (viewer) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') viewer.step(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') viewer.step(1);
      else if (['Escape', 'Backspace', 'Enter', 'Space'].includes(e.code)) closeViewer();
      return;
    }
    const p = cur();
    if (e.code === 'Escape' || e.code === 'Backspace') return pop();
    const horiz = p.id === 'hero';
    const cols = p.id === 'gallery' ? 5 : 1;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') horiz ? null : move(-cols);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') horiz ? null : move(cols);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') change(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') change(1);
    else if (e.code === 'KeyH' && p.id === 'chapters') push('hero', { mode: 'switch' });
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') activate();
    else if (e.code === 'Backquote') {
      dev = !dev;
      sfx(dev ? 1.6 : 0.6);
      render();
    }
    return null;
  };
  screen.addEventListener('click', () => {
    if (stage === 'title') showMenu();
  });
  window.addEventListener('keydown', onKey);

  const cleanup = () => {
    clearTimeout(t1);
    clearInterval(slideTimer);
    window.removeEventListener('keydown', onKey);
  };
  return cleanup;
}

/** Brawl results call this to keep the best grade/time per map. */
export function saveBest(mapId, grade, secs) {
  const order = { S: 4, A: 3, B: 2, C: 1 };
  const all = readBest();
  const cur = all[mapId];
  const mm = Math.floor(secs / 60);
  const time = `${mm}:${String(secs % 60).padStart(2, '0')}`;
  if (!cur || order[grade] > order[cur.grade] || (order[grade] === order[cur.grade] && secs < cur.secs)) {
    all[mapId] = { grade, time, secs };
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
    } catch (_) {
      /* private mode */
    }
  }
}
