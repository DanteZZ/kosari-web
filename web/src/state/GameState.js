/** Persistent state across rooms — mirrors GM globals. */
export const GameState = {
  score: 0,
  lives: 3,
  health: 100,
  moneyScore: 0,
  livesDoubler: 0,
  musicPlay: true,

  weaponChoose: 0, // 0 fists, 1 DE, 2 shotgun, 3 ak, 4 rpg
  deserteagle: 0,
  deserteaglebullets: 0,
  shotgunbought: 0,
  shotgunbullets: 0,
  ak47bought: 0,
  ak47bullets: 0,
  rpg7bought: 0,
  rpg7bullets: 0,
  grenades: 0,

  // persisted between sessions via save/load
  toSave() {
    return {
      score: this.score,
      lives: this.lives,
      health: this.health,
      moneyScore: this.moneyScore,
      livesDoubler: this.livesDoubler,
      weaponChoose: this.weaponChoose,
      deserteagle: this.deserteagle,
      deserteaglebullets: this.deserteaglebullets,
      shotgunbought: this.shotgunbought,
      shotgunbullets: this.shotgunbullets,
      ak47bought: this.ak47bought,
      ak47bullets: this.ak47bullets,
      rpg7bought: this.rpg7bought,
      rpg7bullets: this.rpg7bullets,
      grenades: this.grenades,
    };
  },

  fromSave(data) {
    if (!data || typeof data !== 'object') return false;
    Object.assign(this, data);
    return true;
  },

  resetRun() {
    this.score = 0;
    this.lives = 3;
    this.health = 100;
    this.moneyScore = 0;
    this.livesDoubler = 0;
    this.weaponChoose = 0;
    // keep purchased weapons across "new game"? Original new_game resets via room —
    // weapons are global and persist via save; fresh install starts at 0.
  },

  softResetWeaponsForNewGame() {
    // keep unlocks; only clear run stats (matches typical arcade + shop flow)
  },
};

const SAVE_KEY = 'kosari_save_v1';

export const SaveLoad = {
  save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(GameState.toSave()));
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      return GameState.fromSave(JSON.parse(raw));
    } catch {
      return false;
    }
  },
  exists() {
    return !!localStorage.getItem(SAVE_KEY);
  },
};
