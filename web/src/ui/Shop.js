import { el } from './dom.js';
import { playSfx } from './audio.js';
import { GameState } from '../state/GameState.js';

const CATALOG = [
  {
    title: 'Desert Eagle',
    desc: 'Пистолет. Патроны ×30.',
    price: 15000,
    buy: () => {
      GameState.deserteagle = 1;
      GameState.deserteaglebullets += 30;
      GameState.weaponChoose = 1;
    },
    status: () =>
      GameState.deserteagle
        ? `Куплено · патроны ${GameState.deserteaglebullets}`
        : 'Не куплено',
  },
  {
    title: 'Дробовик',
    desc: 'Близкий бой. Патроны ×16.',
    price: 35000,
    buy: () => {
      GameState.shotgunbought = 1;
      GameState.shotgunbullets += 16;
      GameState.weaponChoose = 2;
    },
    status: () =>
      GameState.shotgunbought
        ? `Куплено · патроны ${GameState.shotgunbullets}`
        : 'Не куплено',
  },
  {
    title: 'АК-47',
    desc: 'Автомат. Патроны ×60.',
    price: 55000,
    buy: () => {
      GameState.ak47bought = 1;
      GameState.ak47bullets += 60;
      GameState.weaponChoose = 3;
    },
    status: () =>
      GameState.ak47bought ? `Куплено · патроны ${GameState.ak47bullets}` : 'Не куплено',
  },
  {
    title: 'РПГ-7',
    desc: 'Тяжёлая артиллерия. ×3.',
    price: 90000,
    buy: () => {
      GameState.rpg7bought = 1;
      GameState.rpg7bullets += 3;
      GameState.weaponChoose = 4;
    },
    status: () =>
      GameState.rpg7bought ? `Куплено · патроны ${GameState.rpg7bullets}` : 'Не куплено',
  },
  {
    title: 'Гранаты',
    desc: 'Карманный хаос. ×3.',
    price: 20000,
    buy: () => {
      GameState.grenades += 3;
    },
    status: () => `В запасе: ${GameState.grenades}`,
  },
  {
    title: 'Аптечка',
    desc: 'Восстановить здоровье до 100.',
    price: 8000,
    buy: () => {
      GameState.health = 100;
    },
    status: () => `HP ${GameState.health}`,
  },
];

export function renderShop(root, { go }) {
  const balanceEl = el('div', { className: 'balance', text: `Баланс: ${GameState.moneyScore}` });

  const refreshBalance = () => {
    balanceEl.textContent = `Баланс: ${GameState.moneyScore}`;
  };

  const buy = (item) => {
    if (GameState.moneyScore < item.price) {
      playSfx('warning.wav', { volume: 0.4 });
      return;
    }
    GameState.moneyScore -= item.price;
    item.buy();
    playSfx('cash.wav', { volume: 0.55 });
    refreshBalance();
    renderCards();
  };

  const grid = el('div', { className: 'shop-grid' });

  const renderCards = () => {
    grid.replaceChildren(
      ...CATALOG.map((item) =>
        el('div', { className: 'card' }, [
          el('h3', { text: item.title }),
          el('p', { text: item.desc }),
          el('div', { className: 'owned', text: item.status() }),
          el('div', { className: 'price', text: String(item.price) }),
          el('button', {
            className: 'btn',
            text: 'Купить',
            disabled: GameState.moneyScore < item.price ? 'true' : undefined,
            onClick: () => buy(item),
          }),
        ]),
      ),
    );
  };

  renderCards();

  root.append(
    el('div', { className: 'screen' }, [
      el('div', { className: 'panel' }, [
        el('div', { className: 'panel-head' }, [el('h2', { text: 'Магазин' }), balanceEl]),
        grid,
        el('div', { style: 'margin-top:16px' }, [
          el('button', {
            className: 'btn ghost',
            text: '← Назад',
            onClick: () => go('menu'),
          }),
        ]),
      ]),
    ]),
  );
}
