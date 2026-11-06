import { el } from './dom.js';
import { playSfx } from './audio.js';
import { GameState, SaveLoad } from '../state/GameState.js';

let menuMusic = null;

export function renderMenu(root, { go }) {
  if (GameState.musicPlay && !menuMusic) {
    menuMusic = playSfx('menu1.mp3', { volume: 0.45, loop: true });
  }

  const stopMusic = () => {
    if (menuMusic) {
      menuMusic.pause();
      menuMusic = null;
    }
  };

  const screen = el('div', { className: 'screen menu' }, [
    el('img', {
      className: 'logo',
      src: 'assets/sprites/logo/0.png',
      alt: 'КОСАРИ',
    }),
    el('div', { className: 'menu-grid' }, [
      el('button', {
        className: 'btn',
        text: 'Играть',
        onClick: () => {
          stopMusic();
          playSfx('beep.wav', { volume: 0.35 });
          GameState.resetRun();
          go('danger');
        },
      }),
      el('button', {
        className: 'btn',
        text: 'Магазин — в сессии (B)',
        onClick: () => {
          playSfx('beep.wav', { volume: 0.35 });
          const msg = el('p', {
            className: 'hint',
            text: 'Между ранами магазина нет — всё покупается в игре на B.',
            style: 'text-align:center;margin-top:12px',
          });
          screen.append(msg);
          setTimeout(() => msg.remove(), 2200);
        },
      }),
      el('button', {
        className: 'btn',
        text: 'Рекорды',
        onClick: () => {
          playSfx('beep.wav', { volume: 0.35 });
          go('highscores');
        },
      }),
      el('button', {
        className: 'btn',
        text: 'Загрузить',
        onClick: () => {
          if (SaveLoad.load()) playSfx('save_load.wav', { volume: 0.55 });
          else playSfx('warning.wav', { volume: 0.4 });
        },
      }),
      el('button', {
        className: 'btn',
        text: 'Кости',
        onClick: () => {
          stopMusic();
          playSfx('beep.wav', { volume: 0.35 });
          go('bones');
        },
      }),
      el('button', {
        className: 'btn',
        text: 'Кости · Никита',
        onClick: () => {
          stopMusic();
          playSfx('beep.wav', { volume: 0.35 });
          go('bones-nikita');
        },
      }),
      el('button', {
        className: 'btn',
        text: 'Анимации',
        onClick: () => {
          stopMusic();
          playSfx('beep.wav', { volume: 0.35 });
          go('anims');
        },
      }),
      el('button', {
        className: 'btn',
        text: 'Создатели',
        onClick: () => {
          playSfx('beep.wav', { volume: 0.35 });
          const msg = el('p', {
            className: 'hint',
            text: 'Trubakoff Industry · Remake 2026',
            style: 'text-align:center;margin-top:12px',
          });
          screen.append(msg);
          setTimeout(() => msg.remove(), 2000);
        },
      }),
      el('button', {
        className: 'btn',
        text: 'Сохранить',
        onClick: () => {
          SaveLoad.save();
          playSfx('save_load.wav', { volume: 0.55 });
        },
      }),
      el('button', {
        className: 'btn span',
        text: 'Выход',
        onClick: () => {
          playSfx('beep.wav', { volume: 0.3 });
          const msg = el('p', {
            className: 'hint',
            text: 'Выйти хочешь — косарь должен!',
            style: 'text-align:center;margin-top:12px',
          });
          screen.append(msg);
          setTimeout(() => msg.remove(), 1600);
        },
      }),
    ]),
    el('p', {
      className: 'hint',
      html: 'Enter — игра · L — загрузка · R — рекорды<br/>WASD — ход · J/K удар · L огонь · I/O оружие · B закупка (1–6)',
    }),
  ]);

  root.append(screen);

  const onKey = (e) => {
    if (e.code === 'Enter') {
      stopMusic();
      GameState.resetRun();
      go('danger');
    } else if (e.code === 'KeyL') {
      if (SaveLoad.load()) playSfx('save_load.wav', { volume: 0.55 });
    } else if (e.code === 'KeyR') {
      go('highscores');
    }
  };
  window.addEventListener('keydown', onKey);

  return () => window.removeEventListener('keydown', onKey);
}

export function stopMenuMusic() {
  if (menuMusic) {
    menuMusic.pause();
    menuMusic = null;
  }
}
