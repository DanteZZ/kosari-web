/**
 * Character voice lines (cut from the originals, scripts/voice_lines.py).
 *
 * Rules against a mess of voices:
 *   - one line at a time; a more important one (death, boss intro) may cut
 *     the current line, an equal or less important one is simply skipped;
 *   - a pause after every line before the next one may start;
 *   - each character has its own cooldown, and most events only speak
 *     sometimes (CHANCE), so the same joke is not heard every hit.
 */
import VOICES from './voices.gen.json';
import { VARIANTS } from './FighterView.js';
import { getHero } from '../game/heroes.js';

export const voiceKey = (char, ev, i) => `v_${char}_${ev}_${i}`;

/** Load every clip (Preload). */
export function preloadVoices(scene) {
  for (const [char, evs] of Object.entries(VOICES)) {
    for (const [ev, n] of Object.entries(evs)) {
      for (let i = 0; i < n; i += 1) scene.load.audio(voiceKey(char, ev, i), `assets/voice/chars/${char}/${ev}_${i}.mp3`);
    }
  }
}

/** Voice id of a sim fighter (null: silent). */
export function voiceOf(f) {
  if (!f) return null;
  if (f.kind === 'player') {
    const id = getHero(f.hero).id;
    return VOICES[id] ? id : null;
  }
  if (VOICES[f.kind]) return f.kind;
  const skin = VARIANTS[f.kind]?.skin;
  return skin && VOICES[skin] ? skin : null;
}

export function hasBlips(char) {
  return !!VOICES[char]?.blip;
}

const PRIORITY = { pickup: 1, attack: 1, hurt: 2, spawn: 3, down: 3, special: 4, intro: 5, death: 5 };
/** Chance an event speaks: [enemy / boss, hero]. */
const CHANCE = {
  attack: [0.14, 0.12],
  hurt: [0.18, 0.25],
  down: [0.55, 0.6],
  spawn: [0.35, 1],
  pickup: [0, 0.12],
  special: [1, 1],
  death: [0.6, 1],
  intro: [1, 1],
};
/** Characters that talk more often on some events. */
const LOUD = { kama: { attack: 0.3 } };
/** Seconds the same character keeps quiet after speaking. */
const CHAR_CD = 5;
/** Seconds of silence after any line. */
const GAP = 0.7;

export class Voices {
  constructor(scene) {
    this.scene = scene;
    this.current = null;
    this.prio = 0;
    this.quietUntil = 0;
    this.charCd = new Map();
    this.last = new Map();
    this.volume = 0.95;
  }

  now() {
    return this.scene.time.now / 1000;
  }

  /**
   * Try to say a line. `opts.hero` picks the hero chance, `opts.force` skips
   * the chance roll (still respects priorities). Returns true if it plays.
   */
  say(char, ev, { hero = false, force = false, chance = null } = {}) {
    const n = VOICES[char]?.[ev] || (ev === 'down' ? VOICES[char]?.hurt : 0);
    const evName = VOICES[char]?.[ev] ? ev : ev === 'down' ? 'hurt' : ev;
    if (!char || !n) return false;
    const pr = PRIORITY[ev] ?? 1;
    const t = this.now();
    const playing = this.current?.isPlaying;
    if (playing && pr <= this.prio) return false;
    if (!playing && t < this.quietUntil && pr < 4) return false;
    if (pr < 4 && t < (this.charCd.get(char) || 0)) return false;
    const p = chance ?? (LOUD[char]?.[ev] || CHANCE[ev]?.[hero ? 1 : 0]) ?? 0.2;
    if (!force && Math.random() > p) return false;
    // Different clip than last time for this event
    const lk = `${char}:${evName}`;
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === this.last.get(lk)) i = (i + 1) % n;
    this.last.set(lk, i);
    const key = voiceKey(char, evName, i);
    if (!this.scene.cache.audio.exists(key)) return false;
    if (playing) this.current.stop();
    const snd = this.scene.sound.add(key, { volume: this.volume });
    snd.once('complete', () => {
      this.quietUntil = this.now() + GAP;
      snd.destroy();
    });
    snd.play();
    this.current = snd;
    this.prio = pr;
    this.charCd.set(char, t + CHAR_CD);
    return true;
  }

  /** Short syllable for one typed dialogue letter. */
  blip(char) {
    const n = VOICES[char]?.blip;
    if (!n) return false;
    const key = voiceKey(char, 'blip', Math.floor(Math.random() * n));
    if (!this.scene.cache.audio.exists(key)) return false;
    this.scene.sound.play(key, { volume: 0.5, rate: 0.95 + Math.random() * 0.15 });
    return true;
  }

  stop() {
    this.current?.stop();
    this.current = null;
    this.prio = 0;
  }
}
