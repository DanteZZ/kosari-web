import { el } from './dom.js';
import { playSfx } from './audio.js';
import { volume, GameState } from '../state/GameState.js';
import { HEROES, HERO_IDS } from '../game/heroes.js';
import { MAPS } from '../maps/index.js';
import { Session } from '../net/Session.js';
import { MODES, modeOfMap } from '../maps/modes.js';

/**
 * «Онлайн» — the squad screen (server/index.mjs keeps the rooms).
 *
 * Opening it creates your session at once: the code and «Пригласить» are in
 * the top bar, your hero stands on the stage. Friends who open the link (or
 * type the code) walk onto the stage next to you — up to four, each with a
 * plate: nickname, hero, ready. The host picks the chapter, sets a password
 * if he wants, can show a guest the door, and starts when everybody is ready.
 *
 * When the room goes into the game every seat is sent to the fight
 * (app.go('brawl', { net })); when the host ends it, back here.
 */
const HERO_ART = (id) => `assets/loading/hero_${id}.png`;
const NAME_MAX = 18;

export function renderLobby(root, { go, join }) {
  const storyIds = Object.keys(MAPS).filter((id) => !MAPS[id].hidden && id !== 'sandbox');
  const bg = el('div', { className: 'sq-bg' });
  const stage = el('div', { className: 'sq-stage' });
  const top = el('div', { className: 'sq-top' });
  const bottom = el('div', { className: 'sq-bottom' });
  const side = el('div', { className: 'sq-side' });
  const veil = el('div', { className: 'sq-veil' });
  const toast = el('div', { className: 'lb-toast' });
  const screen = el('div', { className: 'sq' }, [bg, el('div', { className: 'sq-shade' }), stage, top, side, bottom, veil, toast]);
  root.append(screen);

  let busy = false;
  let pendingJoin = join ? String(join).toUpperCase() : '';

  const sfx = (rate = 1) => {
    const a = playSfx('beep.wav', { volume: 0.3 * volume('sfx') });
    a.playbackRate = rate;
  };
  const say = (msg, bad = false) => {
    toast.textContent = msg;
    toast.className = `lb-toast on${bad ? ' bad' : ''}`;
    clearTimeout(say.t);
    say.t = setTimeout(() => (toast.className = 'lb-toast'), 2800);
  };
  const myName = () => {
    if (!Session.name) Session.name = `Игрок ${Math.floor(100 + Math.random() * 900)}`;
    return Session.name;
  };

  // ---------------------------------------------------------------- connecting / waiting
  function showVeil(text, actions = []) {
    veil.innerHTML = '';
    veil.className = 'sq-veil on';
    veil.append(el('div', { className: 'sq-veil-box' }, [el('div', { className: 'sq-veil-text', text }), el('div', { className: 'sq-veil-acts' }, actions)]));
  }
  const hideVeil = () => (veil.className = 'sq-veil');

  async function connectAnd(msg) {
    if (busy) return;
    busy = true;
    showVeil('Подключение к серверу сессий…');
    try {
      await Session.connect();
      Session.send(msg);
    } catch (_) {
      showVeil('Сервер сессий недоступен', [
        el('button', { className: 'lb-btn hot', text: 'Повторить', onclick: () => connectAnd(msg) }),
        el('button', { className: 'lb-btn ghost', text: 'В меню', onclick: back }),
      ]);
    }
    busy = false;
  }
  const createOwn = () => connectAnd({ t: 'create', name: myName(), hero: GameState.hero });
  const joinCode = (code, pass = '') => {
    pendingJoin = code;
    return connectAnd({ t: 'join', code, name: myName(), hero: GameState.hero, pass });
  };

  function askPassword(code, wrong) {
    const inp = el('input', { className: 'lb-in', type: 'password', maxlength: 32, placeholder: 'Пароль' });
    const ok = () => joinCode(code, inp.value);
    inp.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
    showVeil(wrong ? `Неверный пароль для сессии ${code}` : `Сессия ${code} закрыта паролем`, [
      inp,
      el('button', { className: 'lb-btn hot', text: 'Войти', onclick: ok }),
      el('button', { className: 'lb-btn ghost', text: 'Своя сессия', onclick: createOwn }),
    ]);
    setTimeout(() => inp.focus(), 50);
  }

  // ---------------------------------------------------------------- the squad
  async function invite() {
    const link = Session.inviteLink();
    try {
      await navigator.clipboard.writeText(link);
      say('Ссылка скопирована — отправь её друзьям');
    } catch (_) {
      say(link);
    }
    sfx(1.4);
  }

  function plate(s, i, r) {
    const h = HEROES[s.hero] || HEROES.pocik;
    const you = i === r.you;
    const kids = [
      el('div', { className: 'sq-pname' }, [el('i', { className: `sq-pin${s.host ? ' host' : ''}` }), el('span', { text: s.name })]),
      el('div', { className: 'sq-pline' }, [
        el('span', { className: 'sq-phero', text: h.label }),
        el('span', { className: 'sq-sep', text: '|' }),
        el('span', { className: `sq-pstat${s.host || s.ready ? ' ok' : ''}`, text: s.host ? '★ ХОСТ' : s.ready ? '✓ ГОТОВ' : 'НЕ ГОТОВ' }),
      ]),
    ];
    const subs = [];
    if (you) subs.push(el('button', { className: 'sq-sub', text: 'СМЕНИТЬ НИК', onclick: rename }));
    if (r.you === 0 && !you) subs.push(el('button', { className: 'sq-sub', text: 'ВЫГНАТЬ', onclick: () => Session.send({ t: 'kick', seat: i }) }));
    return el('div', { className: `sq-plate${you ? ' you' : ''}` }, [el('div', { className: 'sq-pmain' }, kids), subs.length ? el('div', { className: 'sq-psubs' }, subs) : null]);
  }

  function rename() {
    const cur = Session.room?.seats[Session.seat]?.name || '';
    // eslint-disable-next-line no-alert
    const v = window.prompt('Твой ник', cur);
    if (v == null) return;
    const name = v.trim().slice(0, NAME_MAX);
    if (!name) return;
    Session.name = name;
    Session.send({ t: 'name', name });
  }

  function renderStage(r) {
    stage.innerHTML = '';
    r.seats.forEach((s, i) => {
      const slot = el('div', { className: `sq-slot s${i}${s ? '' : ' empty'}${i === r.you ? ' you' : ''}${s?.ready || s?.host ? ' ready' : ''}` });
      if (s) {
        slot.append(
          el('div', { className: 'sq-shadow' }),
          el('img', { className: 'sq-hero', src: HERO_ART(HEROES[s.hero] ? s.hero : 'pocik'), alt: '' }),
          plate(s, i, r),
        );
      } else {
        slot.append(
          el('div', { className: 'sq-ghost' }),
          el('button', { className: 'sq-inv', onclick: invite }, [el('b', { text: '+' }), el('span', { text: 'Пригласить' })]),
        );
      }
      stage.append(slot);
    });
  }

  function renderTop(r) {
    top.innerHTML = '';
    const host = r.you === 0;
    const pass = el('input', { className: 'sq-in', type: 'password', maxlength: 32, placeholder: host ? 'без пароля' : '', disabled: host ? null : 'disabled' });
    if (host) {
      pass.addEventListener('change', () => {
        Session.send({ t: 'pass', pass: pass.value });
        say(pass.value ? 'Пароль поставлен' : 'Пароль снят');
      });
    }
    const code = el('input', { className: 'sq-in sq-codein', maxlength: 8, placeholder: 'КОД ДРУГА' });
    const go2 = () => {
      const c = code.value.trim().toUpperCase();
      if (!c) return say('Введи код сессии друга', true);
      if (c === r.code) return say('Ты уже в этой сессии', true);
      Session.leave();
      joinCode(c);
    };
    code.addEventListener('keydown', (e) => e.key === 'Enter' && go2());
    top.append(
      el('div', { className: 'sq-tile' }, [el('div', { className: 'sq-tile-big', text: 'ОНЛАЙН' }), el('div', { className: 'sq-tile-sub', text: `КООП · ${r.seats.filter(Boolean).length}/4` })]),
      el('div', { className: 'sq-bar' }, [
        el('div', { className: 'sq-field' }, [el('label', { text: 'Сессия' }), el('div', { className: 'sq-code', text: r.code })]),
        el('button', { className: 'sq-btn hot', text: 'Пригласить', onclick: invite }),
        el('div', { className: 'sq-field' }, [el('label', { text: r.pass ? '🔒 Пароль' : 'Пароль' }), host ? pass : el('div', { className: 'sq-code small', text: r.pass ? 'есть' : 'нет' })]),
        el('div', { className: 'sq-field grow' }),
        el('div', { className: 'sq-field' }, [el('label', { text: 'Зайти к другу' }), el('div', { className: 'sq-row' }, [code, el('button', { className: 'sq-btn', text: 'Войти', onclick: go2 })])]),
      ]),
      el('button', { className: 'sq-x', title: 'Выйти в меню', text: '✕', onclick: back }),
    );
  }

  function renderBottom(r) {
    bottom.innerHTML = '';
    const me = r.seats[r.you];
    const host = r.you === 0;
    const others = r.seats.filter((s, i) => s && i !== 0);
    const mode = modeOfMap(r.map);
    const count = r.seats.filter(Boolean).length;
    const enough = count >= (mode.min || 1);
    const allReady = others.every((s) => s.ready) && enough;

    const heroes = el('div', { className: 'sq-heroes' }, HERO_IDS.map((id) => el('button', {
      className: `sq-hpick${me?.hero === id ? ' on' : ''}`,
      title: HEROES[id].label,
      onclick: () => {
        if (me?.hero === id) return;
        GameState.hero = id;
        Session.send({ t: 'hero', hero: id });
        sfx(1.2);
      },
    }, [el('img', { src: HERO_ART(id), alt: '' }), el('span', { text: HEROES[id].label })])));

    const action = host
      ? el('button', {
        className: `sq-go${allReady ? '' : ' wait'}`,
        text: allReady ? 'НАЧАТЬ' : enough ? 'ЖДЁМ ГОТОВНОСТИ' : `НУЖНО ИГРОКОВ: ${mode.min}`,
        onclick: () => {
          if (!allReady) return say(enough ? 'Не все готовы' : `Режиму «${mode.title}» нужно от ${mode.min} игроков`, true);
          Session.send({ t: 'start' });
        },
      })
      : el('button', {
        className: `sq-go${me?.ready ? ' wait' : ''}`,
        text: me?.ready ? 'НЕ ГОТОВ' : 'ГОТОВ',
        onclick: () => {
          Session.send({ t: 'ready', on: !me?.ready });
          sfx(me?.ready ? 0.8 : 1.4);
        },
      });

    bottom.append(
      el('div', { className: 'sq-panel' }, [el('label', { text: 'Твой герой' }), heroes]),
      el('div'),
      el('div', { className: 'sq-panel right' }, [action, el('div', { className: 'sq-hint', text: host ? 'Друзья заходят по ссылке «Пригласить» или по коду' : 'Ждём, пока хост начнёт' })]),
    );
  }

  /** Right side: the mode list and, for «Обычный», the chapter cards. Only the host picks. */
  let lastStory = 'forest';
  function renderSide(r) {
    const host = r.you === 0;
    const mode = modeOfMap(r.map);
    if (mode.id === 'story') lastStory = r.map;
    const scrollModes = side.querySelector('.sq-modes')?.scrollTop || 0;
    const scrollCh = side.querySelector('.sq-chapters')?.scrollTop || 0;
    side.innerHTML = '';
    side.classList.toggle('ro', !host);
    const pick = (map) => {
      if (!host || map === r.map) return;
      Session.send({ t: 'map', map });
      sfx(1.2);
    };
    const modes = el('div', { className: 'sq-modes' }, MODES.map((m) => el('button', {
      className: `sq-mode${m.id === mode.id ? ' on' : ''}${m.mini ? ' mini' : ''}`,
      onclick: () => pick(m.map || lastStory),
    }, [el('span', { className: 'sq-mico', text: m.icon }), el('span', { className: 'sq-mtxt' }, [el('b', { text: m.title }), el('small', { text: m.sub })])])));
    side.append(el('label', { text: host ? 'Режим' : 'Режим (выбирает хост)' }), modes);
    if (mode.id === 'story') {
      const cards = el('div', { className: 'sq-chapters' }, storyIds.map((id) => {
        const open = GameState.progress.unlocked.includes(id) || !host;
        return el('button', {
          className: `sq-ch${id === r.map ? ' on' : ''}${open ? '' : ' locked'}`,
          onclick: () => (open ? pick(id) : say('Глава ещё не открыта', true)),
        }, [
          el('div', { className: 'sq-chimg', style: `background-image:url(assets/loading/scenes/${id}.jpg)` }),
          el('div', { className: 'sq-chtxt' }, [el('small', { text: MAPS[id].chapter || '' }), el('b', { text: open ? MAPS[id].name : '🔒 ' + MAPS[id].name })]),
        ]);
      }));
      side.append(el('label', { text: 'Глава' }), cards);
      cards.scrollTop = scrollCh;
      // The picked chapter in view
      if (!scrollCh) requestAnimationFrame(() => cards.querySelector('.sq-ch.on')?.scrollIntoView({ block: 'center' }));
    }
    modes.scrollTop = scrollModes;
  }

  let shownMap = null;
  function renderRoom() {
    const r = Session.room;
    if (!r) return;
    hideVeil();
    if (shownMap !== r.map) {
      shownMap = r.map;
      const base = MAPS[r.map]?.baseId || r.map;
      bg.style.backgroundImage = `url(assets/loading/scenes/${MAPS[base] ? base : 'forest'}.jpg)`;
    }
    renderTop(r);
    renderSide(r);
    renderStage(r);
    renderBottom(r);
  }

  // ---------------------------------------------------------------- messages
  let lastCount = 0;
  const off = Session.on((m) => {
    if (m.t === 'err') {
      sfx(0.6);
      if (m.code === 'pass') return askPassword(pendingJoin, !!m.wrong || veil.querySelector('input'));
      say(m.msg, true);
      // The friend's session is gone / full: here is your own instead
      if (!Session.room) createOwn();
      return;
    }
    if (m.t === 'kicked') {
      say('Хост выгнал тебя из сессии', true);
      createOwn();
      return;
    }
    if (m.t === 'closed') {
      say(m.reason === 'connection' ? 'Связь с сервером потеряна' : 'Хост закрыл сессию', true);
      createOwn();
      return;
    }
    if (m.t === 'room') {
      if (m.room.state === 'game') {
        // Everybody into the fight, each with the hero picked here
        const s = m.room.seats[m.room.you];
        if (s) GameState.hero = s.hero;
        go('brawl', { map: m.room.map, net: true });
        return;
      }
      pendingJoin = '';
      const n = m.room.seats.filter(Boolean).length;
      if (n > lastCount && lastCount) {
        sfx(1.6);
        say('В отряде пополнение');
      }
      lastCount = n;
      renderRoom();
    }
  });

  function back() {
    if (Session.room) Session.leave();
    go('menu');
  }

  const onKey = (e) => {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT') return;
    if (e.code === 'Escape') back();
  };
  window.addEventListener('keydown', onKey);

  // Straight in: a friend's link joins his session, otherwise your own opens
  if (Session.room) renderRoom();
  else if (pendingJoin) joinCode(pendingJoin);
  else createOwn();

  return () => {
    off();
    window.removeEventListener('keydown', onKey);
  };
}
