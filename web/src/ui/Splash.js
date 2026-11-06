import { el } from './dom.js';
import { playSfx } from './audio.js';

/** Original room intro: tiled intro_1 (ЧЁГА) on black. */
export function renderSplash(root, { onDone }) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey);
    onDone();
  };
  const onKey = (e) => {
    if (e.code === 'Enter' || e.code === 'Space') go();
  };

  const screen = el('div', { className: 'splash', onClick: go }, [
    el('img', {
      className: 'intro',
      src: '/assets/bg/intro_1.png',
      alt: 'ЧЁГА',
    }),
  ]);

  root.append(screen);
  playSfx('warning.wav', { volume: 0.45 });
  window.addEventListener('keydown', onKey);
  const timer = setTimeout(go, 3500);

  return () => {
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey);
  };
}
