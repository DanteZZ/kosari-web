import { el } from './dom.js';
import { Highscores } from '../state/Highscores.js';
import { playSfx } from './audio.js';

export function renderHighscores(root, { go, submitScore = null }) {
  let list = Highscores.top10();

  const listEl = el('ul', { className: 'scores' });

  const paint = () => {
    list = Highscores.top10();
    listEl.replaceChildren(
      ...(list.length
        ? list.map((row, i) =>
            el('li', {}, [
              el('span', { text: `${i + 1}. ${row.name}` }),
              el('span', { text: String(row.score) }),
            ]),
          )
        : [el('li', {}, [el('span', { text: 'Пока пусто' }), el('span', { text: '—' })])]),
    );
  };
  paint();

  const children = [
    el('div', { className: 'panel-head' }, [el('h2', { text: 'Рекорды' })]),
    listEl,
  ];

  if (submitScore != null && Highscores.qualifies(submitScore)) {
    const input = el('input', {
      type: 'text',
      maxlength: '16',
      placeholder: 'Имя',
      value: 'Игрок',
    });
    children.push(
      el('p', { text: `Новый результат: ${submitScore}` }),
      el('div', { className: 'form-row' }, [
        input,
        el('button', {
          className: 'btn primary',
          text: 'Записать',
          onClick: () => {
            Highscores.submit(submitScore, input.value);
            playSfx('hulitakmalo.wav', { volume: 0.5 });
            paint();
          },
        }),
      ]),
    );
  } else if (submitScore != null) {
    children.push(el('p', { text: `Счёт: ${submitScore}` }));
  }

  children.push(
    el('div', { style: 'margin-top:16px' }, [
      el('button', {
        className: 'btn ghost',
        text: '← В меню',
        onClick: () => go('menu'),
      }),
    ]),
  );

  root.append(el('div', { className: 'screen' }, [el('div', { className: 'panel' }, children)]));
}
