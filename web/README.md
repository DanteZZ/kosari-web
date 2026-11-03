# Косари v3.0 — веб-порт (Phaser 3)

## Запуск

```bash
cd web
npm install
npm run copy-assets   # при необходимости
npm run dev
```

Откройте URL Vite (обычно http://localhost:5173 или 5174).

## Управление

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

## Flow

Menu → Danger → Loading → Play → (смерть) Highscore → Credits/Dance → Menu

Магазин, авторы, save/load (L / кнопки), рекорды (R).

## Что портировано

- Экран смерти как в оригинале (hulitakmalo → highscore → credits/dance)
- Косари, пачки, наковальни, Никита/Буйный, боссы
- Оружие + магазин (цены moneyscore)
- Rain / thunder / дирижабль
- localStorage highscores + save/load
