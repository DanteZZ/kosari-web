/**
 * Player profile kept between sessions (the fight itself lives in sim/World):
 * settings, the chosen hero and story progress. Saved to localStorage on every
 * change (autosave): finishing a map unlocks the next one and remembers where
 * to continue.
 */
export const GameState = {
  /** Music on/off (old toggle; volumes below are the real mix). */
  musicPlay: true,
  /** Selected hero id (game/heroes.js). */
  hero: 'pocik',
  /** The hero the player picked in the menu (a ?hero= link only overrides `hero` for this run). */
  savedHero: 'pocik',
  settings: {
    music: 0.7,
    sfx: 0.9,
    voice: 1,
    /** Screen shake on hits. */
    shake: true,
    /** On-screen joystick: 'auto' (phones / tablets), 'on', 'off'. */
    touch: 'auto',
  },
  progress: {
    /** Story maps finished, by id. */
    done: [],
    /** Story maps the player may start (the first one always). */
    unlocked: ['forest'],
    /** Where «Продолжить» goes. */
    last: null,
    /** Bosses beaten (gallery portraits). */
    bosses: [],
    /** Косари carried out of finished maps — spent on upgrades in the menu. */
    bank: 0,
    /** Upgrade levels (0–3): see UPGRADES. */
    upgrades: { hp: 0, dmg: 0, speed: 0 },
    /** Challenges met, by map id. */
    challenges: {},
    /** Story choices: flags the scenes set (story/scenes.js), the journal, the finale. */
    story: { flags: {}, log: [], finale: null },
  },
};

const SAVE_KEY = 'kosari_remake_settings_v1';

/** «Театр» keeps the real story aside: its choices live in memory only. */
let heldStory = null;

export const SaveLoad = {
  save() {
    if (heldStory) return;
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ musicPlay: GameState.musicPlay, hero: GameState.savedHero, settings: GameState.settings, progress: GameState.progress }),
      );
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
      if (typeof data.hero === 'string') GameState.hero = GameState.savedHero = data.hero;
      if (data.settings) Object.assign(GameState.settings, data.settings);
      if (data.progress) Object.assign(GameState.progress, data.progress);
      const st = GameState.progress.story;
      GameState.progress.story = { flags: { ...(st?.flags || {}) }, log: [...(st?.log || [])], finale: st?.finale || null };
      // The story is one road now: forks from older saves are forgotten
      delete GameState.progress.routeNext;
      return true;
    } catch (_) {
      return false;
    }
  },
  /** Start the story over (settings and hero stay). */
  reset() {
    GameState.progress = { done: [], unlocked: ['forest'], last: null, bosses: [], bank: 0, upgrades: { hp: 0, dmg: 0, speed: 0 }, challenges: {}, story: { flags: {}, log: [], finale: null } };
    SaveLoad.save();
  },
};

/** The player picks a hero (menu): used now and remembered. */
export function chooseHero(id) {
  GameState.hero = GameState.savedHero = id;
  SaveLoad.save();
}

/** Volume of a sound kind ('music' | 'sfx' | 'voice'), 0..1. */
export function volume(kind) {
  if (kind === 'music' && !GameState.musicPlay) return 0;
  return GameState.settings[kind] ?? 1;
}

/** Story progress: a map was started (Продолжить goes back to it). */
export function markStarted(mapId) {
  const p = GameState.progress;
  if (!p.unlocked.includes(mapId)) p.unlocked.push(mapId);
  p.last = mapId;
  SaveLoad.save();
}

/** Story progress: a map was finished — the next one opens. */
export function markDone(mapId, nextId, bossKinds = []) {
  const p = GameState.progress;
  if (!p.done.includes(mapId)) p.done.push(mapId);
  if (nextId && !p.unlocked.includes(nextId)) p.unlocked.push(nextId);
  for (const b of bossKinds) if (!p.bosses.includes(b)) p.bosses.push(b);
  p.last = nextId || mapId;
  SaveLoad.save();
}

/** Permanent upgrades bought with banked косари (menu → Прокачка). */
export const UPGRADES = {
  hp: { title: 'Здоровье', sub: '+60 к максимуму', prices: [20, 45, 80] },
  dmg: { title: 'Сила', sub: '+12% урона', prices: [25, 55, 95] },
  speed: { title: 'Скорость', sub: '+6% к бегу', prices: [15, 35, 60] },
};

export function upgradeLevel(id) {
  return GameState.progress.upgrades?.[id] || 0;
}

/** Buy the next level of an upgrade. Returns true on success. */
export function buyUpgrade(id) {
  const p = GameState.progress;
  p.upgrades = p.upgrades || { hp: 0, dmg: 0, speed: 0 };
  const lvl = p.upgrades[id] || 0;
  const price = UPGRADES[id].prices[lvl];
  if (price == null || (p.bank || 0) < price) return false;
  p.bank -= price;
  p.upgrades[id] = lvl + 1;
  SaveLoad.save();
  return true;
}

/** A finished map's косари go to the bank; challenges met are remembered. */
export function bankRun(mapId, money, challenges = []) {
  const p = GameState.progress;
  p.bank = (p.bank || 0) + Math.max(0, money | 0);
  p.challenges = p.challenges || {};
  const had = new Set(p.challenges[mapId] || []);
  for (const c of challenges) had.add(c);
  p.challenges[mapId] = [...had];
  SaveLoad.save();
}

/** Story flags set by the scenes' choices (persist for the whole story). */
export function storyFlag(name) {
  return !!GameState.progress.story?.flags?.[name];
}

export function setStoryFlag(name, on = true) {
  const p = GameState.progress;
  p.story = p.story || { flags: {}, log: [], finale: null };
  p.story.flags[name] = on;
  SaveLoad.save();
}

/** The journal (menu → ДНЕВНИК): what the hero decided, chapter by chapter. One entry per map and line. */
export function logStory(mapId, text) {
  if (!text) return;
  const p = GameState.progress;
  p.story = p.story || { flags: {}, log: [], finale: null };
  p.story.log = p.story.log.filter((e) => !(e.map === mapId && e.text === text));
  p.story.log.push({ map: mapId || '', text });
  SaveLoad.save();
}

/** «Театр» starts (fresh = from its first map): the saved story is set aside, saving stops. */
export function beginTheatreStory(fresh) {
  const p = GameState.progress;
  if (!heldStory) heldStory = { story: p.story, progress: JSON.stringify(p) };
  if (fresh) p.story = { flags: {}, log: [], finale: null };
}

/** «Театр» is over: the real progress comes back. */
export function endTheatreStory() {
  if (!heldStory) return;
  GameState.progress = JSON.parse(heldStory.progress);
  GameState.progress.story = heldStory.story;
  heldStory = null;
}

export function setFinale(id) {
  const p = GameState.progress;
  p.story = p.story || { flags: {}, log: [], finale: null };
  p.story.finale = id;
  SaveLoad.save();
}

/** Phones and tablets get the on-screen joystick (unless the settings say otherwise). */
export function isTouchDevice() {
  const s = GameState.settings.touch;
  if (s === 'on') return true;
  if (s === 'off') return false;
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent || '');
}
