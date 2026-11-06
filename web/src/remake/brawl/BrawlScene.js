import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';
import { VIEW_W, VIEW_H } from '../game/constants.js';
import { createParallax } from '../game/parallax.js';
import { World } from '../sim/World.js';
import { SandboxDirector } from '../sim/sandbox.js';
import { MapDirector } from '../sim/director.js';
import { FIGHTERS } from '../sim/fighters.js';
import { MAPS, DEFAULT_MAP } from '../maps/index.js';
import { DT, METER_MAX } from '../sim/constants.js';
import { MOVES } from '../sim/moves.js';
import { FighterView } from './FighterView.js';
import { KeyboardInput } from './keyboard.js';
import { stage, LANE_DEPTH } from './stage.js';

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

    this.parallax = createParallax(this, {
      factors: { clouds: 0.06, far: 0.18, mid: 0.35, fog: 0.45, world: 1, grass: 1.18 },
      grassDepth: 2000,
    });

    this.worldLen = this.map ? this.map.length : SANDBOX_LEN;
    this.world = new World({
      seed: (Date.now() & 0xffffff) | 1,
      bounds: { xMin: 0, xMax: this.worldLen, zMin: 0, zMax: LANE_DEPTH },
    });
    const start = this.map?.start || { x: 420, z: LANE_DEPTH * 0.55 };
    this.player = this.world.spawn('player', start.x, Math.min(LANE_DEPTH, start.z), { slot: 0 });
    this.director = this.map ? new MapDirector(this.world, this.map) : new SandboxDirector(this.world);
    this.lock = null;
    this.finished = false;
    this.startTick = 0;
    this.pickupViews = new Map();
    this.keys = new KeyboardInput(this);

    this.camX = Math.max(0, this.player.x - VIEW_W * 0.4);
    this.cameras.main.setScroll(this.camX, 0);

    this.fx = this.add.group();
    this.buildHud();

    if (GameState.musicPlay) {
      this.sound.stopAll();
      this.sound.play('game', { loop: true, volume: 0.4 });
    }

    const kb = this.input.keyboard;
    kb.on('keydown-P', () => this.togglePause());
    kb.on('keydown-ENTER', () => {
      if (this.finished) this.scene.restart();
      else this.togglePause();
    });
    kb.on('keydown-ESC', () => {
      this.sound.stopAll();
      this.onExit?.();
    });
    kb.on('keydown-R', () => {
      if (this.player.dead) this.scene.restart();
    });

    this._onResize = () => {
      this.parallax.resize();
      this.layoutHud();
    };
    this.game.events.on('remake-resize', this._onResize);
    this.events.once('shutdown', () => {
      this.game.events.off('remake-resize', this._onResize);
      this.sound.stopByKey('game');
      this.sound.stopByKey('boss');
    });
    if (this.map) this.banner(this.map.name, 'Иди вперёд →', 1800);

    window.__brawl = this;
  }

  togglePause() {
    if (this.player.dead || this.finished) return;
    this.paused = !this.paused;
    this.game.events.emit('remake-pause', this.paused);
  }

  update(_time, delta) {
    const frameMs = Math.min(delta, 100);
    this.fpsAvg += (1000 / Math.max(1, delta) - this.fpsAvg) * 0.05;
    if (this.paused) return;

    // ---- Fixed-tick simulation
    this.acc += frameMs / 1000;
    let steps = 0;
    while (this.acc >= DT && steps < MAX_STEPS) {
      this.world.setInput(0, this.keys.read());
      this.world.step();
      this.director.step();
      this.acc -= DT;
      steps += 1;
    }
    if (steps >= MAX_STEPS) this.acc = 0;
    if (steps > 0) this.keys.consumed();
    const alpha = this.acc / DT;
    const frozen = this.world.hitstop > 0;

    this.drainEvents();

    // ---- Views follow sim fighters
    const alive = new Set();
    for (const f of this.world.fighters) {
      alive.add(f.id);
      let v = this.views.get(f.id);
      if (!v) {
        v = new FighterView(this, f);
        this.views.set(f.id, v);
      }
      const slowK = this.world.slowmo > 0 && f.team !== 'player' ? 0.5 : 1;
      v.render(f, frozen ? 1 : alpha, frozen ? 0 : (frameMs / 1000) * slowK, frameMs);
    }
    for (const [id, v] of this.views) {
      if (!alive.has(id)) {
        v.destroy();
        this.views.delete(id);
      }
    }
    this.renderPickups(alpha);

    this.updateCamera(frameMs / 1000, alpha);
    this.updateHud();
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
    this.camX += (target - this.camX) * (1 - Math.exp(-dt * 6));

    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt * 1000;
      const amp = this.shakeAmp * Math.max(0, this.shakeT / this.shakeDur);
      sx = (Math.random() * 2 - 1) * amp;
      sy = (Math.random() * 2 - 1) * amp;
    }
    this.cameras.main.setScroll(Math.round(this.camX + sx), Math.round(sy));
    this.parallax.update(this.camX + sx, 0);
  }

  shake(ms, amp) {
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
          this.sound.play('warning', { volume: 0.25 });
          break;
        case 'arenaClear':
          this.lock = null;
          if (!ev.boss) this.banner('ЧИСТО!', 'Вперёд →', 1200);
          this.sound.play('cash', { volume: 0.4 });
          break;
        case 'go':
          this.goT = 0;
          break;
        case 'bossDown':
          this.shake(500, 14);
          this.sound.play('explosion', { volume: 0.5 });
          this.sound.stopByKey('boss');
          break;
        case 'mapComplete':
          this.time.delayedCall(1400, () => this.showResults());
          break;
        case 'pickup':
          this.sound.play('+life', { volume: 0.45 });
          this.popText(ev.x, stage.groundY(ev.z) - 120, `+${ev.amount}`, '#7dff7a', 30);
          break;
        case 'spawn':
          if (ev.from === 'drop') this.sound.play('beep', { volume: 0.1, rate: 0.5 });
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

  onHit(ev) {
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
    }
    this.sound.play('hit', { volume: heavy ? 0.6 : 0.42, rate: heavy ? 0.9 : 1 + Math.random() * 0.15 });
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
        const key = this.textures.exists('1up_0') ? '1up_0' : '__DEFAULT';
        img = this.add.image(0, 0, key).setOrigin(0.5, 1);
        const h = img.height || 40;
        img.setScale(Math.min(1.2, 54 / h));
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

  showResults() {
    if (this.finished) return;
    this.finished = true;
    const st = this.world.stats;
    const secs = Math.round(this.world.tick / 60);
    const hpK = this.player.hp / this.player.maxHp;
    // Grade: fast + healthy + big combos
    const score = (secs < 150 ? 2 : secs < 220 ? 1 : 0) + (hpK > 0.6 ? 2 : hpK > 0.3 ? 1 : 0) + (st.maxCombo >= 25 ? 2 : st.maxCombo >= 12 ? 1 : 0);
    const grade = score >= 6 ? 'S' : score >= 4 ? 'A' : score >= 2 ? 'B' : 'C';
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    this.hud.results
      .setText(
        `${this.map?.name || 'Карта'} пройдена!\n\n` +
          `Время: ${mm}:${ss}\nУложено: ${this.world.kills}\nМакс. комбо: ${st.maxCombo}\nПолучено урона: ${st.damageTaken}\n\n` +
          `Оценка: ${grade}\n\nEnter — ещё раз · Esc — меню`,
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
    this.sound.play('explosion2', { volume: 0.5 });
    const flash = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff, 0.55).setOrigin(0).setScrollFactor(0).setDepth(4800);
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
      combo: this.add.text(0, 0, '', { ...font, fontSize: '42px', color: '#ffd23f', stroke: '#000000', strokeThickness: 6 }).setOrigin(1, 0),
      fps: this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffffaa' }).setOrigin(1, 0),
      help: this.add.text(0, 0, 'WASD — ходить · Space ×2 — сальто · J удар · K нога · L/Shift рывок · J+K ярость · в упор к врагу — захват (J колено, K бросок) · P пауза · Esc меню', {
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
    for (const o of [...Object.values(this.hud), this.hurtOverlay, this.slowOverlay]) o.setScrollFactor(0).setDepth(5000);
    this.slowOverlay.setDepth(4850);
    this.hurtOverlay.setDepth(4900);
    this.comboShown = 0;
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
      if (s.state === 'locked') h.status.setText(`${s.boss ? 'Босс' : `Арена ${s.arena}/${s.arenas}`} · Волна ${s.wave}/${s.waves} · Врагов: ${s.left}`);
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
    if (boss) h.bossFill.width = 414 * Math.max(0, boss.hp / boss.maxHp);
  }
}
