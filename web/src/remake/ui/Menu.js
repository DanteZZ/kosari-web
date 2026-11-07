import { el } from './dom.js';
import { playSfx } from './audio.js';
import { GameState, SaveLoad } from '../state/GameState.js';
import { MAPS, DEFAULT_MAP } from '../maps/index.js';
import { HEROES, HERO_IDS } from '../game/heroes.js';

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
  if (GameState.musicPlay && !menuMusic) {
    menuMusic = playSfx('menu1.mp3', { volume: 0.45, loop: true });
  }
}

export function stopMenuMusic() {
  if (menuMusic) {
    menuMusic.pause();
    menuMusic = null;
  }
}

/**
 * Title + main menu in the spirit of the NES Contra title: the logo slides in,
 * the screen flashes, "НАЖМИ ENTER" blinks; then a short list with a cursor.
 * Keyboard: ↑↓ / W S choose, ← → / A D change, Enter / Space / J confirm.
 * Dev tools (sandbox, bone/anim editors) are hidden: press ` or open with ?dev=1.
 */
export function renderMenu(root, { go }) {
  const mapIds = Object.keys(MAPS);
  let mapIdx = Math.max(0, mapIds.indexOf(DEFAULT_MAP));
  let stage = 'title';
  let sel = 0;
  let dev = new URLSearchParams(window.location.search).has('dev');
  let credits = null;

  const beep = (rate = 1) => {
    const a = playSfx('beep.wav', { volume: 0.3 });
    a.playbackRate = rate;
  };

  const best = readBest();

  const items = () => {
    const list = [
      { id: 'play', label: 'ИГРАТЬ' },
      { id: 'hero', label: 'ГЕРОЙ', value: () => (HEROES[GameState.hero] || HEROES.pocik).label.toUpperCase(), cycle: true },
      { id: 'map', label: 'КАРТА', value: () => MAPS[mapIds[mapIdx]].name.toUpperCase(), cycle: true },
      { id: 'sound', label: 'ЗВУК', value: () => (GameState.musicPlay ? 'ВКЛ' : 'ВЫКЛ'), cycle: true },
      { id: 'credits', label: 'СОЗДАТЕЛИ' },
    ];
    if (dev) {
      list.push(
        { id: 'sandbox', label: 'ПЕСОЧНИЦА', dev: true },
        { id: 'bones', label: 'КОСТИ', dev: true },
        { id: 'bones-enemy', label: 'КОСТИ · ВРАГИ', dev: true },
        { id: 'anims', label: 'АНИМАЦИИ', dev: true },
      );
    }
    return list;
  };

  // ---- DOM
  const list = el('ul', { className: 'mm-list' });
  const press = el('div', { className: 'mm-press', text: 'НАЖМИ ENTER' });
  const bestLine = el('div', { className: 'mm-best' });
  const logo = el('img', { className: 'mm-logo', src: 'assets/sprites/logo/0_alpha.png', alt: 'КОСАРИ' });
  const flash = el('div', { className: 'mm-flash' });
  const screen = el('div', { className: 'mm' }, [
    el('div', { className: 'mm-bg' }),
    el('div', { className: 'mm-embers' }, Array.from({ length: 24 }, (_, i) => el('i', { style: `--i:${i}` }))),
    el('div', { className: 'mm-content' }, [logo, press, list, bestLine]),
    el('div', { className: 'mm-foot', html: 'TM AND © 2011 TRUBAKOFF INDUSTRY CO., LTD · REMAKE 2026' }),
    el('div', { className: 'mm-scan' }),
    flash,
  ]);
  root.append(screen);
  startMusic();

  // Logo slides in, then the flash, then the blinking prompt
  const t1 = setTimeout(() => {
    flash.classList.add('on');
    playSfx('superudar.WAV', { volume: 0.35 });
    screen.classList.add('ready');
  }, 1100);

  const render = () => {
    const its = items();
    sel = Math.min(sel, its.length - 1);
    list.innerHTML = '';
    its.forEach((it, i) => {
      const li = el('li', { className: `mm-item${i === sel ? ' on' : ''}${it.dev ? ' dev' : ''}` }, [
        el('img', { className: 'mm-cursor', src: 'assets/sprites/kosar/0.png', alt: '' }),
        el('span', { className: 'mm-label', text: it.label }),
        it.value ? el('span', { className: 'mm-value', html: `<b>&lt;</b> ${it.value()} <b>&gt;</b>` }) : null,
      ]);
      li.addEventListener('mouseenter', () => {
        if (sel !== i) {
          sel = i;
          beep(1.4);
          render();
        }
      });
      li.addEventListener('click', (e) => {
        sel = i;
        // Clicking the right half of a value row steps forward, left half back
        if (it.cycle) {
          const r = li.getBoundingClientRect();
          change(e.clientX > r.left + r.width / 2 ? 1 : -1);
        } else activate();
      });
      list.append(li);
    });
    const m = mapIds[mapIdx];
    const b = best[m];
    const cur = items()[sel];
    const hero = HEROES[GameState.hero] || HEROES.pocik;
    if (cur?.id === 'hero') bestLine.textContent = hero.blurb;
    else bestLine.textContent = b ? `Лучшее на карте «${MAPS[m].name}»: ${b.grade} · ${b.time}` : '';
  };

  const showMenu = () => {
    if (stage !== 'title') return;
    stage = 'menu';
    clearTimeout(t1);
    screen.classList.add('ready', 'menu-on');
    playSfx('beep.wav', { volume: 0.45 });
    render();
  };

  const change = (dir) => {
    const it = items()[sel];
    if (!it?.cycle) return;
    if (it.id === 'map') mapIdx = (mapIdx + dir + mapIds.length) % mapIds.length;
    if (it.id === 'hero') {
      const i = Math.max(0, HERO_IDS.indexOf(GameState.hero));
      GameState.hero = HERO_IDS[(i + dir + HERO_IDS.length) % HERO_IDS.length];
      SaveLoad.save?.();
    }
    if (it.id === 'sound') {
      GameState.musicPlay = !GameState.musicPlay;
      SaveLoad.save?.();
      if (GameState.musicPlay) startMusic();
      else stopMenuMusic();
    }
    beep(1.2);
    render();
  };

  const leave = (screenId, opts) => {
    cleanup();
    stopMenuMusic();
    playSfx('beep.wav', { volume: 0.45 });
    go(screenId, opts);
  };

  const activate = () => {
    const it = items()[sel];
    if (!it) return;
    switch (it.id) {
      case 'play':
        screen.classList.add('launch');
        playSfx('superudar.WAV', { volume: 0.45 });
        setTimeout(() => leave('brawl', { map: mapIds[mapIdx] }), 450);
        break;
      case 'hero':
      case 'map':
      case 'sound':
        change(1);
        break;
      case 'credits':
        toggleCredits(true);
        break;
      case 'sandbox':
        leave('brawl', { map: 'sandbox' });
        break;
      case 'bones':
        leave('bones');
        break;
      case 'bones-enemy':
        leave('bones-nikita');
        break;
      case 'anims':
        leave('anims');
        break;
      default:
    }
  };

  const toggleCredits = (on) => {
    if (on && !credits) {
      credits = el('div', { className: 'mm-credits' }, [
        el('h2', { text: 'СОЗДАТЕЛИ' }),
        el('p', { html: 'Оригинал 2011<br><b>Евгений Терехов</b><br><b>Илья Трубаков</b>' }),
        el('p', { html: 'Remake 2026<br><b>Trubakoff Industry</b>' }),
        el('p', { className: 'mm-small', text: 'Esc / Enter — назад' }),
      ]);
      credits.addEventListener('click', () => toggleCredits(false));
      screen.append(credits);
      beep();
    } else if (!on && credits) {
      credits.remove();
      credits = null;
      beep(0.8);
    }
  };

  const onKey = (e) => {
    if (credits) {
      if (['Escape', 'Enter', 'Space', 'Backspace'].includes(e.code)) toggleCredits(false);
      return;
    }
    if (stage === 'title') {
      if (!e.repeat) showMenu();
      return;
    }
    const n = items().length;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      sel = (sel - 1 + n) % n;
      beep(1.4);
      render();
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      sel = (sel + 1) % n;
      beep(1.4);
      render();
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') change(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') change(1);
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyJ') activate();
    else if (e.code === 'Backquote') {
      dev = !dev;
      beep(dev ? 1.6 : 0.6);
      render();
    }
  };
  screen.addEventListener('click', () => {
    if (stage === 'title') showMenu();
  });
  window.addEventListener('keydown', onKey);

  const cleanup = () => {
    clearTimeout(t1);
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
