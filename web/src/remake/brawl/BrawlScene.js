import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';
import { VIEW_W, VIEW_H } from '../game/constants.js';
import { createParallax } from '../game/parallax.js';
import { World } from '../sim/World.js';
import { SandboxDirector } from '../sim/sandbox.js';
import { DT } from '../sim/constants.js';
import { FighterView } from './FighterView.js';
import { KeyboardInput } from './keyboard.js';
import { stage, LANE_DEPTH } from './stage.js';

const WORLD_LEN = 7200;
/** Never run more than this many sim ticks per frame (avoid spiral of death after a stall). */
const MAX_STEPS = 6;

/**
 * Milestone 1 sandbox: fixed-tick sim + interpolated bone-puppet view on a
 * lane with depth. Crowd comes from both sides forever.
 */
export class BrawlScene extends Phaser.Scene {
  constructor() {
    super('Brawl');
  }

  init(data) {
    this.onExit = data?.onExit;
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

    this.world = new World({
      seed: (Date.now() & 0xffffff) | 1,
      bounds: { xMin: 0, xMax: WORLD_LEN, zMin: 0, zMax: LANE_DEPTH },
    });
    this.player = this.world.spawn('player', 420, LANE_DEPTH * 0.55, { slot: 0 });
    this.director = new SandboxDirector(this.world);
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
    kb.on('keydown-ENTER', () => this.togglePause());
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
    });

    window.__brawl = this;
  }

  togglePause() {
    if (this.player.dead) return;
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
      v.render(f, frozen ? 1 : alpha, frozen ? 0 : frameMs / 1000, frameMs);
    }
    for (const [id, v] of this.views) {
      if (!alive.has(id)) {
        v.destroy();
        this.views.delete(id);
      }
    }

    this.updateCamera(frameMs / 1000, alpha);
    this.updateHud();
  }

  updateCamera(dt, alpha) {
    const p = this.player;
    const px = p.px + (p.x - p.px) * alpha;
    const lead = p.facing * VIEW_W * 0.1;
    const target = Phaser.Math.Clamp(px - VIEW_W * 0.5 + lead, 0, WORLD_LEN - VIEW_W);
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
        case 'swing':
          if (ev.sfx) this.sound.play(ev.sfx, { volume: 0.32 });
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

    if (ev.targetTeam === 'player') {
      this.shake(160, 7);
      this.sound.play('-life', { volume: 0.35 });
      this.hurtFlash();
    } else {
      this.shake(heavy ? 120 : 70, heavy ? 6 : 3);
    }
    this.sound.play('hit', { volume: heavy ? 0.6 : 0.42, rate: heavy ? 0.9 : 1 + Math.random() * 0.15 });
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
      kills: this.add.text(0, 0, '', { ...font, fontSize: '18px' }),
      combo: this.add.text(0, 0, '', { ...font, fontSize: '42px', color: '#ffd23f', stroke: '#000000', strokeThickness: 6 }).setOrigin(1, 0),
      fps: this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffffaa' }).setOrigin(1, 0),
      help: this.add.text(0, 0, 'WASD — ходить · Space — прыжок · J — удар · K — тяжёлый · L/Shift — рывок · P — пауза · Esc — меню', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 1),
      dead: this.add.text(0, 0, 'Тебя унесли.\nR — заново · Esc — меню', {
        ...font,
        fontSize: '30px',
        align: 'center',
        backgroundColor: '#000000cc',
        padding: { x: 22, y: 14 },
      }).setOrigin(0.5).setVisible(false),
    };
    this.hurtOverlay = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xff0000, 1).setOrigin(0).setAlpha(0);
    for (const o of [...Object.values(this.hud), this.hurtOverlay]) o.setScrollFactor(0).setDepth(5000);
    this.hurtOverlay.setDepth(4900);
    this.comboShown = 0;
    this.layoutHud();
  }

  layoutHud() {
    const h = this.hud;
    h.hpBack.setPosition(16, 16);
    h.hpFill.setPosition(19, 19);
    h.hpText.setPosition(282, 15);
    h.kills.setPosition(16, 42);
    h.combo.setPosition(VIEW_W - 20, 60);
    h.fps.setPosition(VIEW_W - 8, 6);
    h.help.setPosition(VIEW_W / 2, VIEW_H - 8);
    h.dead.setPosition(VIEW_W / 2, VIEW_H / 2);
    this.hurtOverlay.setSize(VIEW_W, VIEW_H);
  }

  updateHud() {
    const h = this.hud;
    const p = this.player;
    const k = Math.max(0, p.hp / p.maxHp);
    h.hpFill.width = 254 * k;
    h.hpFill.fillColor = k > 0.5 ? 0x5fd35f : k > 0.25 ? 0xffc23f : 0xe2463b;
    h.hpText.setText(`${p.hp}`);
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
    h.dead.setVisible(p.dead);
  }
}
