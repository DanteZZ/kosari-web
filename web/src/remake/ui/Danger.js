import { el } from './dom.js';
import { playSfx } from './audio.js';

export function renderDanger(root, { go }) {
  playSfx('warning.wav', { volume: 0.55 });

  const proceed = () => {
    window.removeEventListener('keydown', onKey);
    clearTimeout(timer);
    go('play');
  };

  const onKey = (e) => {
    if (e.code === 'Enter' || e.code === 'Space') proceed();
    if (e.code === 'Escape') {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer);
      go('menu');
    }
  };

  const screen = el('div', { className: 'screen danger-screen' }, [
    el('img', {
      src: 'assets/bg/danger.png',
      alt: 'Опасно',
      style: 'width:min(640px,100%);height:auto;image-rendering:pixelated;display:block;margin:0 auto',
    }),
    el('p', { className: 'tag', text: 'Пробел / Enter — дальше · Esc — меню', style: 'text-align:center;margin-top:12px' }),
  ]);

  root.append(screen);
  window.addEventListener('keydown', onKey);
  const timer = setTimeout(proceed, 3500);

  return () => {
    clearTimeout(timer);
    window.removeEventListener('keydown', onKey);
  };
}
