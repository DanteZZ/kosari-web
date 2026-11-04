/** Logical GM8 resolution — never change without retargeting assets. */
export const W = 640;
export const H = 480;
export const GROUND_Y = 464;

/** Menu: black stage + logo + 2-column button grid (buttons are 320×32). */
export const menu = {
  logo: { x: W / 2, y: 36 },
  /** Left: play / records / authors. Right: shop / load / save. */
  colLeft: 0,
  colRight: 320,
  row0: 248,
  rowGap: 36,
  /** Exit sprite is full-width 640×32. */
  exit: { x: 0, y: 372 },
  hints: [
    { x: 12, y: 412, text: 'Enter — игра · L — загрузка · R — рекорды · Esc выход' },
    { x: 12, y: 432, text: '← → ходить · ↑ прыжок · Z/X удар · 0–4 оружие · A стрелять · S граната' },
  ],
  copyright: {
    x: W / 2,
    y: 462,
    text: 'TM AND © 2011 TRUBAKOFF INDUSTRY CO., LTD',
  },
};

/** Play HUD anchors. */
export const hud = {
  score: { x: 72, y: 3 },
  healthBar: { x: 0, y: 25, w: 69, h: 5 },
  ammo: { x: 420, y: 8 },
  boss: { x: 200, y: 40 },
  pause: { x: W / 2, y: 220 },
  livesStartX: 4,
  livesY: 4,
};

/** Parallax layer placement and scroll rates (px per frame at base speed). */
export const parallax = {
  sky: { y: 0, h: 160, rate: 0.25 },
  mid: { y: 80, h: 280, rate: 0.55 },
  near: { y: 160, h: 320, rate: 1.1 },
  hazeAlpha: 0.14,
};
