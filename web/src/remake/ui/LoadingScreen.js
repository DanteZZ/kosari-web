import { el } from './dom.js';

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

/**
 * @param {HTMLElement} parent
 * @param {{ story?: object, interactive?: boolean }} opts
 */
export function showLoading(parent, { story, interactive = true } = {}) {
  hideLoading();
  const s = { ...DEFAULT_STORY, ...(story || {}) };

  const bar = el('i', { className: 'wl-bar-fill' });
  const prompt = el('div', { className: 'wl-prompt', text: 'Нажмите любую клавишу, чтобы продолжить' });
  const text = el('div', { className: 'wl-text' }, s.text.map((p) => el('p', { text: p })));

  node = el('div', { className: 'wl' }, [
    el('div', { className: 'wl-paper' }),
    el('div', { className: 'wl-wash', style: `background-image:url(assets/world/layers/mid.png)` }),
    el('img', { className: 'wl-art', src: `assets/loading/${s.art.includes('.') ? s.art : `${s.art}.png`}`, alt: '' }),
    el('div', { className: 'wl-ink' }),
    el('div', { className: 'wl-story' }, [
      el('h1', { className: 'wl-title', text: s.title }),
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
  // Narration fades in paragraph by paragraph
  [...text.children].forEach((p, i) => {
    p.style.animationDelay = `${0.4 + i * 1.1}s`;
  });

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
  node?.remove();
  node = null;
}
