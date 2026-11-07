/**
 * Player settings kept between sessions (the fight itself lives in sim/World).
 * Only the music toggle for now.
 */
export const GameState = {
  musicPlay: true,
  /** Selected hero id (game/heroes.js). */
  hero: 'pocik',
};

const SAVE_KEY = 'kosari_remake_settings_v1';

export const SaveLoad = {
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ musicPlay: GameState.musicPlay, hero: GameState.hero }));
    } catch (_) {
      /* private mode */
    }
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      GameState.musicPlay = data.musicPlay !== false;
      if (typeof data.hero === 'string') GameState.hero = data.hero;
      return true;
    } catch (_) {
      return false;
    }
  },
};
