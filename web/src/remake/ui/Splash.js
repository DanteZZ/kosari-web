import { el } from './dom.js';
import { playSfx } from './audio.js';

/**
 * Intro like the original (room "2"): ЧЁГА on a white screen with the
 * two-part jingle (yeba1, then yeba2 a third of a second later), then a short
 * black beat before the menu. Enter / Space / click skips.
 */
export function renderSplash(root, { onDone }) {
  let done = false;
  const timers = [];
  const go = () => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    window.removeEventListener('keydown', onKey);
    onDone();
  };
  const onKey = (e) => {
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') go();
  };

  const screen = el('div', { className: 'splash', onClick: go }, [
    el('img', {
      className: 'intro',
      src: 'assets/bg/intro_1.png',
      alt: 'ЧЁГА',
    }),
  ]);

  root.append(screen);
  playSfx('yeba1.wav', { volume: 0.7 });
  timers.push(setTimeout(() => playSfx('yeba2.wav', { volume: 0.7 }), 333));
  // White hold, then fade to black like the original's black room, then menu
  timers.push(setTimeout(() => screen.classList.add('out'), 2000));
  timers.push(setTimeout(go, 2700));
  window.addEventListener('keydown', onKey);

  return () => {
    timers.forEach(clearTimeout);
    window.removeEventListener('keydown', onKey);
  };
}
