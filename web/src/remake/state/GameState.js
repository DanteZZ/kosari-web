/** Session + save state. Score ≠ shop money. Designed for future multiplayer (localPlayerId). */
export const GameState = {
  /** Local seat for future multiplayer — always 0 in solo. */
  localPlayerId: 0,

  score: 0,
  lives: 3,
  health: 100,
  /** Session shop currency (loot only). */
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

  /** Furthest X reached this run (difficulty). */
  maxXReached: 0,

  get money() {
    return this.moneyScore;
  },
  set money(v) {
    this.moneyScore = v;
  },

  ownsWeapon(id) {
    if (id === 0) return true;
    if (id === 1) return !!this.deserteagle;
    if (id === 2) return !!this.shotgunbought;
    if (id === 3) return !!this.ak47bought;
    if (id === 4) return !!this.rpg7bought;
    return false;
  },

  ammoFor(id) {
    if (id === 1) return this.deserteaglebullets;
    if (id === 2) return this.shotgunbullets;
    if (id === 3) return this.ak47bullets;
    if (id === 4) return this.rpg7bullets;
    return 0;
  },

  /** Owned guns in slot order (excludes fists). */
  ownedWeaponIds() {
    const ids = [];
    if (this.deserteagle) ids.push(1);
    if (this.shotgunbought) ids.push(2);
    if (this.ak47bought) ids.push(3);
    if (this.rpg7bought) ids.push(4);
    return ids;
  },

  toSave() {
    return {
      // Meta only — no run weapons/money (session economy)
      musicPlay: this.musicPlay,
    };
  },

  fromSave(data) {
    if (!data || typeof data !== 'object') return false;
    this.musicPlay = data.musicPlay !== false;
    return true;
  },

  /** Unlock all guns + ammo for visual/combat testing. */
  unlockAllWeaponsForTest() {
    this.deserteagle = 1;
    this.shotgunbought = 1;
    this.ak47bought = 1;
    this.rpg7bought = 1;
    this.deserteaglebullets = 999;
    this.shotgunbullets = 999;
    this.ak47bullets = 999;
    this.rpg7bullets = 99;
    this.grenades = 20;
  },

  clearLoadout() {
    this.weaponChoose = 0;
    this.deserteagle = 0;
    this.deserteaglebullets = 0;
    this.shotgunbought = 0;
    this.shotgunbullets = 0;
    this.ak47bought = 0;
    this.ak47bullets = 0;
    this.rpg7bought = 0;
    this.rpg7bullets = 0;
    this.grenades = 0;
  },

  /** Start a fresh combat session (fists only, empty wallet). */
  resetRun() {
    this.score = 0;
    this.lives = 3;
    this.health = 100;
    this.livesDoubler = 0;
    this.moneyScore = 0;
    this.maxXReached = 0;
    this.clearLoadout();
  },

  /** Score only — does not grant shop money. */
  addScore(n) {
    this.score += n;
  },

  addMoney(n) {
    this.moneyScore = Math.max(0, this.moneyScore + n);
  },
};

const SAVE_KEY = 'kosari_remake_save_v2';

if (typeof window !== 'undefined') window.__KosariState = GameState;

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

/** Session shop catalog — buy = unlock + ammo pack; repurchase = ammo only. */
export const SESSION_SHOP = [
  {
    id: 1,
    title: 'Desert Eagle',
    desc: 'Пистолет · +30 патронов',
    price: 15000,
    ammo: 30,
    flag: 'deserteagle',
    ammoKey: 'deserteaglebullets',
  },
  {
    id: 2,
    title: 'Дробовик',
    desc: 'Близкий бой · +16',
    price: 35000,
    ammo: 16,
    flag: 'shotgunbought',
    ammoKey: 'shotgunbullets',
  },
  {
    id: 3,
    title: 'АК-47',
    desc: 'Автомат · +60',
    price: 55000,
    ammo: 60,
    flag: 'ak47bought',
    ammoKey: 'ak47bullets',
  },
  {
    id: 4,
    title: 'РПГ-7',
    desc: 'Ракеты · +3',
    price: 90000,
    ammo: 3,
    flag: 'rpg7bought',
    ammoKey: 'rpg7bullets',
  },
  {
    id: 'grenades',
    title: 'Гранаты',
    desc: '+3 гранаты',
    price: 20000,
    buy: () => {
      GameState.grenades += 3;
    },
  },
  {
    id: 'medkit',
    title: 'Аптечка',
    desc: 'HP → 100',
    price: 8000,
    buy: () => {
      GameState.health = 100;
    },
  },
];

export function buySessionItem(item) {
  if (!item || GameState.moneyScore < item.price) return false;
  GameState.moneyScore -= item.price;
  if (typeof item.buy === 'function') {
    item.buy();
    return true;
  }
  if (item.flag && item.ammoKey) {
    GameState[item.flag] = 1;
    GameState[item.ammoKey] += item.ammo;
    GameState.weaponChoose = item.id;
    return true;
  }
  return false;
}
