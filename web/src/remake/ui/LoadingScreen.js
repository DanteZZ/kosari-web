import { el } from './dom.js';
import { volume } from '../state/GameState.js';

/**
 * Loading screen — an homage to The Witcher 3's: an ink-and-wash illustration
 * on parchment, the narrator's recap on the left, a medallion slowly turning in
 * the corner while loading, then «Нажмите любую клавишу». All art is our own
 * (stance drawings + forest layers run through ink filters).
 */

const DEFAULT_STORY = {
  title: 'Косари',
  art: 'buiniy',
  text: [
    'Никто уже не помнил, с чего всё началось. Одни говорили — с долга в один косарь. Другие — что косарь был вовсе не один.',
    'Ясно было одно: пацан в спортивном костюме снова вышел на дорогу, а значит, кому-то сегодня придётся платить.',
  ],
  tip: 'Отбивай брошенное в тебя ударом — свою же бутылку враги ловят лицом.',
};

let node = null;
/** Narrator voice-over playing on the current loading screen. */
let voice = null;
/** Quiet music bed under the narration. */
let bed = null;

function playBed(slot) {
  stopBed();
  if (!slot || volume('music') <= 0) return;
  bed = new Audio(`assets/music/${slot}.mp3`);
  bed.loop = true;
  bed.volume = 0.22 * volume('music');
  bed.play().catch(() => {});
}

function stopBed() {
  bed?.pause();
  bed = null;
}

/** Play the narration clips one after another (missing files are skipped). */
function playVoice(urls, onClip = null) {
  stopVoice();
  const list = [...(urls || [])];
  const state = { audio: null, stopped: false, i: -1 };
  const next = () => {
    if (state.stopped || !list.length) return;
    state.i += 1;
    onClip?.(state.i);
    const a = new Audio(list.shift());
    a.volume = 0.95 * volume('voice');
    a.onended = next;
    a.onerror = next;
    state.audio = a;
    a.play().catch(() => {});
  };
  next();
  voice = state;
}

function stopVoice() {
  if (!voice) return;
  voice.stopped = true;
  voice.audio?.pause();
  voice = null;
}

/**
 * @param {HTMLElement} parent
 * @param {{ story?: object, interactive?: boolean }} opts
 */
export function showLoading(parent, { story, interactive = true } = {}) {
  hideLoading();
  const s = { ...DEFAULT_STORY, ...(story || {}) };
  playBed(s.music === undefined ? 'ui_loading' : s.music);

  const bar = el('i', { className: 'wl-bar-fill' });
  const prompt = el('div', { className: 'wl-prompt', text: 'Нажмите любую клавишу, чтобы продолжить' });
  const text = el('div', { className: 'wl-text' }, s.text.map((p) => el('p', { text: p })));

  if (s.bg) {
    // Cinematic: the painting fills the screen, the narrator's words run as subtitles
    const sub = el('div', { className: 'wl-sub' });
    const showSub = (i) => {
      const t = s.text[Math.min(i, s.text.length - 1)];
      if (!t) return;
      sub.classList.remove('on');
      setTimeout(() => {
        sub.textContent = t;
        sub.classList.add('on');
      }, 180);
    };
    node = el('div', { className: 'wl cine' }, [
      el('div', { className: 'wl-bg', style: `background-image:url(${s.bg})` }),
      el('div', { className: 'wl-vignette' }),
      el('div', { className: 'wl-letter top' }),
      el('div', { className: 'wl-letter bottom' }),
      el('div', { className: 'wl-loc' }, [
        el('div', { className: 'wl-loc-chapter', text: s.chapter || '' }),
        el('h1', { className: 'wl-title', text: s.title }),
        s.goal ? el('div', { className: 'wl-goal', text: s.goal }) : null,
      ]),
      s.tip ? el('div', { className: 'wl-tip', html: `<b>Совет.</b> ${s.tip}` }) : null,
      sub,
      el('div', { className: 'wl-medallion' }, [
        el('div', { className: 'wl-coin' }, [el('img', { src: s.face || 'assets/enemies/nikita/parts/head.png', alt: '' })]),
      ]),
      el('div', { className: 'wl-bar' }, [bar]),
      prompt,
    ]);
    parent.append(node);
    if (s.voice?.length) {
      setTimeout(() => node && playVoice(s.voice, showSub), 600);
    } else {
      // No voice: paragraphs change by reading time
      let i = 0;
      const step = () => {
        if (!node || !sub.isConnected) return;
        showSub(i);
        const t = s.text[i] || '';
        i = (i + 1) % s.text.length;
        setTimeout(step, 2500 + t.length * 45);
      };
      setTimeout(step, 500);
    }
  } else {
  node = el('div', { className: 'wl' }, [
    el('div', { className: 'wl-paper' }),
    el('div', { className: 'wl-wash', style: `background-image:url(assets/world/layers/mid.png)` }),
    el('img', { className: 'wl-art', src: `assets/loading/${s.art.includes('.') ? s.art : `${s.art}.png`}`, alt: '' }),
    el('div', { className: 'wl-ink' }),
    el('div', { className: 'wl-story' }, [
      el('h1', { className: 'wl-title', text: s.title }),
      s.goal ? el('div', { className: 'wl-goal', text: s.goal }) : null,
      el('div', { className: 'wl-rule' }),
      text,
      s.tip ? el('div', { className: 'wl-tip', html: `<b>Совет.</b> ${s.tip}` }) : null,
    ]),
    el('div', { className: 'wl-medallion' }, [
      el('div', { className: 'wl-coin' }, [el('img', { src: 'assets/enemies/nikita/parts/head.png', alt: '' })]),
    ]),
    el('div', { className: 'wl-bar' }, [bar]),
    prompt,
  ]);
  parent.append(node);
  // Narrator reads the chapter opening (small delay: the screen fades in first)
  if (s.voice?.length) setTimeout(() => node && playVoice(s.voice), 600);
  // Narration fades in paragraph by paragraph
  [...text.children].forEach((p, i) => {
    p.style.animationDelay = `${0.4 + i * 1.1}s`;
  });
  }

  let ready = false;
  let onDone = null;
  const finish = () => {
    if (!ready || !onDone) return;
    const cb = onDone;
    onDone = null;
    window.removeEventListener('keydown', onKey);
    node?.classList.add('out');
    setTimeout(hideLoading, 420);
    cb();
  };
  const onKey = (e) => {
    if (e.repeat) return;
    finish();
  };
  node.addEventListener('click', () => finish());

  return {
    progress(v) {
      bar.style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    },
    /** Loading finished: wait for a key (or go straight on when not interactive). */
    done(cb) {
      ready = true;
      onDone = cb;
      node?.classList.add('ready');
      if (!interactive) finish();
      else window.addEventListener('keydown', onKey);
    },
  };
}

export function hideLoading() {
  stopVoice();
  stopBed();
  node?.remove();
  node = null;
}
