import { volume } from '../state/GameState.js';
import { FIGHTERS } from '../sim/fighters.js';

/**
 * Background music by situation (assets/music/<slot>.mp3, streamed — never
 * preloaded). Each frame the scene asks `pick()` what should be playing:
 *
 *   QTE → minigame / race / raft / lift / trap prep / hold-out / chase
 *       → boss (by phase) → a newly met meme enemy → the arena's own track
 *       → the chapter theme
 *
 * A change cross-fades. Boss tracks can be cut into phases: a phase is a
 * slot plus an optional [from, to] loop window inside the file (1Kla$'s
 * 12-minute mashup holds three phases).
 */

const DIR = 'assets/music/';
const BASE_VOL = 0.55;
const FADE_MS = 700;

/** Chapter theme per map (bossrush maps use their base map). */
const CHAPTER = {
  forest: 'ch_forest',
  opushka: 'ch_opushka',
  village: 'ch_village',
  dacha: 'ch_dacha',
  panelki: 'ch_panelki',
  pc_club: 'ch_pc_club',
  gym: 'ch_gym',
  museum: 'ch_museum',
  river: 'ch_river',
  sigma_gym: 'ch_sigma_gym',
  stream_house: 'ch_stream_house',
  office: 'ch_office',
  concert: 'ch_concert',
  sandbox: 'ch_forest',
};

/** Arena-by-arena overrides (index → slot) where a map changes place. */
const ARENA = {
  opushka: ['ch_forest', null, 'ch_opushka', 'ch_shawarma'],
  dacha: [null, null, 'ch_cellar', 'ch_cellar'],
  village: [null, null, null, 'mi_village_finale'],
};

/** Meeting a meme enemy: his theme while he is alive. */
const ENEMY = {
  ded: 'en_ded',
  mongol: 'en_mongol',
  glad: 'en_glad',
  ruki: 'en_ruki',
  vertuha: 'en_vertuha',
  reka: 'en_reka',
  zubarev: 'en_zubarev',
  gitelman: 'en_gitelman',
};

/**
 * Boss phases: [{ below: hp fraction the phase starts under, slot, from?, to? }]
 * (first match from the end wins). `verse` = 1Kla$'s last verse.
 */
const BOSS = {
  borsch: [{ slot: 'bo_borsch' }],
  povar: [{ slot: 'bo_povar' }],
  pahom: [{ slot: 'bo_pahom' }],
  ponasenkov: [{ slot: 'ch_museum' }],
  papich: [{ slot: 'bo_papich' }, { below: 0.45, slot: 'bo_papich2' }],
  gigachad: [{ slot: 'bo_chad' }, { below: 0.5, slot: 'bo_chad2' }],
  klas: [
    { slot: 'bo_klas', from: 0, to: 310 },
    { below: 0.68, slot: 'bo_klas', from: 480, to: 705 },
    { below: 0.36, slot: 'bo_klas', from: 320, to: 470 },
    { verse: true, slot: 'bo_klas4' },
  ],
};

const key = (t) => (t ? `${t.slot}@${t.from ?? ''}-${t.to ?? ''}` : '');

export class MusicDirector {
  constructor(map) {
    this.map = map;
    this.base = map?.baseId || map?.id || 'sandbox';
    this.cur = null;
    this.audio = null;
    this.met = new Set();
    this.verse = false;
    this.paused = false;
  }

  /** Sim events that change the music (call for every event). */
  onEvent(ev) {
    if (ev.type === 'spawn' && ev.elite && ENEMY[ev.kind]) this.met.add(ev.id);
    if (ev.type === 'verse') this.verse = true;
  }

  /** What should be playing now. */
  pick(world, director) {
    if (world.qte) return { slot: 'mi_qte' };
    const m = world.mini;
    if (m && !m.done) {
      if (m.type === 'penalty') return { slot: 'mi_penalty' };
      if (m.type === 'bench') return { slot: m.cfg?.rap ? 'mi_rap' : 'mi_bench' };
      if (m.type === 'stealth') return { slot: 'mi_stealth' };
      if (m.type === 'trading') return { slot: 'mi_trading' };
    }
    if (world.race && !world.race.done) return { slot: 'mi_race' };
    if (world.raftBox) return { slot: 'mi_raft' };
    if (world.elevator) {
      const L = world.elevator;
      return { slot: L.floor >= L.floors ? 'mi_lift3' : L.floor <= 1 ? 'mi_lift1' : 'mi_lift2' };
    }
    if (world.torch && !world.torch.done) return { slot: 'ch_cellar' };
    if (world.td?.phase === 'prep') return { slot: 'mi_td' };
    const g = director?.goal;
    if (g && !g.done && g.type === 'survive') return { slot: 'mi_survive' };
    if (g && !g.done && g.type === 'chase') return { slot: 'mi_chase' };

    // Bosses (by phase)
    for (const f of world.fighters) {
      const phases = !f.dead && FIGHTERS[f.kind]?.boss && BOSS[f.kind];
      if (!phases) continue;
      if (this.verse && f.kind === 'klas') return phases.find((p) => p.verse);
      const k = f.hp / (f.maxHp || 1);
      let pick = phases[0];
      for (const p of phases) if (!p.verse && p.below != null && k < p.below) pick = p;
      return pick;
    }
    // A meme enemy met on this map
    for (const id of this.met) {
      const f = world.fighters.find((x) => x.id === id);
      if (f && !f.dead) return { slot: ENEMY[f.kind] };
      this.met.delete(id);
    }
    const ar = ARENA[this.base]?.[director?.idx ?? 0];
    return { slot: ar || CHAPTER[this.base] || 'ch_forest' };
  }

  _start(t) {
    const a = new Audio(DIR + t.slot + '.mp3');
    a.loop = t.to == null;
    a.volume = 0;
    a.preload = 'auto';
    if (t.from) {
      a.addEventListener('loadedmetadata', () => {
        a.currentTime = t.from;
      }, { once: true });
    }
    a.play().catch(() => {});
    return a;
  }

  _fadeOut(a) {
    if (!a) return;
    const v0 = a.volume;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / FADE_MS);
      a.volume = v0 * (1 - k);
      if (k < 1) requestAnimationFrame(step);
      else a.pause();
    };
    step();
  }

  /** Call every frame. */
  update(world, director) {
    if (this.paused || this.frozen) return;
    const want = this.pick(world, director);
    if (key(want) !== key(this.cur)) {
      // Same file, another window: jump instead of restarting the stream
      if (this.audio && this.cur && want.slot === this.cur.slot && want.from != null) {
        this.audio.currentTime = want.from;
        this.cur = want;
      } else {
        this._fadeOut(this.audio);
        this.cur = want;
        this.audio = this._start(want);
        this.fadeIn = performance.now();
      }
    }
    const a = this.audio;
    if (!a) return;
    const target = BASE_VOL * volume('music');
    const k = Math.min(1, (performance.now() - (this.fadeIn || 0)) / FADE_MS);
    a.volume = Math.max(0, Math.min(1, target * k));
    // Loop window inside a long file (boss phases)
    if (this.cur?.to != null && a.currentTime >= this.cur.to) a.currentTime = this.cur.from || 0;
  }

  /** A short one-shot (results jingle); the loop stops. */
  sting(slot) {
    this.stop();
    this.cur = { slot: `${slot}#sting` };
    const a = new Audio(DIR + slot + '.mp3');
    a.volume = BASE_VOL * volume('music');
    a.play().catch(() => {});
    this.audio = a;
    this.frozen = true;
  }

  setPaused(on) {
    this.paused = on;
    if (on) this.audio?.pause();
    else this.audio?.play().catch(() => {});
  }

  stop() {
    this._fadeOut(this.audio);
    this.audio = null;
    this.cur = null;
  }
}
