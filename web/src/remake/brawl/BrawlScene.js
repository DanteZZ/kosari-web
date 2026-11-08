import Phaser from 'phaser';
import { GameState, SaveLoad, volume, markStarted, markDone, isTouchDevice, bankRun, chooseRoute } from '../state/GameState.js';
import { readPad, pressKey } from './gamepad.js';
import { TouchControls } from '../ui/TouchControls.js';
import { VIEW_W, VIEW_H } from '../game/constants.js';
import { WORLD_GEOM } from './world/ForestWorld.js';
import { ThemeWorld } from './world/ThemeWorld.js';
import { getHero } from '../game/heroes.js';
import { Cinema } from './Cinema.js';
import { INTRO, BOSSES, HERO_VOICE } from './dialogue.js';
import { Voices, voiceOf, hasBlips } from './Voices.js';
import { VARIANTS } from './FighterView.js';
import { enemyPartTextureKey } from '../game/enemies/parts.js';
import { FIGHTERS } from '../sim/fighters.js';
import { World } from '../sim/World.js';
import { SandboxDirector } from '../sim/sandbox.js';
import { MapDirector } from '../sim/director.js';
import { MAPS, DEFAULT_MAP } from '../maps/index.js';
import { challengesFor } from '../maps/challenges.js';
import { saveBest } from '../ui/Menu.js';
import { DT, METER_MAX } from '../sim/constants.js';
import { MOVES } from '../sim/moves.js';
import { FighterView } from './FighterView.js';
import { CrateView } from './CrateView.js';
import { RaceView } from './RaceView.js';
import { PenaltyView } from './PenaltyView.js';
import { ModesView } from './ModesView.js';
import { MinisView } from './MinisView.js';
import { SetView } from './SetView.js';
import { FUSE_T } from '../sim/torch.js';
import { SpriteFighterView, SPRITE_KINDS } from './SpriteFighterView.js';
import { ROAD_Y } from './stage.js';
import { WEAPONS, WEAPON_SLOTS, SHOP, BUFFS, helpersFor, HELPER_NAME } from '../sim/items.js';
import { WEAPON_DEFS } from '../game/player/weapons.js';
import { KeyboardInput } from './keyboard.js';
import { stage, LANE_DEPTH } from './stage.js';

/** Original-game throwables: sprite key, animation, on-screen size, spin per frame. */
const ORIG_PROJ = {
  bomb: { key: 'boss_throw_0', anim: 'bomb_fuse', size: 48, spin: 4 },
  pot: { key: 'kastrule_0', anim: 'kastrule_spin', size: 92 },
  pan: { key: 'povar_skorovodka_0', anim: 'skovorodka_spin', size: 78, spin: 16 },
  fork: { key: 'povar_vilka_0', size: 130, angle: 180 },
  dirigbomb: { key: 'dirig_bomb_0', anim: 'dirig_bomb_fall', size: 64 },
  anvil: { key: 'nakovalna_0', size: 90, spin: 9 },
  // Meme-era bosses (assets/items, Cursor art)
  football: { key: 'item_football', size: 44, spin: 12 },
  jar: { key: 'item_jar', size: 52, spin: 7 },
  brick: { key: 'item_brick', size: 46, spin: 10 },
  donation_bomb: { key: 'item_donation_bomb', size: 54, spin: 4 },
  book: { key: 'item_book', size: 50, spin: 9 },
  stone: { key: 'item_stone', size: 40, spin: 8 },
  money_pack: { key: 'item_money_pack', size: 58, spin: 8 },
  coin: { key: 'item_coin', size: 44, spin: 10 },
  music_note: { key: 'item_music_note', size: 52 },
  shockwave: { key: 'item_shockwave', size: 190 },
  spear: { key: 'item_spear', size: 230 },
  microphone: { key: 'item_microphone', size: 74, spin: 9 },
  // Roadside traffic (traps): the art faces left
  car_lada: { key: 'item_car_lada', size: 280, faceLeft: true, ground: true },
};

/** Sizes for item art used as projectiles without an ORIG_PROJ entry. */
const PROJ_SIZE = { dumbbell: 70, river_log: 220, brick: 46 };

/** Pickup art by kind (food heals pick big or small by amount). */
const BUFF_ART = { speed: 'item_energy', power: 'item_protein', shield: 'item_sigma_glasses' };

/** Slight over-zoom so camera roll never shows the edges. */
const BASE_ZOOM = 1.015;
/** World px that must fit the screen height (fighters + road): short screens zoom out. */
const MIN_VIEW_H = 640;

const SANDBOX_LEN = 7200;
/** Never run more than this many sim ticks per frame (avoid spiral of death after a stall). */
const MAX_STEPS = 6;

/**
 * Brawl core view: fixed-tick sim + interpolated bone puppets on a lane with depth.
 * Plays a data-driven map (arenas + waves, ?map=forest) or the endless sandbox (?brawl=sandbox).
 */
export class BrawlScene extends Phaser.Scene {
  constructor() {
    super('Brawl');
  }

  init(data) {
    this.onExit = data?.onExit;
    // Test ground: start at a given arena; nothing is saved
    this.testArena = Number.isInteger(data?.arena) ? data.arena : null;
    const params = new URLSearchParams(window.location.search);
    const wanted = data?.map || params.get('map') || (params.get('brawl') === 'sandbox' ? 'sandbox' : DEFAULT_MAP);
    this.map = MAPS[wanted] || null;
  }

  create() {
    this.paused = false;
    this.acc = 0;
    this.views = new Map();
    this.camX = 0;
    this.shakeT = 0;
    this.fpsAvg = 60;

    this.setupCameras();

    this.worldLen = this.map ? this.map.length : SANDBOX_LEN;
    this.world = new World({
      seed: (Date.now() & 0xffffff) | 1,
      bounds: { xMin: 0, xMax: this.worldLen, zMin: 0, zMax: LANE_DEPTH },
    });
    const start = this.map?.start || { x: 420, z: LANE_DEPTH * 0.55 };
    this.player = this.world.spawn('player', start.x, Math.min(LANE_DEPTH, start.z), { slot: 0 });
    applyHero(this.player, GameState.hero);
    // Permanent upgrades from the menu
    const up = GameState.progress.upgrades || {};
    if (!this.map?.hidden) {
      this.player.maxHp += 60 * (up.hp || 0);
      this.player.hp = this.player.maxHp;
      this.player.dmgMul = (this.player.dmgMul || 1) * (1 + 0.12 * (up.dmg || 0));
      this.player.speedMul = (this.player.speedMul || 1) * (1 + 0.06 * (up.speed || 0));
    }
    // Memes beaten in earlier chapters can be called in from the shop
    this.world.helpers = helpersFor(GameState.progress.done || []);
    this.director = this.map ? new MapDirector(this.world, this.map) : new SandboxDirector(this.world);
    if (this.testArena != null && this.map?.arenas[this.testArena]) {
      // Polygon: straight to the arena, pockets full, every helper on call
      const a = this.map.arenas[this.testArena];
      this.director.idx = this.testArena;
      this.director.state = 'travel';
      this.director.box = null;
      this.world.playerBounds = null;
      this.player.x = this.player.px = a.left + 140;
      this.player.money = 200;
      this.world.helpers = helpersFor(['office', 'stream_house', 'village', 'panelki', 'pc_club', 'gym', 'museum', 'river']);
    }
    this.lock = null;
    this.finished = false;
    this.forest = new ThemeWorld(this, {
      map: this.map,
      length: this.worldLen,
      seed: this.map ? hashSeed(this.map.id) : 7,
      tagBg: (o) => this.tagBg(o),
    });
    this.startTick = 0;
    this.pickupViews = new Map();
    this.projViews = new Map();
    this.viewPool = new Map();
    this.airshipViews = new Map();
    this.markViews = new Map();
    this.immuneHintT = 0;
    this.shopOpen = false;
    this.keys = new KeyboardInput(this);

    this.camX = Math.max(0, this.player.x - VIEW_W * 0.4);
    this.camY = 0;
    this.swayT = 0;
    this.bobAmp = 0;
    this.kick = 0;
    this.kickV = 0;
    this.roll = 0;
    this.baseZoom = BASE_ZOOM;
    this.zoom = BASE_ZOOM;
    this.layoutCameras();
    this.camY = this.baseY;

    // Mix: music keys follow the music volume, everything else the sfx volume
    const MUSIC = new Set(['game', 'boss', 'credits']);
    const rawPlay = this.sound.play.bind(this.sound);
    this.sound.play = (key, cfg = {}) => rawPlay(key, { ...cfg, volume: (cfg.volume ?? 1) * volume(MUSIC.has(key) ? 'music' : 'sfx') });
    // Story progress: this map is where «Продолжить» goes now
    if (this.map && !this.map.hidden && this.map.id !== 'sandbox' && this.testArena == null) markStarted(this.map.id);

    this.fx = this.add.group();
    this.buildHud();
    this.cine = new Cinema(this);
    this.introduced = new Set();
    this.voices = new Voices(this);
    this.voices.volume = 0.95 * volume('voice');
    // Phones / tablets: on-screen joystick; a tap on the open screen = Enter
    this.touch = isTouchDevice() ? new TouchControls(document.getElementById('game-shell') || document.body) : null;
    if (this.touch) {
      this.input.on('pointerdown', () => {
        if (this.cine?.active || this.finished || this.paused) pressKey('Enter', 13);
      });
    }

    if (volume('music') > 0) {
      this.sound.stopAll();
      this.sound.play('game', { loop: true, volume: 0.4 });
    }

    const kb = this.input.keyboard;
    kb.on('keydown-P', () => this.togglePause());
    kb.on('keydown-ENTER', () => {
      if (this.finished) this.goNext(this.map?.route ? 0 : null);
      else this.togglePause();
    });
    // Fork in the road: 1 / 2 on the results screen
    kb.on('keydown-ONE', () => this.finished && this.map?.route && this.goNext(0));
    kb.on('keydown-TWO', () => this.finished && this.map?.route && this.goNext(1));
    kb.on('keydown-ESC', () => {
      if (this.shopOpen) {
        this.toggleShop(false);
        return;
      }
      this.sound.stopAll();
      this.onExit?.();
    });
    kb.on('keydown-B', () => this.toggleShop());
    kb.on('keydown-R', () => {
      if (this.player.dead) this.scene.restart();
    });

    this._onResize = () => {
      this.layoutCameras();
      this.layoutHud();
      this.cine?.layout();
    };
    this.game.events.on('remake-resize', this._onResize);
    this.events.once('shutdown', () => {
      this.game.events.off('remake-resize', this._onResize);
      this.sound.stopByKey('game');
      this.sound.stopByKey('boss');
      this.sound.stopByKey('dirigabb_sound');
      this.touch?.destroy();
      this.touch = null;
    });
    if (this.map) this.playIntro();
    else this.banner('Песочница', 'Иди вперёд →', 1800);

    window.__brawl = this;
  }

  /**
   * Three cameras: bg (forest + road, desaturated so fighters pop) → main
   * (fighters, FX, foreground) → ui (HUD, never zoomed/rolled).
   * Objects default to the main camera; tagBg / tagUi move them.
   */
  setupCameras() {
    const main = this.cameras.main;
    main.transparent = true;
    this.bgCam = this.cameras.add(0, 0, VIEW_W, VIEW_H, false, 'bg');
    this.uiCam = this.cameras.add(0, 0, VIEW_W, VIEW_H, false, 'ui');
    // Render order: bg first
    const list = this.cameras.cameras;
    list.splice(list.indexOf(this.bgCam), 1);
    list.unshift(this.bgCam);
    this.bgCam.setBackgroundColor('#a9c6d8');
    const grade = this.bgCam.postFX.addColorMatrix();
    grade.saturate(-0.45);
    grade.brightness(0.88, true);
    this.bgCam.postFX.addVignette(0.5, 0.5, 0.95, 0.35);
    this._worldMask = this.bgCam.id | this.uiCam.id;
    this.events.on('addedtoscene', (go) => {
      if (go.__camTag) return;
      go.cameraFilter = this._worldMask;
    });
  }

  tagBg(o) {
    o.__camTag = 'bg';
    o.cameraFilter = this.cameras.main.id | this.uiCam.id;
    // Containers check each child's camera filter too
    if (o.list) for (const c of o.list) this.tagBg(c);
    return o;
  }

  tagUi(o) {
    o.__camTag = 'ui';
    o.cameraFilter = this.cameras.main.id | this.bgCam.id;
    return o;
  }

  layoutCameras() {
    this.bgCam?.setSize(VIEW_W, VIEW_H);
    this.uiCam?.setSize(VIEW_W, VIEW_H);
    // Road bottom near the bottom of the screen; tall screens get more sky
    // Phones in landscape are short: zoom out so the fighters fit (zoom is around the screen centre)
    this.baseZoom = Math.min(BASE_ZOOM, VIEW_H / MIN_VIEW_H);
    const z = this.baseZoom;
    this.baseY = Math.max(-260, WORLD_GEOM.ROAD_BOTTOM + 70 - VIEW_H / 2 - VIEW_H / (2 * z));
    this.forest?.setBaseY(this.baseY, VIEW_W, VIEW_H);
  }

  /** Short zoom-in punch on big impacts. */
  punch(amount) {
    this.zoom = Math.max(this.zoom, this.baseZoom + amount);
  }

  togglePause() {
    // Enter / Space advance cutscene dialogue instead
    if (this.player.dead || this.finished || this.cine?.active) return;
    this.paused = !this.paused;
    this.game.events.emit('remake-pause', this.paused);
  }

  update(_time, delta) {
    const frameMs = Math.min(delta, 100);
    this.fpsAvg += (1000 / Math.max(1, delta) - this.fpsAvg) * 0.05;
    if (this.paused) return;

    // ---- Fixed-tick simulation (cutscenes can freeze it and take the controls)
    if (this.cine?.freeze) this.acc = 0;
    else this.acc += frameMs / 1000;
    let steps = 0;
    while (this.acc >= DT && steps < MAX_STEPS) {
      this.world.setInput(0, this.cine?.active ? 0 : this.keys.read() | readPad() | (this.touch?.read() || 0));
      this.world.viewW = VIEW_W / this.baseZoom;
      this.world.step();
      this.director.step();
      this.acc -= DT;
      steps += 1;
    }
    if (steps >= MAX_STEPS) this.acc = 0;
    if (steps > 0) {
      this.keys.consumed();
      this.touch?.consumed();
    }
    const alpha = this.acc / DT;
    const frozen = this.world.hitstop > 0;

    this.drainEvents();

    // ---- Views follow sim fighters
    const alive = new Set();
    for (const f of this.world.fighters) {
      alive.add(f.id);
      let v = this.views.get(f.id);
      if (!v) {
        const pool = f.team === 'ally' ? null : this.viewPool.get(f.kind);
        if (pool?.length) {
          v = pool.pop();
          v.reset(f);
        } else {
          v =
            f.kind === 'crate' || f.kind === 'anvil' || f.kind === 'objective' || f.kind === 'target_cam' || f.kind === 'entry'
              ? new CrateView(this, f)
              : SPRITE_KINDS.has(f.kind)
                ? new SpriteFighterView(this, f)
                : new FighterView(this, f);
        }
        this.views.set(f.id, v);
      }
      const slowK = this.world.slowmo > 0 && f.team !== 'player' ? 0.5 : 1;
      v.render(f, frozen ? 1 : alpha, frozen ? 0 : (frameMs / 1000) * slowK, frameMs);
    }
    for (const [id, v] of this.views) {
      if (!alive.has(id)) {
        // Keep puppets around for the next wave instead of rebuilding them
        if (v.park && v.kind && v.kind !== 'player' && !v.ally) {
          v.park();
          if (!this.viewPool.has(v.kind)) this.viewPool.set(v.kind, []);
          this.viewPool.get(v.kind).push(v);
        } else {
          v.destroy();
        }
        this.views.delete(id);
      }
    }
    this.renderPickups(alpha);
    this.renderProjectiles(alpha);
    if (!this.raceView) this.raceView = new RaceView(this, this.heroSpeaker().face);
    this.raceView.render(this.world, alpha);
    if (!this.modesView) this.modesView = new ModesView(this);
    this.modesView.render(this.world);
    if (!this.setView) this.setView = new SetView(this);
    this.setView.render(this.world);
    if (!this.minisView) this.minisView = new MinisView(this);
    this.minisView.render(this.world);
    if (this.world.mini || this.penaltyView) {
      if (!this.penaltyView) this.penaltyView = new PenaltyView(this);
      this.penaltyView.render(this.world, alpha);
    }
    this.renderAirships(alpha);

    this.updateCamera(frameMs / 1000, alpha);
    this.updateHud();
    this.updateDark();
    if (this.verseEnd) {
      if (!this.verseText) {
        this.verseText = this.tagUi(this.add.text(VIEW_W / 2, 92, '', { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '26px', color: '#ffd23f', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5, 0).setDepth(2000));
      }
      const boss = this.world.fighters.find((f) => f.kind === 'klas' && !f.dead);
      const left = Math.max(0, Math.ceil((this.verseEnd - this.time.now) / 1000));
      this.verseText.setVisible(!!boss && !boss.dead).setPosition(VIEW_W / 2, 92).setText(`Трек кончится через ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
      if (!boss || boss.dead) this.verseEnd = 0;
    }
    // Perfect-dodge slow motion tint
    const slowA = this.world.slowmo > 0 ? Math.min(0.16, this.world.slowmo / 60) : 0;
    this.slowOverlay.setAlpha(this.slowOverlay.alpha + (slowA - this.slowOverlay.alpha) * 0.2);
  }

  updateCamera(dt, alpha) {
    const p = this.player;
    const px = p.px + (p.x - p.px) * alpha;
    const lead = p.facing * VIEW_W * 0.1;
    // Locked arena: camera stays inside it (centred if the screen is wider than the arena)
    let lo = this.world.playerBounds?.xMin ?? 0;
    let hi = this.worldLen;
    if (this.lock) {
      lo = this.lock.left;
      hi = this.lock.right;
    }
    let target;
    if (hi - lo <= VIEW_W) target = (lo + hi) / 2 - VIEW_W / 2;
    else target = Phaser.Math.Clamp(px - VIEW_W * 0.5 + lead, Math.max(0, lo - 60), hi - VIEW_W + 60);
    target = Phaser.Math.Clamp(target, 0, Math.max(0, this.worldLen - VIEW_W));
    const cc = this.cine?.camera();
    if (cc) {
      // Zoom is around the screen centre: keep the visible edges inside the world
      const m = (VIEW_W / 2) * (1 - 1 / cc.zoom);
      target = Phaser.Math.Clamp(cc.x, -m, Math.max(-m, this.worldLen - VIEW_W + m));
    }
    this.camX += (target - this.camX) * (1 - Math.exp(-dt * (cc ? cc.speed : 6)));

    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt * 1000;
      const amp = this.shakeAmp * Math.max(0, this.shakeT / this.shakeDur);
      sx = (Math.random() * 2 - 1) * amp;
      sy = (Math.random() * 2 - 1) * amp;
    }
    // ---- Vertical: follow jumps a little, tilt with lane depth
    const py = p.py + (p.y - p.py) * alpha;
    const pz = p.pz + (p.z - p.pz) * alpha;
    let targetY = this.baseY - py * 0.35 + (pz - LANE_DEPTH / 2) * 0.22;
    if (cc) targetY = Math.min(this.baseY + 120, cc.y);
    this.camY += (targetY - this.camY) * (1 - Math.exp(-dt * (cc ? cc.speed : 5)));

    // ---- Sway: breathing + run bob + landing spring + roll lean + zoom punch
    this.swayT += dt;
    const moving = p.state === 'walk' || p.state === 'dash';
    this.bobAmp += ((moving ? 1 : 0) - this.bobAmp) * (1 - Math.exp(-dt * 6));
    const bob =
      Math.sin(this.swayT * Math.PI * 2 * 2.4) * 2.4 * this.bobAmp +
      Math.sin(this.swayT * 0.8) * 1.6 +
      Math.sin(this.swayT * 0.37) * 1.1;
    this.kickV += (-this.kick * 160 - this.kickV * 14) * dt;
    this.kick += this.kickV * dt;
    const vx = (p.x - p.px) * 60;
    const lean = Phaser.Math.Clamp(-vx * 0.000035, -0.01, 0.01) + Math.sin(this.swayT * 0.5) * 0.0015;
    this.roll += (lean - this.roll) * (1 - Math.exp(-dt * 3));
    this.zoom += ((cc ? cc.zoom * (this.baseZoom / BASE_ZOOM) : this.baseZoom) - this.zoom) * (1 - Math.exp(-dt * (cc ? cc.speed : 7)));

    for (const cam of [this.cameras.main, this.bgCam]) {
      cam.setScroll(Math.round(this.camX + sx), Math.round(this.camY + bob + this.kick + sy));
      cam.setZoom(this.zoom);
      cam.setRotation(this.roll);
    }
    this.forest?.update?.(this.camX);
  }

  // ------------------------------------------------------------------ cutscenes

  heroSpeaker() {
    const h = getHero(GameState.hero);
    return {
      name: h.label,
      face: h.skin ? enemyPartTextureKey(h.skin, 'head') : 'player_head',
      color: '#8fe3ff',
      ...(HERO_VOICE[h.id] || HERO_VOICE.pocik),
      voice: hasBlips(h.id) ? h.id : null,
    };
  }

  bossSpeaker(kind) {
    const skin = VARIANTS[kind]?.skin || (kind === 'borsch' ? 'boss1' : kind);
    return {
      name: FIGHTERS[kind]?.title || kind,
      face: enemyPartTextureKey(skin, 'head'),
      flip: true,
      color: '#ffd23f',
      ...(BOSSES[kind]?.voice || {}),
      voice: hasBlips(kind) ? kind : hasBlips(skin) ? skin : null,
    };
  }

  /** Who says a line in an entry intro: the hero, the kiosk seller, or a meme by kind. */
  speakerOf(who) {
    if (who === 'hero') return this.heroSpeaker();
    if (who === 'seller') return { name: 'Продавщица', face: null, color: '#ffb0c8' };
    return this.bossSpeaker(who);
  }

  /** The hero used an entry (or the arena opened one by itself): play its lines, then the mode begins. */
  playEntry() {
    const a = this.map?.arenas?.[this.director.idx];
    const lines = a?.entry?.intro || [];
    const go = () => {
      if (this.world.entry) this.world.entry.go = true;
    };
    if (!lines.length) return go();
    this.cine
      .play(async (c) => {
        const f = this.focusOf(this.player);
        const ex = this.world.entry?.x ?? this.player.x;
        await c.camTo((f.x + ex) / 2, f.y, 1.25, 550);
        for (const [who, text] of lines) await c.say(this.speakerOf(who), text);
        c.hideBox();
      })
      .then(go);
  }

  /** Cinematic close-up that does not take the controls (rap verses, QTE). */
  focusOn(x, y, zoom = 1.35, speed = 3) {
    this.cine.cam = { x, y, zoom, speed };
    if (!this.cineBars) {
      this.cineBars = true;
      this.cine._bars(1, 300);
    }
  }

  focusOff() {
    if (!this.cineBars && !this.cine.cam) return;
    if (!this.cine.active) this.cine.cam = null;
    this.cineBars = false;
    if (!this.cine.active) this.cine._bars(0, 300);
  }

  /** A minigame's result: a framed card in the middle of the screen. */
  resultCard(title, rows = [], good = true) {
    this.cardUi?.destroy();
    const W = 620;
    const H = 150 + rows.length * 38;
    const c = this.add.container(VIEW_W / 2, VIEW_H / 2 - 40).setDepth(9500);
    const col = good ? 0xffd23f : 0xff5a4a;
    const bg = this.add.rectangle(0, 0, W, H, 0x0b0b12, 0.9).setStrokeStyle(4, col, 1);
    const glow = this.add.rectangle(0, -H / 2 + 6, W - 8, 8, col, 0.8);
    const t = this.add
      .text(0, -H / 2 + 48, title, { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '46px', color: good ? '#ffd23f' : '#ff6a5a', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5);
    c.add([bg, glow, t]);
    rows.forEach((r, i) => {
      c.add(this.add.text(0, -H / 2 + 104 + i * 38, r, { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '24px', color: '#ffffff' }).setOrigin(0.5));
    });
    this.tagUi(c);
    for (const o of c.list) this.tagUi(o);
    c.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: c, alpha: 0, y: c.y - 30, delay: 2600, duration: 400, onComplete: () => c.destroy() });
    this.sound.play(good ? 'cash' : 'no_bulet', { volume: 0.45 });
    this.cardUi = c;
  }

  /** Little bounce on a fighter's puppet (rapping on the beat). */
  bounce(id) {
    const v = this.views.get(id);
    if (!v?.visual) return;
    this.tweens.killTweensOf(v.mount);
    v.mount.y = 0;
    this.tweens.add({ targets: v.mount, y: -18, duration: 90, yoyo: true, ease: 'Quad.Out' });
  }

  /** Point (world) a little above a fighter's feet. */
  focusOf(f) {
    return { x: f.x, y: stage.groundY(f.z) - 150 };
  }

  /** Map start: bars, a slow glide from ahead of the hero back to him, one line. */
  playIntro() {
    const lines = INTRO[this.map.id];
    const p = this.player;
    this.cine.play(async (c) => {
      const f = this.focusOf(p);
      c.camSnap(f.x + 520, f.y - 40, 1.05);
      await c.wait(150);
      this.banner(this.map.name, this.map.chapter || '', 2200);
      await c.camTo(f.x + 60, f.y, 1.22, 1700);
      for (const text of lines || []) await c.say(this.heroSpeaker(), text);
      c.hideBox();
      await c.camTo(f.x, f.y + 40, BASE_ZOOM, 300);
    });
  }

  /** Boss walks in, the world freezes, name card, then the exchange of lines. */
  playBossArrival(id, kind) {
    const data = BOSSES[kind];
    this.cine.play(
      async (c) => {
        const boss = () => this.world.fighters.find((x) => x.id === id) || null;
        const lockR = this.lock?.right ?? this.player.x + 600;
        const lockL = this.lock?.left ?? this.player.x - 600;
        const mid = (lockL + lockR) / 2;
        const fp = this.focusOf(this.player);
        // The sim already stood him in the middle of the arena, waiting
        await c.camTo(mid, fp.y, 1.15, 1100);
        c.setFreeze(true);
        const b = boss();
        if (b) await c.camTo(b.x, this.focusOf(b).y, 1.35, 450);
        const vb = b && voiceOf(b);
        if (vb && !this.voices.say(vb, 'intro', { force: true })) this.voices.say(vb, 'spawn', { force: true });
        await c.title(FIGHTERS[kind]?.title || '', this.map?.chapter || '', 1300);
        for (const [who, text] of data?.arrive || []) {
          const f = who === 'boss' ? boss() : this.player;
          if (f) await c.camTo(f.x, this.focusOf(f).y, 1.4, 260);
          await c.say(who === 'boss' ? this.bossSpeaker(kind) : this.heroSpeaker(), text);
        }
        c.hideBox();
        c.flash(0xffffff, 300, 0.5);
        this.sound.play('superudar', { volume: 0.4 });
        const bb = boss();
        if (bb) bb.waiting = false;
      },
      { freeze: false },
    );
  }

  /** Killing blow: stop-frame, white flash, snap zoom, slow fall, last words. */
  playFinisher(ev) {
    const kind = this.world.fighters.find((f) => f.id === ev.id)?.kind;
    const data = kind ? BOSSES[kind] : null;
    this.cine.play(
      async (c) => {
        const y = stage.groundY(ev.z) - 150;
        c.setFreeze(true);
        c.flash(0xffffff, 420, 1);
        c.impact(560);
        c.camSnap(ev.x, y, 1.55);
        this.sound.play('superudar', { volume: 0.6, rate: 0.7 });
        await c.wait(520);
        c.setFreeze(false);
        this.shake(700, 16);
        await c.camTo(ev.x, y + 30, 1.3, 1500);
        if (data?.defeat?.length) {
          c.setFreeze(true);
          for (const [who, text] of data.defeat) {
            if (who === 'hero') await c.camTo(this.player.x, this.focusOf(this.player).y, 1.35, 300);
            await c.say(who === 'boss' ? this.bossSpeaker(kind) : this.heroSpeaker(), text);
          }
        }
      },
      { freeze: false },
    );
  }

  /** Гигачад poses: a sunburst of rays behind him for a moment. */
  poseRays(id) {
    const f = this.world.fighters.find((x) => x.id === id);
    const v = f && this.views.get(id);
    if (!v) return;
    if (!this.textures.exists('fx_rays')) {
      const t = this.textures.createCanvas('fx_rays', 512, 512);
      const c = t.getContext();
      const g = c.createRadialGradient(256, 256, 10, 256, 256, 256);
      g.addColorStop(0, 'rgba(255,248,210,0.95)');
      g.addColorStop(1, 'rgba(255,248,210,0)');
      c.fillStyle = g;
      for (let i = 0; i < 16; i += 1) {
        const a0 = (i / 16) * Math.PI * 2;
        c.beginPath();
        c.moveTo(256, 256);
        c.arc(256, 256, 256, a0, a0 + 0.12);
        c.closePath();
        c.fill();
      }
      c.beginPath();
      c.arc(256, 256, 70, 0, Math.PI * 2);
      c.fill();
      t.refresh();
    }
    const r = this.add.image(f.x, stage.groundY(f.z) - (v.bodyH || 300) * 0.55, 'fx_rays').setDepth(v.visual.depth - 0.5).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: r, scale: 1.6, alpha: 1, duration: 500, ease: 'Back.Out' });
    this.tweens.add({ targets: r, angle: 40, duration: 1600 });
    this.tweens.add({ targets: r, alpha: 0, delay: 1100, duration: 500, onComplete: () => r.destroy() });
  }

  /** Smoke puff (Пахом vanishing / appearing). */
  puff(x, z) {
    const y = stage.groundY(z) - 120;
    for (let i = 0; i < 6; i += 1) {
      const c = this.add.circle(x + (Math.random() - 0.5) * 70, y + (Math.random() - 0.5) * 120, 26, 0x6b8f5a, 0.55).setDepth(1150);
      this.tweens.add({ targets: c, scale: 2.2, alpha: 0, y: c.y - 40, duration: 520, onComplete: () => c.destroy() });
    }
  }

  /** Lights off: darkness with a soft round hole around the player (vignette); Пахом's eyes glow. */
  setDark(on) {
    if (!this.darkLayer) {
      if (!this.textures.exists('fx_dark')) {
        const t = this.textures.createCanvas('fx_dark', 1024, 1024);
        const c = t.getContext();
        const g = c.createRadialGradient(512, 512, 120, 512, 512, 470);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0.96)');
        c.fillStyle = g;
        c.fillRect(0, 0, 1024, 1024);
        t.refresh();
      }
      this.darkLayer = this.add.container(0, 0).setDepth(1400).setAlpha(0);
      this.darkLayer.add(this.add.image(0, 0, 'fx_dark').setScale(1));
      // Solid black around the gradient so the whole screen is covered
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        this.darkLayer.add(this.add.rectangle(dx * 5512, dy * 5512, 10000, 10000, 0x000000, 0.97).setData('d', [dx, dy]));
      }
      this.darkEyes = this.add.container(0, 0).setDepth(1401).setVisible(false);
      for (const dx of [-10, 10]) this.darkEyes.add(this.add.ellipse(dx, 0, 11, 6, 0xc6ff6a, 1));
    }
    this.tweens.killTweensOf(this.darkLayer);
    this.tweens.add({ targets: this.darkLayer, alpha: on ? 1 : 0, duration: on ? 500 : 320 });
    this.darkOn = on;
  }

  /** Darkness with a flashlight beam cut out (dacha basement, sim/torch.js). */
  torchTexture() {
    if (this.textures.exists('fx_torch')) return 'fx_torch';
    const W = 2400;
    const H = 1200;
    const cx = W / 2;
    const cy = H / 2;
    const t = this.textures.createCanvas('fx_torch', W, H);
    const c = t.getContext();
    c.fillStyle = 'rgba(0,0,0,0.97)';
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'destination-out';
    // Small glow around the hero
    let g = c.createRadialGradient(cx, cy, 30, cx, cy, 210);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // The beam: a soft cone to the right
    c.save();
    c.beginPath();
    c.moveTo(cx + 20, cy - 30);
    c.lineTo(cx + 760, cy - 300);
    c.lineTo(cx + 820, cy + 60);
    c.lineTo(cx + 760, cy + 420);
    c.lineTo(cx + 20, cy + 60);
    c.closePath();
    c.clip();
    g = c.createRadialGradient(cx, cy, 40, cx, cy, 820);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.restore();
    c.globalCompositeOperation = 'source-over';
    // A warm tint inside the beam
    c.fillStyle = 'rgba(255,230,160,0)';
    t.refresh();
    return 'fx_torch';
  }

  updateDark() {
    if (!this.darkLayer || (!this.darkOn && this.darkLayer.alpha <= 0.01)) {
      this.darkEyes?.setVisible(false);
      return;
    }
    const pv = this.views.get(this.player.id);
    // Flashlight mode: swap the round vignette for the beam, turned the way the hero looks
    const torch = !!this.world.torch && !this.world.torch.done;
    // Unscrew progress rings over the fuses
    if (!this.fuseGfx) this.fuseGfx = this.add.graphics().setDepth(1403);
    this.fuseGfx.clear();
    if (torch) {
      for (const fz of this.world.torch.fuses) {
        if (fz.got || !fz.prog) continue;
        const y = stage.groundY(fz.z) - 30;
        this.fuseGfx.lineStyle(6, 0xffe08a, 1).beginPath();
        this.fuseGfx.arc(fz.x, y, 40, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * fz.prog) / FUSE_T).strokePath();
      }
    }
    const img = this.darkLayer.list[0];
    const key = torch ? this.torchTexture() : 'fx_dark';
    if (img.texture.key !== key) {
      img.setTexture(key);
      // Solid black right up to the edges of the new picture
      for (const r of this.darkLayer.list.slice(1)) {
        const [dx, dy] = r.getData('d');
        r.setPosition(dx * (img.width / 2 + 5000), dy * (img.height / 2 + 5000));
      }
    }
    img.setFlipX(torch && this.player.facing < 0);
    this.darkLayer.setPosition(pv ? pv.visual.x : this.player.x, (pv ? pv.visual.y : stage.groundY(this.player.z)) - (torch ? 150 : 120));
    const boss = this.world.fighters.find((f) => (f.kind === 'pahom' || f.kind === 'shade') && !f.dead);
    const v = boss && this.views.get(boss.id);
    const head = v?.puppet?.nodes?.head?.sprite;
    this.darkEyes.setVisible(!!head && this.darkOn);
    if (head) {
      const b = head.getBounds();
      // Eyes sit a little above the middle of the head, towards the face
      this.darkEyes.setPosition(b.centerX + boss.facing * b.width * 0.12, b.y + b.height * 0.42);
    }
  }

  /** Fire mark on the floor: grows red, then bursts (1Kla$ pyro). */
  zoneMark(x, z, r, t) {
    const y = stage.groundY(z);
    const m = this.add.ellipse(x, y, r * 2, r * 0.7, 0xff3a1a, 0.18).setDepth(stage.depth(0) - 2);
    m.setStrokeStyle(3, 0xff8a2a, 0.9);
    this.tweens.add({ targets: m, fillAlpha: 0.55, duration: (t / 60) * 1000, onComplete: () => m.destroy() });
    this.tweens.add({ targets: m, scaleX: 1.08, scaleY: 1.08, yoyo: true, repeat: -1, duration: 160 });
  }

  zoneBurst(x, z, r) {
    const y = stage.groundY(z) - 30;
    const c = this.add.circle(x, y, r * 0.6, 0xffb02a, 0.9).setDepth(1200);
    this.tweens.add({ targets: c, scale: 2.4, alpha: 0, duration: 380, onComplete: () => c.destroy() });
    this.shake(180, 8);
    this.sound.play('explosion', { volume: 0.35 });
  }

  shake(ms, amp) {
    if (!GameState.settings.shake) return;
    if (this.shakeT > 0 && this.shakeAmp > amp) return;
    this.shakeT = ms;
    this.shakeDur = ms;
    this.shakeAmp = amp;
  }

  drainEvents() {
    const evs = this.world.events;
    if (!evs.length) return;
    for (const ev of evs) {
      switch (ev.type) {
        case 'swing': {
          if (ev.sfx) this.sound.play(ev.sfx, { volume: 0.32 });
          const f = this.world.fighters.find((x) => x.id === ev.id);
          if (f) this.voices.say(voiceOf(f), 'attack', { hero: f.team === 'player' });
          if (f && f.team !== 'player') {
            const m = MOVES[ev.move];
            this.views.get(ev.id)?.telegraph((m.startup / 60) * 1000, !!m.knockdown);
          }
          break;
        }
        case 'grab':
          this.sound.play('punch', { volume: 0.25, rate: 0.8 });
          break;
        case 'throw':
          this.sound.play('superudar', { volume: 0.45 });
          this.shake(140, 6);
          break;
        case 'perfect':
          this.onPerfect(ev);
          break;
        case 'rage':
          this.voices.say(voiceOf(this.world.fighters.find((x) => x.id === ev.id)), 'special', { force: true });
          this.onRage(ev);
          break;
        case 'arenaStart':
          this.lock = { left: ev.left, right: ev.right };
          this.shake(120, 3);
          if (ev.boss) {
            this.sound.stopByKey('game');
            if (GameState.musicPlay) this.sound.play('boss', { loop: true, volume: 0.45 });
          }
          break;
        case 'wave':
          if (ev.banner) this.banner(ev.banner, ev.boss ? null : `Волна ${ev.n}/${ev.total}`, 1300, ev.boss);
          else this.banner(`Волна ${ev.n}/${ev.total}`, null, 900);
          this.sound.play('beep', { volume: 0.25, rate: 0.7 });
          break;
        // ---- Panelki traps (TD) / PC club votes
        case 'tdStart':
          this.banner('ГОТОВЬ ЛОВУШКИ', 'J — поставить · Q/E — грабли / петарда / клей · гопники идут к ларьку', 2600, true);
          break;
        case 'tdPlace':
          this.sound.play('DE_reload', { volume: 0.4, rate: 1.2 });
          break;
        case 'tdNo': {
          const p = this.player;
          this.popText(p.x, stage.groundY(p.z) - 280, ev.why, '#ff8a7a', 20);
          break;
        }
        case 'tdFight':
          this.banner('ИДУТ!', 'Защити ларёк', 1300, true);
          break;
        case 'tdTrigger':
          if (ev.kind === 'rake') {
            this.sound.play('punch', { volume: 0.5, rate: 1.4 });
            this.popText(ev.x, stage.groundY(ev.z) - 200, 'БДЫЩ!', '#ffd23f', 24);
          }
          break;
        case 'voteStart':
          this.sound.play('beep', { volume: 0.3, rate: 1.6 });
          break;
        case 'voteWin':
          this.banner('ЧАТ РЕШИЛ', ev.title, 1600);
          this.sound.play('cash', { volume: 0.35, rate: 1.4 });
          break;
        // ---- Gym bench press / museum stealth / river raft
        case 'benchStart':
          if (ev.rap) this.banner('РЭП-БАТТЛ', '1Kla$ против тебя · WASD в бит · толпа решит, каким он выйдет', 2600, true);
          else this.banner('ЖИМ НА СПОР', 'Руки базуки против тебя · J и K в такт с нотами', 2400, true);
          break;
        case 'benchHit':
          if (ev.grade === 'perfect') this.sound.play('punch', { volume: 0.25, rate: 1.5 });
          else if (ev.grade !== 'ok') this.sound.play('no_bulet', { volume: 0.3, rate: 0.8 });
          break;
        case 'benchRep':
          if (ev.who === 'you') {
            this.popText(this.player.x, stage.groundY(this.player.z) - 360, this.world.mini?.cfg?.rap ? `Панч! ${ev.reps}` : `Раз! ${ev.reps}`, '#7dff7a', 28);
            this.sound.play('cash', { volume: 0.3, rate: 1.6 });
          }
          break;
        case 'benchEnd':
          this.focusOff();
          if (ev.rap) this.resultCard(ev.win ? 'ТОЛПА ЗА ТЕБЯ!' : 'ТОЛПА ЗА 1KLA$', [`Панчи ${ev.reps} : ${ev.rival}`, ev.win ? 'Он выходит на бой осипшим' : 'Он заряжен — держись'], ev.win);
          else this.resultCard(ev.win ? 'ПЕРЕЖАЛ!' : 'РУКИ СИЛЬНЕЕ', [`Повторы ${ev.reps} : ${ev.rival}`, ev.win ? 'Протеин на всю карту' : 'А теперь он злой'], ev.win);
          break;
        case 'stealthStart':
          this.banner('ТИХО…', 'Перебегай от статуи к статуе · красное — их взгляд', 2400, true);
          break;
        case 'stealthAlarm':
          this.banner('ТРЕВОГА!', 'Тебя заметили — дерись', 1600, true);
          this.cameras.main.flash(200, 255, 40, 30, false);
          this.sound.play('beep', { volume: 0.5, rate: 0.6 });
          break;
        case 'stealthDone':
          this.resultCard('ПРОШЁЛ НЕЗАМЕЧЕННЫМ', ['Ни одна статуя не проболталась', '+20 косарей'], true);
          this.sound.play('cash', { volume: 0.5 });
          break;
        case 'raftStart':
          this.banner('НА ПЛОТ!', 'Течение несёт · рыбаки прыгают на плот сверху', 2400, true);
          break;
        case 'raftEnd':
          this.resultCard('БЕРЕГ!', ['Приплыли — прыгай на причал'], true);
          break;
        // ---- Sigma pose-off / stream style / office lift + trading
        case 'poseStart':
          this.banner('БИТВА ПОЗ', 'Гигачад показывает — повтори WASD', 2200, true);
          break;
        case 'posePose': {
          const f = this.world.fighters.find((x) => x.id === ev.id);
          const ARR = { W: '↑', A: '←', S: '↓', D: '→' };
          if (f) this.popText(f.x, stage.groundY(f.z) - 340, ARR[ev.key], ev.who === 'chad' ? '#ffffff' : ev.ok ? '#7dff7a' : '#ff5a4a', 46);
          if (ev.who === 'chad') {
            this.cameras.main.flash(90, 255, 255, 255, false);
            this.sound.play('beep', { volume: 0.25, rate: 1 + ev.i * 0.1 });
          } else this.sound.play(ev.ok ? 'punch' : 'no_bulet', { volume: 0.3, rate: 1.3 });
          break;
        }
        case 'poseYourTurn':
          this.popText(this.player.x, stage.groundY(this.player.z) - 380, 'Твой ход!', '#ffd23f', 30);
          break;
        case 'poseResult':
          this.banner(ev.ok ? 'АУРА!' : 'НЕ ТА ПОЗА', `Ты ${ev.score.you} : ${ev.score.chad} Гигачад`, 1000, !ev.ok);
          break;
        case 'poseEnd':
          this.banner(ev.win ? 'ТЫ СИГМА' : 'ГИГАЧАД СИЛЬНЕЕ', ev.win ? 'Он выходит на бой потрёпанным' : 'Он только разогрелся', 2000, !ev.win);
          break;
        case 'styleRank':
          if (ev.up && 'BASSS'.includes(ev.rank) && this.time.now - (this.lastRankT || 0) > 2500) {
            this.lastRankT = this.time.now;
            this.popText(this.player.x, stage.groundY(this.player.z) - 380, `СТИЛЬ ${ev.rank}!`, '#ff3b6b', 34);
          }
          break;
        case 'donate':
          this.popText(ev.x, stage.groundY(ev.z) - 420, `Донат +${ev.amount} К`, '#ffd23f', 24);
          this.sound.play('cash', { volume: 0.25, rate: 1.5 });
          break;
        case 'elevatorStart':
          this.inLift = true;
          // The camera stays on the cabin
          this.lock = { left: ev.left, right: ev.right };
          this.banner('ЛИФТ', 'Двери закрываются… на каждом этаже — новые гости', 2000, true);
          break;
        case 'elevatorFloor':
          this.banner(`ЭТАЖ ${ev.floor}`, 'Дзынь!', 1000);
          this.sound.play('beep', { volume: 0.35, rate: 1.8 });
          break;
        case 'tradeStart':
          this.banner('ИНВЕСТИЦИИ', 'Гительман предлагает войти в рынок · J — купить, K — продать', 2400, true);
          break;
        case 'tradeBuy':
        case 'tradeSell':
          this.sound.play('cash', { volume: 0.35, rate: ev.type === 'tradeBuy' ? 0.8 : 1.3 });
          break;
        case 'tradeCrash':
          this.banner('ОБВАЛ!', 'Рынок летит вниз', 1100, true);
          break;
        case 'tradeEnd':
          this.resultCard(ev.profit >= 0 ? 'В ПЛЮСЕ' : 'ЛИКВИДАЦИЯ', [`${ev.profit >= 0 ? '+' : ''}${ev.profit} косарей`, ev.profit >= 0 ? 'Гительман в ярости' : 'Гительман доволен'], ev.profit >= 0);
          break;
        // ---- Village penalties
        case 'penaltyStart':
          this.banner('ПЕНАЛЬТИ!', `Дед вызывает: по ${ev.rounds} удара · победишь — косари`, 2400, true);
          break;
        case 'penaltyKick':
          this.sound.play('punch', { volume: 0.5, rate: 0.8 });
          break;
        case 'penaltyResult':
          this.banner(ev.text, `Ты ${ev.score.you} : ${ev.score.ded} Дед`, 1100, !ev.scored === (ev.who === 'you'));
          if (ev.scored && ev.who === 'you') this.sound.play('cash', { volume: 0.5 });
          if (!ev.scored && ev.who === 'ded') this.sound.play('superudar', { volume: 0.35, rate: 1.3 });
          break;
        case 'penaltyEnd':
          this.resultCard(ev.win ? 'ПОБЕДА В СЕРИИ!' : ev.draw ? 'НИЧЬЯ' : 'ДЕД ПОБЕДИЛ', [`Счёт ${ev.score.you} : ${ev.score.ded}`, ev.win ? '+25 косарей и здоровье' : ev.draw ? 'Ну, бывает' : 'Он позвал корешей…'], ev.win);
          break;
        // ---- Dacha basement (flashlight)
        case 'torchStart':
          this.banner('СВЕТ ВЫРУБИЛИ', `Выкрути ${ev.fuses.length} пробки (постой рядом) · свети на Пахома — он замрёт`, 2400, true);
          this.fuseViews = new Map();
          for (const fz of ev.fuses) {
            const key = this.textures.exists('item_fuse') ? 'item_fuse' : 'item_energy';
            const im = this.add.image(fz.x, stage.groundY(fz.z) - 30, key).setDepth(1402);
            im.setScale(80 / Math.max(im.width, im.height));
            const glow = this.add.circle(fz.x, stage.groundY(fz.z) - 30, 42, 0xffe08a, 0.35).setDepth(1401);
            this.tweens.add({ targets: [im, glow], alpha: { from: 1, to: 0.35 }, yoyo: true, repeat: -1, duration: 700 });
            this.fuseViews.set(fz.id, [im, glow]);
          }
          break;
        case 'fuseGot':
          for (const o of this.fuseViews?.get(ev.id) || []) o.destroy();
          this.popText(ev.x, stage.groundY(ev.z) - 140, `Пробка ${ev.got}/${ev.need}`, '#ffe08a', 26);
          this.sound.play('cash', { volume: 0.4, rate: 1.3 });
          break;
        case 'torchDone':
          this.resultCard('ДА БУДЕТ СВЕТ!', ['Пробки на месте', 'А теперь — гости'], true);
          this.cameras.main.flash(260, 255, 250, 220, false);
          break;
        case 'shadeLit':
          this.sound.play('beep', { volume: 0.22, rate: 0.45 });
          break;
        case 'shadeScare':
          this.cameras.main.flash(160, 120, 255, 120, false);
          this.shake(320, 11);
          this.sound.play('superudar', { volume: 0.5, rate: 0.6 });
          this.popText(ev.x, stage.groundY(ev.z) - 300, 'АААА!', '#c6ff6a', 40);
          break;
        case 'puff':
          this.puff(ev.x, ev.z);
          break;
        // ---- Entries (sit in the car, walk up to the ball...) and results
        case 'entryUse':
          if (!ev.auto) this.sound.play('DE_reload', { volume: 0.35, rate: 0.9 });
          this.playEntry();
          break;
        case 'rapTurn': {
          const f = this.world.fighters.find((x) => x.id === ev.id);
          if (f) {
            const fp = this.focusOf(f);
            this.focusOn(f.x + (ev.who === 'you' ? 140 : -140), fp.y - 40, 1.4, 2.5);
          }
          this.banner(ev.who === 'you' ? 'ТВОЙ КУПЛЕТ' : 'КУПЛЕТ 1KLA$', ev.who === 'you' ? 'WASD в бит!' : 'слушай и жди', 900, ev.who !== 'you');
          break;
        }
        case 'rapLine':
          this.bounce(ev.id);
          if (ev.ok) {
            const f = this.world.fighters.find((x) => x.id === ev.id);
            if (f) this.popText(f.x, stage.groundY(f.z) - 340, ['Йоу!', 'Скр!', 'Бит!', 'Флоу!', 'Е!'][Math.floor(Math.random() * 5)], '#ff9ad8', 26);
          }
          break;
        case 'qteStart': {
          const fp = this.focusOf(this.player);
          this.focusOn((ev.x + ev.px) / 2, fp.y - 30, 1.55, 6);
          this.cameras.main.flash(200, 255, 255, 255, false);
          this.sound.play('superudar', { volume: 0.5, rate: 0.6 });
          this.banner('ДОБЕЙ!', 'жми кнопки, пока не закрылся круг', 900, true);
          break;
        }
        case 'qteHit':
          this.cameras.main.flash(80, 255, 255, 255, false);
          this.sound.play('punch', { volume: 0.5, rate: 1 + ev.i * 0.08 });
          this.shake(120, 6);
          break;
        case 'qteEnd':
          this.focusOff();
          this.shake(400, ev.ok ? 14 : 8);
          this.resultCard(ev.ok ? 'КРАСИВО!' : 'СОРВАЛОСЬ', ev.ok ? ['Гигачад теряет пятую часть здоровья'] : ['Он перехватил и бросил тебя'], ev.ok);
          break;
        // ---- Highway race / roadside traps
        case 'raceStart':
          this.banner('В ТАЧКУ!', 'W/S — полоса · D — газ · A — тормоз · J — в морду', 2200, true);
          this.sound.play('superudar', { volume: 0.35, rate: 1.4 });
          break;
        case 'raceCrash':
          this.shake(260, 9);
          this.sound.play('hit', { volume: 0.7, rate: 0.6 });
          this.popText(ev.x, stage.groundY(ev.z) - 160, `−${ev.dmg}`, '#ff5a4a', 30);
          break;
        case 'racePunch':
          this.sound.play('punch', { volume: 0.35, rate: 1.1 });
          break;
        case 'mopedDown':
          this.sound.play('hit', { volume: 0.55, rate: 1.2 });
          this.popText(ev.x, stage.groundY(ev.z) - 170, 'СБИТ!', '#ffd23f', 26);
          break;
        case 'potLand':
          this.sound.play('punch', { volume: 0.4, rate: 0.7 });
          this.shake(80, 3);
          break;
        case 'raceEnd':
          this.resultCard('ПРИЕХАЛИ!', [`Аварий: ${ev.crashes}`, `Бонус: ${ev.bonus} косарей`], ev.crashes < 3);
          {
            const p = this.player;
            const car = this.add.image(p.x - 40, stage.groundY(p.z), 'item_car_lada').setOrigin(0.5, 1).setFlipX(true);
            car.setScale(290 / car.width).setDepth(stage.depth(p.z) - 1);
          }
          this.sound.play('cash', { volume: 0.5 });
          break;
        case 'laneWarn':
          if (!this.raceView) this.raceView = new RaceView(this, this.heroSpeaker().face);
          this.raceView.laneWarn(ev.z, ev.dir, ev.t, ev.what);
          this.sound.play('beep', { volume: 0.3, rate: 1.4 });
          break;
        // ---- Arena goals
        case 'goalStart': {
          const t = {
            survive: ['ПРОДЕРЖИСЬ!', 'Волны не кончатся, пока идёт время'],
            defend: ['ЗАЩИТИ ЛАРЁК!', 'Сломают — потеряешь косари'],
            chase: ['ДЕРЖИ ВОРА!', 'Он убегает с косарями'],
            destroy: ['РАЗБЕЙ КАМЕРЫ!', 'Пока они пишут — толпа не кончится'],
          }[ev.goal];
          if (t) this.banner(t[0], t[1], 1900, true);
          this.sound.play('beep', { volume: 0.3, rate: 1.2 });
          break;
        }
        case 'goalDone':
          if (ev.goal === 'survive') this.resultCard('ВЫСТОЯЛ!', ['Время вышло — они разбегаются'], true);
          if (ev.goal === 'destroy') this.resultCard('КАМЕРЫ РАЗБИТЫ!', ['Эфир сорван', 'Добей остальных'], true);
          break;
        case 'objLost':
          this.banner('ЛАРЁК РАЗГРОМИЛИ!', '−10 косарей', 1300, true);
          this.shake(200, 6);
          this.sound.play('punch', { volume: 0.4, rate: 0.6 });
          break;
        case 'targetBreak':
          this.shake(120, 4);
          this.sound.play('punch', { volume: 0.4, rate: 1.3 });
          break;
        case 'thiefTaunt':
          this.popText(ev.x, stage.groundY(ev.z) - 230, ev.climb ? 'Перелезает через забор!' : ['Не догонишь!', 'Лови, лох!', 'Ха-ха!'][this.world.tick % 3], '#ffffff', 22);
          break;
        case 'thiefCaught':
          this.resultCard('ПОЙМАЛ!', ['Вор лежит, мешок твой'], true);
          this.sound.play('cash', { volume: 0.5 });
          break;
        case 'thiefEscaped':
          this.resultCard('ВОР УБЕЖАЛ', ['−20 косарей'], false);
          break;
        case 'arenaClear':
          if (this.inLift) {
            this.inLift = false;
            this.resultCard('ПРИЕХАЛИ', ['Последний этаж', 'Двери открываются…'], true);
          }
          this.lock = null;
          if (!ev.boss) this.banner('ЧИСТО!', 'Вперёд →', 1200);
          this.sound.play('cash', { volume: 0.4 });
          break;
        case 'go':
          this.goT = 0;
          break;
        case 'bossDown': {
          this.shake(500, 14);
          // The explosion is Влад Борщ's own death; the others fall with a heavy blow
          const dk = this.world.fighters.find((x) => x.id === ev.id)?.kind;
          if (dk === 'borsch') this.sound.play('explosion', { volume: 0.5 });
          else {
            this.sound.play('superudar', { volume: 0.7, rate: 0.55 });
            this.sound.play('hit', { volume: 0.6, rate: 0.7 });
          }
          this.sound.stopByKey('boss');
          this.voices.say(voiceOf(this.world.fighters.find((x) => x.id === ev.id)), 'death', { force: true });
          this.playFinisher(ev);
          break;
        }
        case 'mapComplete':
          this.time.delayedCall(1400, () => this.cine.after(() => this.showResults()));
          break;
        case 'pickup':
          if (ev.kind === 'kosar') {
            this.sound.play('cash', { volume: 0.22, rate: 1 + Math.random() * 0.2 });
            {
              const p = this.world.fighters.find((x) => x.id === ev.id);
              if (p?.team === 'player') this.voices.say(voiceOf(p), 'pickup', { hero: true });
            }
            this.popText(ev.x, stage.groundY(ev.z) - 120, `+${ev.amount} К`, '#ffd23f', 22);
          } else if (ev.kind === 'gun') {
            this.sound.play('shotgun_reload', { volume: 0.45 });
            this.popText(ev.x, stage.groundY(ev.z) - 140, `${WEAPONS[ev.weapon].name} +${ev.amount}`, '#ffffff', 22);
          } else if (ev.kind === 'buff') {
            this.sound.play('+life', { volume: 0.5, rate: 1.2 });
            this.popText(ev.x, stage.groundY(ev.z) - 140, BUFFS[ev.buff]?.title || '', '#8fe3ff', 24);
          } else {
            this.sound.play('+life', { volume: 0.45 });
            this.popText(ev.x, stage.groundY(ev.z) - 120, `+${ev.amount}`, '#7dff7a', 30);
          }
          break;
        case 'spawn':
          if (ev.from === 'drop') this.sound.play('beep', { volume: 0.1, rate: 0.5 });
          {
            const f = this.world.fighters.find((x) => x.id === ev.id);
            const v = voiceOf(f);
            if (!v && ev.kind === 'borsch') this.sound.play('eto_vlad_borsh', { volume: 0.6 });
            if (!v && ev.kind === 'povar') this.sound.play('professiya_', { volume: 0.6 });
            // Bosses speak on their arrival card; debuting enemies on the meeting scene
            if (v && !FIGHTERS[ev.kind]?.boss && !this.map?.debuts?.includes(ev.kind)) this.voices.say(v, 'spawn', { chance: ev.elite ? 1 : null });
          }
          // Bosses, and meme enemies on the map where they debut, get a meeting scene
          if ((FIGHTERS[ev.kind]?.boss || this.map?.debuts?.includes(ev.kind)) && !this.introduced.has(ev.kind)) {
            this.introduced.add(ev.kind);
            this.playBossArrival(ev.id, ev.kind);
          } else {
            // No scene for him: don't keep him standing
            const wf = this.world.fighters.find((x) => x.id === ev.id);
            if (wf?.waiting) wf.waiting = false;
          }
          break;
        case 'shot':
          this.onShot(ev);
          break;
        case 'explode':
          this.onExplode(ev);
          break;
        case 'empty':
          this.sound.play('no_bulet', { volume: 0.4 });
          this.popText(this.player.x, stage.groundY(this.player.z) - 240, 'Патроны кончились', '#ff9a8a', 18);
          break;
        case 'weapon':
          this.sound.play(ev.weapon ? 'DE_reload' : 'beep', { volume: ev.weapon ? 0.4 : 0.15 });
          break;
        case 'noWeapon':
          this.sound.play('beep', { volume: 0.15, rate: 0.7 });
          break;
        case 'buy':
          this.sound.play('cash', { volume: 0.5 });
          this.popText(this.player.x, stage.groundY(this.player.z) - 240, 'Куплено!', '#ffd23f', 22);
          break;
        case 'helperCome':
          this.banner(`${HELPER_NAME[ev.kind] || 'Помощник'} на твоей стороне!`, '25 секунд', 1500);
          this.sound.play('superudar', { volume: 0.4, rate: 1.2 });
          break;
        case 'helperGone':
          this.popText(this.player.x, stage.groundY(this.player.z) - 260, `${HELPER_NAME[ev.kind] || 'Помощник'} ушёл`, '#9fd3e0', 20);
          break;
        case 'cantBuy':
          this.sound.play('no_bulet', { volume: 0.35 });
          this.popText(this.player.x, stage.groundY(this.player.z) - 240, 'Не хватает косарей', '#ff9a8a', 18);
          break;
        case 'crateIncoming':
          // (was the airship's sound — crates fall on every map)
          this.sound.play('beep', { volume: 0.15, rate: 0.7 });
          break;
        case 'crateLand':
          this.shake(140, 5);
          this.dust(ev.x, ev.z, 1.4);
          this.sound.play('punch', { volume: 0.4, rate: 0.7 });
          break;
        case 'crateBreak':
          this.onCrateBreak(ev);
          break;
        case 'toss':
          if (ev.kind === 'bottle' || ev.kind === 'pot' || ev.kind === 'pan' || ev.kind === 'bomb') this.sound.play('udar', { volume: 0.2, rate: 1.3 });
          // «Ммм» is Повар's own: only for his real pots and pans (not books / jars / notes)
          if ((ev.tex === 'pot' || ev.tex === 'pan') && Math.random() < 0.3) this.sound.play('mmm', { volume: 0.4 });
          break;
        case 'aimWarn': {
          // Spear: a red line along the lane it is about to fly down
          const y = stage.groundY(ev.z) - 170;
          const len = 2400;
          const ln = this.add.rectangle(ev.x + ev.dir * len / 2, y, len, 6, 0xff2a2a, 0.75).setDepth(1300);
          this.tweens.add({ targets: ln, alpha: 0.2, yoyo: true, repeat: Math.max(1, Math.round(ev.ms / 120)), duration: 60, onComplete: () => ln.destroy() });
          break;
        }
        case 'touchdown':
          this.shake(200, 9);
          this.puff(ev.x, ev.z);
          break;
        case 'bossCue':
          this.banner(ev.text, ev.sub || null, 1500, true);
          this.shake(220, 6);
          this.sound.play('beep', { volume: 0.3, rate: 0.7 });
          break;
        case 'blink':
          this.puff(ev.x0, ev.z);
          this.puff(ev.x, ev.z);
          this.sound.play('beep', { volume: 0.2, rate: 0.5 });
          break;
        case 'dark':
          this.setDark(ev.on);
          break;
        case 'zoneWarn':
          this.zoneMark(ev.x, ev.z, ev.r, ev.t);
          break;
        case 'zoneFire':
          this.zoneBurst(ev.x, ev.z, ev.r);
          break;
        case 'beat':
          this.punch(ev.drop ? 0.04 : 0.015);
          if (ev.drop) this.shake(160, 7);
          this.sound.play('beep', { volume: ev.drop ? 0.3 : 0.12, rate: ev.drop ? 0.35 : 0.5 });
          break;
        case 'verse':
          this.verseEnd = this.time.now + (ev.ticks / 60) * 1000;
          break;
        case 'pose':
          this.cameras.main.flash(180, 255, 255, 255, false);
          this.poseRays(ev.id);
          this.punch(0.06);
          this.popText(ev.x, stage.groundY(ev.z) - 320, '*позирует*', '#ffffff', 26);
          break;
        case 'parry':
          this.sound.play('no_bulet', { volume: 0.4, rate: 1.4 });
          this.popText(ev.x, stage.groundY(ev.z) - 260, 'Парирует!', '#ffd23f', 22);
          break;
        case 'quake':
          this.shake(200, 8);
          break;
        case 'immune':
          this.sound.play('no_bulet', { volume: 0.35, rate: 0.7 });
          if (this.time.now > this.immuneHintT && ev.hint) {
            this.immuneHintT = this.time.now + 3500;
            this.popText(ev.x, stage.groundY(ev.z) - 300, ev.hint, '#ffe27a', 22);
          }
          break;
        case 'bossHit': {
          this.shake(260, 10);
          this.punch(0.05);
          const v = voiceOf(this.world.fighters.find((x) => x.id === ev.id));
          if (!(v && this.voices.say(v, 'hurt', { chance: 0.7 }))) this.sound.play(Math.random() < 0.5 ? 'BLYA!!!' : 'blya', { volume: 0.5 });
          break;
        }
        case 'bossPhase':
          this.voices.say(voiceOf(this.world.fighters.find((x) => x.id === ev.id)), 'down', { force: true });
          this.banner('Сбежал!', this.world.fighters.find((x) => x.id === ev.id)?.kind === 'povar' ? 'Берегись вилок' : 'Берегись — сверху летит!', 1400, true);
          this.sound.play('haha2', { volume: 0.5 });
          break;
        case 'forkRain':
          this.sound.play('beep', { volume: 0.3, rate: 0.7 });
          break;
        case 'bossReturn':
          this.banner(`${FIGHTERS[this.world.fighters.find((x) => x.id === ev.id)?.kind]?.title || 'Босс'} вернулся!`, `Фаза ${ev.phase}/3`, 1300, true);
          this.sound.play('poovar', { volume: 0.5 });
          break;
        case 'forkStick':
          this.sound.play('hit', { volume: 0.12, rate: 1.8 });
          break;
        case 'airship':
          this.sound.play('dirigabb_poyav', { volume: 0.45 });
          if (!this.sound.get('dirigabb_sound')?.isPlaying) this.sound.play('dirigabb_sound', { loop: true, volume: 0.3 });
          break;
        case 'airshipGone':
          this.sound.stopByKey('dirigabb_sound');
          break;
        case 'anvilIncoming':
          this.sound.play('beep', { volume: 0.15, rate: 0.7 });
          break;
        case 'anvilLand':
          this.shake(200, 8);
          this.dust(ev.x, ev.z, 1.8);
          this.sound.play('punch', { volume: 0.5, rate: 0.6 });
          break;
        case 'anvilBreak':
          this.anvilPieces(ev.x, ev.z);
          this.sound.play('hit', { volume: 0.35, rate: 0.7 });
          break;
        case 'anvilLaunch':
          this.shake(120, 6);
          this.sound.play('superudar', { volume: 0.45 });
          this.popText(ev.x, stage.groundY(ev.z) - 160, 'АХТУНГ!', '#ffd23f', 26);
          break;
        case 'shatter':
          if (ev.kind === 'bottle') {
            this.shards(ev.x, ev.z, ev.y);
            this.sound.play('hit', { volume: 0.35, rate: 1.5 });
          } else {
            this.sound.play('punch', { volume: 0.3, rate: 1.4 });
            this.dust(ev.x, ev.z, 0.6);
          }
          break;
        case 'reflect':
          this.shake(80, 3);
          this.sound.play('superudar', { volume: 0.35, rate: 1.4 });
          this.popText(ev.x, stage.groundY(ev.z) - ev.y - 20, 'ОТБИЛ!', '#ffe27a', 24);
          break;
        case 'block': {
          const v = this.views.get(ev.id);
          const y = stage.groundY(ev.z) - (v?.bodyH ?? 200) * 0.75;
          const spark = this.add.circle(ev.x - ev.dir * 26, y, 10, 0x9fd8ff, 0.95).setDepth(1300);
          this.tweens.add({ targets: spark, scale: 2.6, alpha: 0, duration: 140, onComplete: () => spark.destroy() });
          this.sound.play('no_bulet', { volume: 0.4, rate: 0.8 });
          if (!this.blockHintShown) {
            this.blockHintShown = true;
            this.popText(ev.x, y - 40, 'Блок! Бей ногой или хватай', '#9fd8ff', 20);
          }
          break;
        }
        case 'guardBreak':
          this.popText(ev.x, stage.groundY(ev.z) - 230, 'ПРОБИЛ!', '#ffd23f', 24);
          this.shake(110, 5);
          break;
        case 'nometer':
          this.sound.play('no_bulet', { volume: 0.3 });
          this.popText(this.player.x, stage.groundY(this.player.z) - 250, 'Мало ярости', '#bbbbbb', 18);
          break;
        case 'hit':
          this.onHit(ev);
          break;
        case 'thud':
          this.dust(ev.x, ev.z, 1);
          break;
        case 'land':
          this.dust(ev.x, ev.z, 0.6);
          this.views.get(ev.id)?.squash(0.14);
          if (ev.id === this.player.id) this.kickV += 70;
          break;
        case 'jump':
          this.views.get(ev.id)?.squash(-0.1);
          break;
        case 'jump2':
          this.views.get(ev.id)?.squash(-0.12);
          this.sound.play('beep', { volume: 0.12, rate: 1.6 });
          break;
        case 'dash':
          this.dust(ev.x, ev.z, 0.5);
          break;
        default:
      }
    }
    evs.length = 0;
  }

  /** Voice of the one who got hit. */
  voiceHit(ev) {
    const f = this.world.fighters.find((x) => x.id === ev.target);
    const v = voiceOf(f);
    if (!v || ev.reaction === 'boss') return;
    const hero = f.team === 'player';
    if (ev.reaction === 'kill') this.voices.say(v, 'death', { hero, force: hero || FIGHTERS[f.kind]?.boss });
    else if (ev.reaction === 'knockdown' || ev.reaction === 'launch') this.voices.say(v, 'down', { hero });
    else if (ev.reaction !== 'held') this.voices.say(v, 'hurt', { hero });
  }

  onHit(ev) {
    this.voiceHit(ev);
    if (ev.reaction === 'prop') {
      this.sound.play('punch', { volume: 0.3, rate: 0.6 + Math.random() * 0.2 });
      this.splinters(ev.x, ev.z, 4);
      return;
    }
    const v = this.views.get(ev.target);
    const bodyH = v?.bodyH ?? 200;
    const x = ev.x - ev.dir * 10;
    const y = stage.groundY(ev.z) - ev.y - bodyH * 0.62;
    const heavy = ev.heavy || ev.reaction === 'kill';
    if (ev.reaction === 'armor') v?.flash(50);

    const flash = this.add.circle(x, y, heavy ? 15 : 10, 0xfff2c4, 0.95).setDepth(1200);
    this.tweens.add({
      targets: flash,
      scale: heavy ? 3.4 : 2.4,
      alpha: 0,
      duration: heavy ? 170 : 110,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
    const n = heavy ? 6 : 3;
    for (let i = 0; i < n; i += 1) {
      const ang = ev.dir * (20 + i * 16) + Phaser.Math.Between(-10, 10) - (ev.dir < 0 ? 180 : 0);
      const streak = this.add
        .rectangle(x, y, (heavy ? 30 : 20) + i * 4, heavy ? 4 : 3, i % 2 ? 0xffffff : 0xffcc66)
        .setDepth(1201)
        .setAngle(ang);
      this.tweens.add({
        targets: streak,
        x: x + ev.dir * (22 + i * 10),
        y: y + Phaser.Math.Between(-20, 20),
        alpha: 0,
        scaleX: 1.7,
        duration: 100 + i * 22,
        ease: 'Quad.easeOut',
        onComplete: () => streak.destroy(),
      });
    }

    if (ev.dmg) {
      const big = ev.dmg >= 15 || ev.reaction === 'kill';
      this.popText(
        x + Phaser.Math.Between(-12, 12),
        y - 30,
        String(ev.dmg),
        ev.targetTeam === 'player' ? '#ff6a5a' : big ? '#ffd23f' : '#ffffff',
        big ? 28 : 20,
      );
    }
    if (ev.targetTeam === 'player') {
      this.shake(160, 7);
      this.sound.play('-life', { volume: 0.35 });
      this.hurtFlash();
    } else {
      this.shake(heavy ? 120 : 70, heavy ? 6 : 3);
      if (heavy) this.punch(0.03);
    }
    this.sound.play('hit', { volume: heavy ? 0.6 : 0.42, rate: heavy ? 0.9 : 1 + Math.random() * 0.15 });
  }

  renderProjectiles(alpha) {
    const seen = new Set();
    for (const pr of this.world.projectiles) {
      seen.add(pr.id);
      let img = this.projViews.get(pr.id);
      if (!img) {
        if (pr.spec.tex === 'bottle') this.bottleTexture();
        // Any item art works as a projectile (dumbbells from the ceiling, logs...)
        const orig = ORIG_PROJ[pr.spec.tex] || (this.textures.exists(`item_${pr.spec.tex}`) ? { key: `item_${pr.spec.tex}`, size: PROJ_SIZE[pr.spec.tex] || 64, spin: 8 } : null);
        if (!orig && !this.textures.exists(`proj_${pr.spec.tex}`) && pr.spec.tex !== 'bottle') console.warn('[proj] no art for', pr.spec.tex);
        if (orig) {
          img = this.add.sprite(0, 0, this.textures.exists(orig.key) ? orig.key : '__DEFAULT').setOrigin(0.5);
          if (orig.anim && this.anims.exists(orig.anim)) img.play(orig.anim);
          img.setScale(orig.size / (Math.max(img.width, img.height) || 1));
          if (orig.angle) img.setAngle(orig.angle);
          img.origSpin = orig.spin || 0;
          img.faceLeft = !!orig.faceLeft;
          if (orig.ground) img.setOrigin(0.5, 1);
        } else {
          const key = `proj_${pr.spec.tex}`;
          img = this.add.image(0, 0, this.textures.exists(key) ? key : '__DEFAULT').setOrigin(0.5);
          img.setScale(pr.spec.kind === 'rocket' ? 0.75 : pr.spec.kind === 'pellet' ? 0.5 : pr.spec.kind === 'bottle' ? 1 : 0.55);
        }
        img.setFlipX(img.faceLeft ? pr.vx > 0 : pr.vx < 0);
        // Line the shot up with the barrel as drawn this frame (aim pose / recoil
        // move the gun a little; the sim keeps a fixed muzzle height)
        img.offY = 0;
        const m = this.views.get(pr.owner)?.muzzle?.();
        if (m) img.offY = Phaser.Math.Clamp(m.y - (stage.groundY(pr.z) - pr.y), -60, 60);
        this.projViews.set(pr.id, img);
      }
      const x = pr.px + (pr.x - pr.px) * alpha;
      const z = pr.pz + (pr.z - pr.pz) * alpha;
      img.setPosition(x, stage.groundY(z) - pr.y + img.offY).setDepth(stage.depth(z) + 2);
      if (pr.spec.kind === 'bottle') {
        img.angle += Math.sign(pr.vx) * 14;
        img.setTint(pr.reflected ? 0xffe27a : 0xffffff);
      }
      if (img.origSpin) img.angle += Math.sign(pr.vx || 1) * img.origSpin;
      if (pr.reflected && pr.spec.reflectable) img.setTint(0xffe27a);
      // Landing marker for things falling / lobbed onto the road
      if (pr.spec.marker && !pr.reflected) {
        let mk = this.markViews.get(pr.id);
        if (!mk) {
          mk = this.add.ellipse(0, 0, 70, 18).setStrokeStyle(3, 0xff3b2f, 0.9).setFillStyle(0xff3b2f, 0.18);
          this.markViews.set(pr.id, mk);
        }
        const k = Math.min(1, Math.max(0.3, 1 - pr.y / 600));
        mk.setPosition(pr.tx, stage.groundY(pr.tz)).setScale(0.6 + k * 0.5).setDepth(stage.depth(pr.tz) - 1);
      }
      if (pr.spec.kind === 'rocket' && Math.random() < 0.6) {
        const puff = this.add.circle(x - Math.sign(pr.vx) * 26, stage.groundY(z) - pr.y + img.offY, 6, 0xdddddd, 0.6).setDepth(stage.depth(z) + 1);
        this.tweens.add({ targets: puff, scale: 3, alpha: 0, duration: 420, onComplete: () => puff.destroy() });
      }
    }
    // 1Kla$'s microphone hangs on a cord from his hand
    if (!this.cordGfx) this.cordGfx = this.add.graphics().setDepth(1100);
    this.cordGfx.clear();
    for (const pr of this.world.projectiles) {
      if (!pr.spec.orbit) continue;
      const o = this.world.fighters.find((f) => f.id === pr.owner);
      const v = o && this.views.get(o.id);
      if (!v) continue;
      const img = this.projViews.get(pr.id);
      this.cordGfx.lineStyle(3, 0x111111, 0.9).lineBetween(v.visual.x, v.visual.y - (v.bodyH || 260) * 0.55, img?.x ?? pr.x, img?.y ?? stage.groundY(pr.z) - pr.y);
    }
    for (const [id, img] of this.projViews) {
      if (!seen.has(id)) {
        img.destroy();
        this.projViews.delete(id);
      }
    }
    for (const [id, mk] of this.markViews) {
      const pr = this.world.projectiles.find((q) => q.id === id);
      if (!pr || pr.reflected) {
        mk.destroy();
        this.markViews.delete(id);
      }
    }
  }

  renderAirships(alpha) {
    const seen = new Set();
    for (const s of this.world.airships) {
      seen.add(s.id);
      let spr = this.airshipViews.get(s.id);
      if (!spr) {
        spr = this.add.sprite(0, 0, 'dirig_0').setOrigin(0.5).setScale(1.1).setDepth(60);
        if (this.anims.exists('dirig_fly')) spr.play('dirig_fly');
        // Art faces left
        spr.setFlipX(s.vx > 0);
        this.airshipViews.set(s.id, spr);
      }
      const x = s.px + (s.x - s.px) * alpha;
      spr.setPosition(x, ROAD_Y - s.y + Math.sin(this.time.now / 600) * 6);
    }
    for (const [id, spr] of this.airshipViews) {
      if (!seen.has(id)) {
        spr.destroy();
        this.airshipViews.delete(id);
      }
    }
  }

  anvilPieces(x, z) {
    const y = stage.groundY(z) - 30;
    for (let i = 0; i < 6; i += 1) {
      const key = this.textures.exists(`little_nakovalnya_${i % 10}`) ? `little_nakovalnya_${i % 10}` : '__DEFAULT';
      const p = this.add.image(x, y, key).setScale(0.45).setDepth(stage.depth(z) + 1);
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-90, 90),
        y: y + Phaser.Math.Between(-80, 20),
        angle: Phaser.Math.Between(-360, 360),
        alpha: 0,
        duration: 500 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  bottleTexture() {
    if (this.textures.exists('proj_bottle')) return;
    const t = this.textures.createCanvas('proj_bottle', 14, 36);
    const c = t.getContext();
    c.fillStyle = '#2f6b2a';
    c.fillRect(3, 12, 8, 22);
    c.fillRect(5, 3, 4, 10);
    c.fillStyle = '#9fd18f';
    c.fillRect(4, 14, 2, 16);
    c.fillStyle = '#c9a26a';
    c.fillRect(4, 0, 6, 4);
    c.fillStyle = '#e8e2c8';
    c.fillRect(3, 18, 8, 7);
    t.refresh();
  }

  shards(x, z, y) {
    const sy = stage.groundY(z) - y;
    for (let i = 0; i < 8; i += 1) {
      const s = this.add.rectangle(x, sy, Phaser.Math.Between(3, 7), 3, i % 2 ? 0x2f6b2a : 0x9fd18f).setDepth(stage.depth(z) + 3);
      this.tweens.add({
        targets: s,
        x: x + Phaser.Math.Between(-50, 50),
        y: sy + Phaser.Math.Between(-30, 40),
        angle: Phaser.Math.Between(-200, 200),
        alpha: 0,
        duration: 320 + Math.random() * 160,
        onComplete: () => s.destroy(),
      });
    }
  }

  onShot(ev) {
    const w = WEAPONS[ev.weapon];
    const v = this.views.get(ev.id);
    v?.recoil?.();
    if (w?.sfx) this.sound.play(w.sfx, { volume: ev.weapon === 3 ? 0.25 : 0.45 });
    const m = v?.muzzle?.();
    if (m) {
      const f = this.add.circle(m.x, m.y, ev.weapon === 2 ? 16 : 11, 0xfff2a8, 0.95).setDepth(1300);
      this.tweens.add({ targets: f, scale: 1.8, alpha: 0, duration: 70, onComplete: () => f.destroy() });
    }
    if (ev.weapon === 2) this.shake(90, 5);
    else if (ev.weapon === 4) this.shake(160, 7);
    else this.shake(40, 1.5);
  }

  onExplode(ev) {
    const y = stage.groundY(ev.z) - ev.y * 0.5;
    if (this.anims.exists('explosion_anim')) {
      const ex = this.add.sprite(ev.x, y, 'explosion_0').setScale(2.4).setDepth(1400);
      ex.play('explosion_anim');
      ex.once('animationcomplete', () => ex.destroy());
    }
    const flash = this.add.circle(ev.x, y, 40, 0xffe0a0, 0.9).setDepth(1401);
    this.tweens.add({ targets: flash, scale: 4, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    this.sound.play('explosion', { volume: 0.55 });
    this.shake(320, 12);
    this.punch(0.05);
    this.dust(ev.x, ev.z, 2.4);
  }

  onCrateBreak(ev) {
    this.sound.play('superudar', { volume: 0.35, rate: 1.2 });
    this.shake(120, 4);
    this.splinters(ev.x, ev.z, 12);
  }

  splinters(x, z, n) {
    const y = stage.groundY(z) - 34;
    for (let i = 0; i < n; i += 1) {
      const sp = this.add
        .rectangle(x + Phaser.Math.Between(-20, 20), y + Phaser.Math.Between(-20, 20), Phaser.Math.Between(6, 16), 4, i % 2 ? 0x9a6532 : 0x6b4321)
        .setDepth(stage.depth(z) + 1)
        .setAngle(Phaser.Math.Between(0, 180));
      this.tweens.add({
        targets: sp,
        x: sp.x + Phaser.Math.Between(-70, 70),
        y: sp.y + Phaser.Math.Between(-60, 30),
        angle: sp.angle + Phaser.Math.Between(-300, 300),
        alpha: 0,
        duration: 420 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => sp.destroy(),
      });
    }
  }

  // ------------------------------------------------------------------ shop + weapons HUD

  toggleShop(force) {
    this.shopOpen = force ?? !this.shopOpen;
    this.keys.shopOpen = this.shopOpen;
    this.shop.setVisible(this.shopOpen);
    this.sound.play('beep', { volume: 0.2 });
  }

  buildShop() {
    const font = { fontFamily: 'Russo One, Impact, sans-serif', color: '#ffffff' };
    const W = 290;
    const rowH = 44;
    const H = 64 + SHOP.length * rowH + 30;
    this.shop = this.add.container(16, 96).setScrollFactor(0).setDepth(5200).setVisible(false);
    const bg = this.add.rectangle(0, 0, W, H, 0x101015, 0.92).setOrigin(0).setStrokeStyle(2, 0xf0c040);
    const title = this.add.text(14, 12, 'ЗАКУПКА', { ...font, fontSize: '20px', color: '#f0c040' });
    this.shopMoney = this.add.text(W - 14, 15, '', { ...font, fontSize: '15px' }).setOrigin(1, 0);
    const hint = this.add.text(14, H - 22, '1–7 купить · B / Esc закрыть · бой идёт', { fontFamily: 'sans-serif', fontSize: '11px', color: '#9a9a9a' });
    this.shop.add([bg, title, this.shopMoney, hint]);
    this.shopRows = SHOP.map((item, i) => {
      const y = 48 + i * rowH;
      const box = this.add.rectangle(8, y, W - 16, rowH - 6, 0x24242c).setOrigin(0).setStrokeStyle(1, 0x444450);
      const num = this.add.text(18, y + 19, String(i + 1), { ...font, fontSize: '16px', color: '#f0c040' }).setOrigin(0, 0.5);
      const helper = item.helperSlot != null ? this.world.helpers?.[item.helperSlot] : null;
      const icon = item.weapon && this.textures.exists(WEAPON_DEFS[item.weapon]?.key)
        ? this.add.image(64, y + 19, WEAPON_DEFS[item.weapon].key)
        : helper && this.textures.exists(enemyPartTextureKey(VARIANTS[helper]?.skin || helper, 'head'))
          ? this.add.image(64, y + 19, enemyPartTextureKey(VARIANTS[helper]?.skin || helper, 'head'))
          : this.add.image(64, y + 19, this.textures.exists('1up_0') ? '1up_0' : '__DEFAULT');
      const big = Math.max(icon.width, icon.height) || 1;
      icon.setScale((item.weapon ? 54 : 30) / big);
      if (item.helperSlot != null && !helper) icon.setAlpha(0.25);
      const title = item.helperSlot != null ? (helper ? `Позвать: ${HELPER_NAME[helper]}` : 'Помощник ???') : item.title;
      const name = this.add.text(100, y + 8, title, { ...font, fontSize: '14px' });
      const subText = item.weapon
        ? `+${WEAPONS[item.weapon].pack} патронов`
        : item.helperSlot != null
          ? helper ? 'дерётся за тебя 25 секунд' : 'пройди главы дальше — откроется'
          : `+${item.heal} HP`;
      const sub = this.add.text(100, y + 25, subText, {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: '#a0a0a0',
      });
      const price = this.add.text(W - 18, y + 19, `${item.price} К`, { ...font, fontSize: '15px', color: '#f0c040' }).setOrigin(1, 0.5);
      this.shop.add([box, num, icon, name, sub, price]);
      return { item, price };
    });
    this.tagUi(this.shop);
    for (const o of this.shop.list) this.tagUi(o);
  }

  /** Right-hand weapon column: fists + every owned gun with ammo. */
  updateWeaponHud() {
    const p = this.player;
    const owned = WEAPON_SLOTS.filter((w) => w === 0 || p.weapons[w] > 0);
    const sig = owned.map((w) => `${w}:${p.weapons[w] || 0}`).join(',') + `|${p.weapon}|${VIEW_W}`;
    if (sig === this.weaponSig) return;
    this.weaponSig = sig;
    this.weaponHud?.destroy(true);
    const font = { fontFamily: 'Russo One, Impact, sans-serif', color: '#ffffff' };
    const c = this.add.container(VIEW_W - 16, 128).setScrollFactor(0).setDepth(5000);
    owned.forEach((w, i) => {
      const y = i * 58;
      const on = p.weapon === w;
      const box = this.add.rectangle(0, y, 150, 50, on ? 0x2c2610 : 0x000000, on ? 0.85 : 0.45).setOrigin(1, 0).setStrokeStyle(on ? 2 : 1, on ? 0xf0c040 : 0x555555);
      const key = this.add.text(-142, y + 4, String(WEAPON_SLOTS.indexOf(w) + 1), { ...font, fontSize: '12px', color: '#f0c040' });
      c.add([box, key]);
      if (w === 0) {
        c.add(this.add.text(-75, y + 25, 'КУЛАКИ', { ...font, fontSize: '15px', color: on ? '#ffd23f' : '#cccccc' }).setOrigin(0.5));
      } else {
        const tex = WEAPON_DEFS[w]?.key;
        if (tex && this.textures.exists(tex)) {
          const im = this.add.image(-96, y + 25, tex);
          im.setScale(66 / (Math.max(im.width, im.height) || 1));
          c.add(im);
        }
        c.add(this.add.text(-10, y + 25, String(p.weapons[w]), { ...font, fontSize: '18px', color: on ? '#ffd23f' : '#ffffff' }).setOrigin(1, 0.5));
      }
    });
    c.add(this.add.text(0, owned.length * 58 + 2, 'Q / E · 1–5', { fontFamily: 'sans-serif', fontSize: '11px', color: '#ffffffaa' }).setOrigin(1, 0));
    this.tagUi(c);
    for (const o of c.list) this.tagUi(o);
    this.weaponHud = c;
  }

  /** Big centred banner (screen space). */
  banner(title, sub, ms = 1200, danger = false) {
    const b = this.hud.banner;
    const s = this.hud.bannerSub;
    this.tweens.killTweensOf([b, s]);
    b.setText(title).setColor(danger ? '#ff4d3d' : '#ffffff').setAlpha(1).setScale(1.4);
    s.setText(sub || '').setAlpha(sub ? 1 : 0);
    this.tweens.add({ targets: b, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [b, s], alpha: 0, delay: ms, duration: 400 });
  }

  renderPickups(alpha) {
    const seen = new Set();
    for (const it of this.world.pickups) {
      seen.add(it.id);
      let img = this.pickupViews.get(it.id);
      if (!img) {
        let key = '1up_0';
        let size = 54;
        if (it.kind === 'kosar') {
          key = it.amount >= 10 ? '10 kosarei_0' : it.amount >= 5 ? '5 kosarei_0' : 'kosar_0';
          size = it.amount >= 5 ? 44 : 34;
        } else if (it.kind === 'gun') {
          key = WEAPON_DEFS[it.weapon]?.key || '1up_0';
          size = 60;
        } else if (it.kind === 'buff') {
          key = BUFF_ART[it.buff] || '1up_0';
          size = 50;
        } else if (it.kind === 'heal' && this.textures.exists('item_shawarma')) {
          // Food: shawarma for big heals, instant noodles for small ones
          key = it.amount >= 50 ? 'item_shawarma' : 'item_doshik';
          size = it.amount >= 50 ? 62 : 48;
        }
        if (!this.textures.exists(key)) key = '__DEFAULT';
        img = this.add.image(0, 0, key).setOrigin(0.5, 1);
        const big = Math.max(img.width || 40, img.height || 40);
        img.setScale(size / big);
        this.pickupViews.set(it.id, img);
      }
      const x = it.px + (it.x - it.px) * alpha;
      const y = it.py + (it.y - it.py) * alpha;
      const z = it.pz + (it.z - it.pz) * alpha;
      const bob = it.y === 0 ? Math.sin(this.time.now / 180) * 4 : 0;
      img.setPosition(x, stage.groundY(z) - y - 6 + bob).setDepth(stage.depth(z));
    }
    for (const [id, img] of this.pickupViews) {
      if (!seen.has(id)) {
        img.destroy();
        this.pickupViews.delete(id);
      }
    }
  }

  /** Where the story goes after this map (a chosen side road, or the map's own next). */
  nextMapId() {
    if (!this.map) return null;
    return GameState.progress.routeNext?.[this.map.id] || this.map.next || null;
  }

  /** Results screen -> the next map (route: pick one of the two roads). */
  goNext(pick) {
    let id = this.nextMapId() || this.map?.id;
    const r = this.map?.route;
    if (r && pick != null) {
      const opt = r.choose[pick];
      if (this.testArena == null) {
        chooseRoute(opt.id, r.then, r.choose[1 - pick]?.id);
        markDone(this.map.id, opt.id);
      }
      id = opt.id;
    }
    // Next map goes through the loading screen: its kit pieces must be loaded first
    this.sound.stopAll();
    this.scene.start('Preload', { next: 'Brawl', map: id, onExit: this.onExit });
  }

  showResults() {
    if (this.finished) return;
    this.finished = true;
    const st = this.world.stats;
    const secs = Math.round(this.world.tick / 60);
    const hpK = this.player.hp / this.player.maxHp;
    // Grade: fast + healthy + big combos
    const score = (secs < 150 ? 2 : secs < 220 ? 1 : 0) + (hpK > 0.6 ? 2 : hpK > 0.3 ? 1 : 0) + (st.maxCombo >= 25 ? 2 : st.maxCombo >= 12 ? 1 : 0);
    const grade = score >= 6 ? 'S' : score >= 4 ? 'A' : score >= 2 ? 'B' : 'C';
    const test = this.testArena != null;
    if (this.map && !test) saveBest(this.map.id, grade, secs);
    if (this.map && this.map.id !== 'sandbox' && !test) {
      const bossKinds = [...new Set(this.world.fighters.filter((f) => FIGHTERS[f.kind]?.boss && f.dead).map((f) => f.kind))];
      // Boss rush only counts the bosses (the gallery), not story progress
      if (this.map.hidden) {
        for (const k of bossKinds) if (!GameState.progress.bosses.includes(k)) GameState.progress.bosses.push(k);
        SaveLoad.save();
      } else markDone(this.map.id, this.nextMapId(), bossKinds);
    }
    // Challenges and the bank (косари carried out of the map buy upgrades in the menu)
    let chLines = '';
    if (this.map && !this.map.hidden && this.map.id !== 'sandbox') {
      const run = { secs, damageTaken: st.damageTaken, shots: st.shots || 0 };
      const chs = challengesFor(this.map);
      const met = chs.filter((c) => c.ok(run)).map((c) => c.id);
      if (!test) bankRun(this.map.id, this.player.money, met);
      chLines = `\n${chs.map((c) => `${met.includes(c.id) ? '★' : '☆'} ${c.text}`).join('\n')}\nВ копилку: +${this.player.money} К (всего ${GameState.progress.bank})\n`;
    }
    const route = this.map?.route;
    const nextLine = route
      ? `Развилка: 1 — ${route.choose[0].label} · 2 — ${route.choose[1].label}`
      : this.nextMapId()
        ? 'Enter — дальше'
        : 'Enter — ещё раз';
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    this.hud.results
      .setText(
        `${this.map?.name || 'Карта'} пройдена!\n\n` +
          `Время: ${mm}:${ss}\nУложено: ${this.world.kills}\nМакс. комбо: ${st.maxCombo}\nПолучено урона: ${st.damageTaken}\n\n` +
          `Оценка: ${grade}\n${chLines}\n${nextLine} · Esc — меню`,
      )
      .setVisible(true)
      .setAlpha(0);
    this.tweens.add({ targets: this.hud.results, alpha: 1, duration: 400 });
    this.sound.stopByKey('game');
    this.sound.stopByKey('boss');
    if (GameState.musicPlay) this.sound.play('credits', { volume: 0.4 });
  }

  popText(x, y, text, color, size = 20) {
    const t = this.add
      .text(x, y, text, {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: `${size}px`,
        color,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1700);
    this.tweens.add({
      targets: t,
      y: y - 46,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  onPerfect(ev) {
    const y = stage.groundY(ev.z) - 250;
    this.popText(ev.x, y, 'УКЛОН!', '#7fe3ff', 34);
    this.sound.play('beep', { volume: 0.3, rate: 0.6 });
    this.slowOverlay.setAlpha(0.22);
    this.views.get(ev.id)?.flash(80);
  }

  onRage(ev) {
    const y = stage.groundY(ev.z);
    this.shake(320, 12);
    this.punch(0.07);
    this.sound.play('explosion2', { volume: 0.5 });
    const flash = this.tagUi(this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff, 0.55).setOrigin(0).setScrollFactor(0).setDepth(4800));
    this.tweens.add({ targets: flash, alpha: 0, duration: 260, onComplete: () => flash.destroy() });
    for (let i = 0; i < 2; i += 1) {
      const ring = this.add.ellipse(ev.x, y, 60, 18).setStrokeStyle(6 - i * 2, i ? 0xffffff : 0xffb627, 1).setDepth(stage.depth(ev.z) + 1);
      this.tweens.add({
        targets: ring,
        scaleX: 7.5 - i * 2,
        scaleY: 7.5 - i * 2,
        alpha: 0,
        duration: 420 + i * 120,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
    this.dust(ev.x, ev.z, 2.2);
  }

  dust(x, z, size) {
    const y = stage.groundY(z);
    for (let i = 0; i < 4; i += 1) {
      const d = this.add
        .circle(x + Phaser.Math.Between(-20, 20), y - 4, 6 * size + Math.random() * 6, 0xc9b28c, 0.55)
        .setDepth(stage.depth(z) - 0.5);
      this.tweens.add({
        targets: d,
        x: d.x + Phaser.Math.Between(-30, 30) * size,
        y: y - 10 - Math.random() * 16 * size,
        scale: 1.8,
        alpha: 0,
        duration: 260 + Math.random() * 120,
        onComplete: () => d.destroy(),
      });
    }
  }

  hurtFlash() {
    this.hurtOverlay.setAlpha(0.32);
    this.tweens.add({ targets: this.hurtOverlay, alpha: 0, duration: 260 });
  }

  // ------------------------------------------------------------------ HUD

  buildHud() {
    const font = { fontFamily: 'Russo One, Impact, sans-serif', color: '#ffffff' };
    this.hud = {
      hpBack: this.add.rectangle(0, 0, 260, 18, 0x000000, 0.55).setOrigin(0, 0),
      hpFill: this.add.rectangle(0, 0, 254, 12, 0x5fd35f, 1).setOrigin(0, 0),
      hpText: this.add.text(0, 0, '', { ...font, fontSize: '14px' }),
      meterBack: this.add.rectangle(0, 0, 200, 10, 0x000000, 0.55).setOrigin(0, 0),
      meterFill: this.add.rectangle(0, 0, 196, 6, 0xff8a2a, 1).setOrigin(0, 0),
      meterText: this.add.text(0, 0, '', { ...font, fontSize: '12px', color: '#ffb627' }),
      kills: this.add.text(0, 0, '', { ...font, fontSize: '18px' }),
      moneyIcon: this.add.image(0, 0, this.textures.exists('kosar_0') ? 'kosar_0' : '__DEFAULT').setOrigin(0, 0.5),
      money: this.add.text(0, 0, '', { ...font, fontSize: '20px', color: '#ffd23f', stroke: '#000000', strokeThickness: 4 }).setOrigin(0, 0.5),
      shopHint: this.add.text(0, 0, 'B — закупка', { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffffbb' }).setOrigin(0, 0.5),
      combo: this.add.text(0, 0, '', { ...font, fontSize: '42px', color: '#ffd23f', stroke: '#000000', strokeThickness: 6 }).setOrigin(1, 0),
      fps: this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffffaa' }).setOrigin(1, 0),
      help: this.add.text(0, 0, isTouchDevice() ? '' : 'WASD ходить · Space×2 сальто · J удар/выстрел · K нога · L рывок · J+K ярость · в упор — захват · Q/E оружие · B закупка · P пауза · Esc меню', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 1),
      status: this.add.text(0, 0, '', { ...font, fontSize: '16px', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5, 0),
      go: this.add.text(0, 0, 'ВПЕРЁД →', { ...font, fontSize: '34px', color: '#ffd23f', stroke: '#000000', strokeThickness: 6 }).setOrigin(1, 0.5).setVisible(false),
      banner: this.add.text(0, 0, '', { ...font, fontSize: '56px', stroke: '#000000', strokeThickness: 8 }).setOrigin(0.5).setAlpha(0),
      bannerSub: this.add.text(0, 0, '', { ...font, fontSize: '22px', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setAlpha(0),
      bossName: this.add.text(0, 0, 'БОСС', { ...font, fontSize: '18px', color: '#ff4d3d', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5, 1).setVisible(false),
      bossBack: this.add.rectangle(0, 0, 420, 16, 0x000000, 0.6).setOrigin(0.5, 0).setVisible(false),
      bossFill: this.add.rectangle(0, 0, 414, 10, 0xe2463b, 1).setOrigin(0, 0).setVisible(false),
      results: this.add.text(0, 0, '', {
        ...font,
        fontSize: '26px',
        align: 'center',
        backgroundColor: '#000000cc',
        padding: { x: 34, y: 24 },
      }).setOrigin(0.5).setVisible(false),
      dead: this.add.text(0, 0, 'Тебя унесли.\nR — заново · Esc — меню', {
        ...font,
        fontSize: '30px',
        align: 'center',
        backgroundColor: '#000000cc',
        padding: { x: 22, y: 14 },
      }).setOrigin(0.5).setVisible(false),
    };
    this.hurtOverlay = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xff0000, 1).setOrigin(0).setAlpha(0);
    this.slowOverlay = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x3aa8ff, 1).setOrigin(0).setAlpha(0);
    for (const o of [...Object.values(this.hud), this.hurtOverlay, this.slowOverlay]) this.tagUi(o.setScrollFactor(0).setDepth(5000));
    this.slowOverlay.setDepth(4850);
    this.hurtOverlay.setDepth(4900);
    this.comboShown = 0;
    this.buildShop();
    this.layoutHud();
  }

  layoutHud() {
    const h = this.hud;
    h.hpBack.setPosition(16, 16);
    h.hpFill.setPosition(19, 19);
    h.hpText.setPosition(282, 15);
    h.meterBack.setPosition(16, 38);
    h.meterFill.setPosition(18, 40);
    h.meterText.setPosition(222, 36);
    h.kills.setPosition(16, 54);
    h.moneyIcon.setPosition(16, 88).setScale(34 / (Math.max(h.moneyIcon.width, 1)));
    h.money.setPosition(58, 88);
    h.shopHint.setPosition(130, 89);
    this.weaponSig = null;
    h.combo.setPosition(VIEW_W - 20, 60);
    h.fps.setPosition(VIEW_W - 8, 6);
    h.help.setPosition(VIEW_W / 2, VIEW_H - 8);
    h.dead.setPosition(VIEW_W / 2, VIEW_H / 2);
    h.status.setPosition(VIEW_W / 2, 12);
    h.go.setPosition(VIEW_W - 24, VIEW_H * 0.42);
    h.banner.setPosition(VIEW_W / 2, VIEW_H * 0.3);
    h.bannerSub.setPosition(VIEW_W / 2, VIEW_H * 0.3 + 48);
    h.bossName.setPosition(VIEW_W / 2, VIEW_H - 44);
    h.bossBack.setPosition(VIEW_W / 2, VIEW_H - 42);
    h.bossFill.setPosition(VIEW_W / 2 - 207, VIEW_H - 39);
    h.results.setPosition(VIEW_W / 2, VIEW_H / 2);
    this.hurtOverlay.setSize(VIEW_W, VIEW_H);
    this.slowOverlay.setSize(VIEW_W, VIEW_H);
  }

  updateHud() {
    const h = this.hud;
    const p = this.player;
    const k = Math.max(0, p.hp / p.maxHp);
    h.hpFill.width = 254 * k;
    h.hpFill.fillColor = k > 0.5 ? 0x5fd35f : k > 0.25 ? 0xffc23f : 0xe2463b;
    h.hpText.setText(`${p.hp}`);
    h.money.setText(`× ${p.money}`);
    this.updateWeaponHud();
    if (this.shopOpen) {
      this.shopMoney.setText(`${p.money} К`);
      for (const r of this.shopRows) r.price.setColor(p.money >= r.item.price ? '#f0c040' : '#666666');
    }
    const mk = Math.min(1, p.meter / METER_MAX);
    h.meterFill.width = 196 * mk;
    const full = mk >= 1;
    h.meterFill.fillColor = full ? (Math.floor(this.time.now / 160) % 2 ? 0xffe14a : 0xff5a1f) : 0xff8a2a;
    h.meterText.setText(full ? 'ЯРОСТЬ: J+K или I' : 'ярость');
    h.kills.setText(`Уложено: ${this.world.kills}   Врагов: ${this.world.enemiesAlive()}`);
    if (p.combo >= 2) {
      if (p.combo !== this.comboShown) {
        h.combo.setScale(1.35);
        this.tweens.add({ targets: h.combo, scale: 1, duration: 140, ease: 'Back.easeOut' });
      }
      h.combo.setText(`${p.combo} HIT`).setVisible(true);
    } else {
      h.combo.setVisible(false);
    }
    this.comboShown = p.combo;
    h.fps.setText(`${Math.round(this.fpsAvg)} fps · tick ${this.world.tick}`);
    h.dead.setVisible(p.dead && !this.finished);

    // Map progress
    if (this.director instanceof MapDirector) {
      const s = this.director.status();
      if (s.state === 'locked' && s.goal) h.status.setText(`Арена ${s.arena}/${s.arenas} · ${s.goal}`);
      else if (s.state === 'locked') h.status.setText(`${s.boss ? 'Босс' : `Арена ${s.arena}/${s.arenas}`} · Волна ${s.wave}/${s.waves} · Врагов: ${s.left}`);
      else if (s.state === 'travel') h.status.setText(`${this.map.name} · Арена ${s.arena}/${s.arenas}`);
      else h.status.setText(`${this.map.name} — пройдено`);
      const showGo = s.state === 'travel' && s.arena > 1 && this.world.enemiesAlive() === 0;
      h.go.setVisible(showGo && Math.floor(this.time.now / 300) % 2 === 0);
    }
    const boss = this.world.fighters.find((f) => FIGHTERS[f.kind]?.boss && !f.dead);
    const bossOn = !!boss;
    h.bossName.setVisible(bossOn);
    h.bossBack.setVisible(bossOn);
    h.bossFill.setVisible(bossOn);
    if (boss) {
      h.bossFill.width = 414 * Math.max(0, boss.hp / boss.maxHp);
      h.bossName.setText((FIGHTERS[boss.kind].title || 'Босс').toUpperCase());
      const off = boss.away || boss.retreating;
      h.bossFill.setAlpha(off ? 0.35 : 1);
    }
  }
}

/** Stable numeric seed from a map id. */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

/** Hero stats on top of the base player fighter (deterministic: set once at spawn). */
function applyHero(p, heroId) {
  const h = getHero(heroId);
  p.hero = h.id;
  p.hp = p.maxHp = Math.round(p.maxHp * h.hp);
  p.speedMul = h.speed;
  p.dmgMul = h.dmg;
  if (h.moves) p.moves = { ...FIGHTERS.player.moves, ...h.moves };
  if (h.startWeapon) {
    p.weapons[h.startWeapon] = (p.weapons[h.startWeapon] || 0) + (h.startAmmo || 12);
    p.weapon = h.startWeapon;
  }
}
