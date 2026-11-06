# Косари — сайт с двумя играми (Phaser 3 + Vite)

| Страница | Игра | Код | Ассеты |
|----------|------|-----|--------|
| `/` | стартовая страница, выбор игры | `index.html` | — |
| `/classic/` | **Kosari Classic** — порт оригинальной Косари v3.0 (Game Maker 8, 2011) | `src/classic/` | `public/classic/assets/` |
| `/remake/` | **Kosari Remake** — новый beat'em up: карты, волны врагов, фазы, позже сеть | `src/remake/` | `public/remake/assets/` |

Обе игры грузят ассеты относительными путями `assets/...`, поэтому каждая страница берёт их из своей папки (`/classic/assets`, `/remake/assets`). Это работает и локально, и на GitHub Pages под `/<repo>/`. Общий у игр только Phaser (один чанк в сборке); код игр между собой не пересекается.

## Запуск

```bash
cd web
npm install
npm run dev
```

- http://localhost:5173/ — выбор игры
- http://localhost:5173/classic/
- http://localhost:5173/remake/ (`?play=1` — сразу на арену)

`npm run build` собирает все три страницы в `dist/`. Деплой — `.github/workflows/deploy-pages.yml` при пуше в `main`.

## Скрипты

- `npm run copy-assets` — копирует спрайты/фоны/звуки из `../kosari_src` (декомпилированный GM-проект) в `public/classic/assets`.
- `scripts/*.py` — подготовка ассетов Remake (мир, части персонажей, анимации падения) → `public/remake/assets`.

## Classic: управление

| Клавиша | Действие |
|---------|----------|
| ← → | Ходьба |
| ↑ | Прыжок (двойной) |
| Z / X | Удар (без оружия) |
| 0–4 | Кулаки / DE / Shotgun / AK / RPG |
| A | Стрелять |
| S | Граната |
| M | Музыка |
| P | Пауза |
| Esc | Меню |

Порядок экранов в оригинале (комнаты GM): danger → 1 → 2 → 3 (интро) → menu → loading → play → credits / shop / autors_r.

## Remake: управление

WASD — ход, J/K/L/U/I/O — удары, B — магазин в сессии, 1–6 — покупки, M — музыка, P — пауза, Esc — меню (подробности в `src/remake/objects/Player.js`).
