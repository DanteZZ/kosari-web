import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from '../game/constants.js';

/**
 * In-game cutscenes for the brawl view: letterbox bars, a scripted camera
 * (pan / zoom to a point), a full-screen boss name card, flashes, and an
 * Undertale-style dialogue box that types its text letter by letter with a
 * short blip per letter (each speaker has their own pitch and timbre).
 *
 * Scripts are plain async functions using the helpers below. While a cutscene
 * runs the scene feeds no player input to the sim; `freeze` also stops the sim.
 */
const BAR_H = 74;
const TYPE_MS = 34;

export class Cinema {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.freeze = false;
    /** Camera override: { x, y, zoom } in world space (centre of the screen). */
    this.cam = null;
    this.queue = Promise.resolve();
    this._afterDone = [];
    this._confirm = null;
    this._buildUi();

    const kb = scene.input.keyboard;
    const confirm = () => this._confirm?.();
    for (const k of ['ENTER', 'SPACE', 'J', 'Z', 'X']) kb.on(`keydown-${k}`, confirm);
    scene.input.on('pointerdown', () => {
      // A click on a choice picks it (its own handler); anywhere else confirms
      if (!this._pointerPick) confirm();
      this._pointerPick = false;
    });
    // Dialogue choices: arrows / W S to move, 1–5 to pick at once
    for (const k of ['UP', 'W']) kb.on(`keydown-${k}`, () => this._nav?.(-1));
    for (const k of ['DOWN', 'S']) kb.on(`keydown-${k}`, () => this._nav?.(1));
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((k, i) => kb.on(`keydown-${k}`, () => this._pick?.(i)));
  }

  // ------------------------------------------------------------------ ui

  _buildUi() {
    const s = this.scene;
    const ui = (o) => s.tagUi(o.setScrollFactor(0));
    this.barTop = ui(s.add.rectangle(0, 0, 10, BAR_H, 0x000000).setOrigin(0, 0).setDepth(5600));
    this.barBot = ui(s.add.rectangle(0, 0, 10, BAR_H, 0x000000).setOrigin(0, 1).setDepth(5600));
    this.flashRect = ui(s.add.rectangle(0, 0, 10, 10, 0xffffff, 0).setOrigin(0, 0).setDepth(5900));

    // Boss name card
    this.card = ui(s.add.container(0, 0).setDepth(5700).setVisible(false));
    this.cardStripe = s.add.rectangle(0, 0, 10, 120, 0x000000, 0.72).setOrigin(0.5);
    this.cardName = s.add
      .text(0, -12, '', { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '64px', color: '#ffd23f', stroke: '#000', strokeThickness: 8 })
      .setOrigin(0.5);
    this.cardSub = s.add
      .text(0, 40, '', { fontFamily: '"Press Start 2P", monospace', fontSize: '14px', color: '#ffffff' })
      .setOrigin(0.5);
    this.card.add([this.cardStripe, this.cardName, this.cardSub]);

    // Dialogue box
    this.box = ui(s.add.container(0, 0).setDepth(5800).setVisible(false));
    this.boxBg = s.add.rectangle(0, 0, 10, 150, 0x000000, 1).setOrigin(0, 0).setStrokeStyle(4, 0xffffff);
    this.boxFace = s.add.image(80, 75, '__DEFAULT').setOrigin(0.5);
    this.boxName = s.add.text(150, 18, '', { fontFamily: '"Press Start 2P", monospace', fontSize: '14px', color: '#ffd23f' });
    this.boxText = s.add.text(150, 48, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '17px',
      color: '#ffffff',
      lineSpacing: 10,
      wordWrap: { width: 600 },
    });
    this.boxHint = s.add.text(0, 0, '▼', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' }).setOrigin(1, 1);
    this.box.add([this.boxBg, this.boxFace, this.boxName, this.boxText, this.boxHint]);
    // Choices (the hero's answers) sit just above the dialogue box
    this.menu = ui(s.add.container(0, 0).setDepth(5810).setVisible(false));
    // Darkening for tense moments (under the bars and the box)
    this.dimRect = ui(s.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0, 0).setDepth(5550));
    // Children need the UI-camera tag too (containers check every child)
    for (const c of [this.card, this.box]) for (const ch of c.list) s.tagUi(ch.setScrollFactor(0));
    this.layout();
    this._bars(0, 0);
  }

  layout() {
    this.barTop.setSize(VIEW_W, BAR_H);
    this.barBot.setPosition(0, VIEW_H).setSize(VIEW_W, BAR_H);
    this.flashRect.setSize(VIEW_W, VIEW_H);
    this.dimRect?.setSize(VIEW_W, VIEW_H);
    this.cardStripe.setSize(VIEW_W, 130);
    this.card.setPosition(VIEW_W / 2, VIEW_H * 0.42);
    const w = Math.min(VIEW_W - 60, 920);
    this.boxBg.setSize(w, 150);
    this.boxText.setWordWrapWidth(w - 180);
    this.boxHint.setPosition(w - 14, 142);
    this.box.setPosition((VIEW_W - w) / 2, VIEW_H - BAR_H - 162 + 60);
  }

  _bars(k, ms) {
    const s = this.scene;
    s.tweens.killTweensOf([this.barTop, this.barBot]);
    const t = { k: this._barK ?? 0 };
    s.tweens.add({
      targets: t,
      k,
      duration: ms,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        this._barK = t.k;
        this.barTop.setY(-BAR_H * (1 - t.k));
        this.barBot.setY(VIEW_H + BAR_H * (1 - t.k));
      },
    });
    if (!ms) {
      this._barK = k;
      this.barTop.setY(-BAR_H * (1 - k));
      this.barBot.setY(VIEW_H + BAR_H * (1 - k));
    }
  }

  // ------------------------------------------------------------------ running scripts

  /** Queue a cutscene; `fn(c)` gets this object and returns a promise. */
  play(fn, { freeze = true } = {}) {
    this.queue = this.queue.then(async () => {
      this.active = true;
      this.freeze = freeze;
      this.scene.hud && this._hud(false);
      this._bars(1, 380);
      try {
        await fn(this);
      } catch (e) {
        console.warn('cutscene', e);
      }
      this.box.setVisible(false);
      this.card.setVisible(false);
      this.menu.setVisible(false);
      this._closePhone();
      this.dim(false);
      this.scene.clearGestures?.();
      this.cam = null;
      this.freeze = false;
      this._bars(0, 380);
      this._hud(true);
      this.active = false;
      const after = this._afterDone.splice(0);
      for (const f of after) f();
    });
    return this.queue;
  }

  /** Run `f` once no cutscene is playing. */
  after(f) {
    if (this.active) this._afterDone.push(f);
    else f();
  }

  _hud(on) {
    const h = this.scene.hud;
    if (!h) return;
    for (const o of Object.values(h)) if (o?.setAlpha) this.scene.tweens.add({ targets: o, alpha: on ? 1 : 0, duration: 250 });
  }

  wait(ms) {
    return new Promise((r) => this.scene.time.delayedCall(ms, r));
  }

  /** Move the camera so world point (x, y) is centred, at this zoom. */
  async camTo(x, y, zoom = 1.2, ms = 700) {
    this.cam = { x, y, zoom, speed: 4.5 };
    await this.wait(ms);
  }

  /** Snap the camera close in (finishers). */
  camSnap(x, y, zoom) {
    this.cam = { x, y, zoom, speed: 18 };
  }

  release() {
    this.cam = null;
  }

  setFreeze(on) {
    this.freeze = on;
  }

  flash(color = 0xffffff, ms = 260, peak = 0.9) {
    const s = this.scene;
    this.flashRect.setFillStyle(color, peak);
    s.tweens.killTweensOf(this.flashRect);
    s.tweens.add({ targets: this.flashRect, fillAlpha: 0, duration: ms, ease: 'Quad.easeOut' });
  }

  /** Manga-style speed lines bursting from the screen centre (finishers). */
  impact(ms = 520) {
    const s = this.scene;
    const g = s.tagUi(s.add.graphics().setScrollFactor(0).setDepth(5650));
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2 - 40;
    const R = Math.hypot(VIEW_W, VIEW_H);
    for (let i = 0; i < 46; i += 1) {
      const a = (i / 46) * Math.PI * 2 + Math.random() * 0.08;
      const r0 = 170 + Math.random() * 120;
      const w = 2 + Math.random() * 7;
      const p = (d, off) => [cx + Math.cos(a + off) * d, cy + Math.sin(a + off) * d];
      const [x1, y1] = p(r0, 0);
      const [x2, y2] = p(R, w / 300);
      const [x3, y3] = p(R, -w / 300);
      g.fillStyle(i % 3 ? 0xffffff : 0x111111, i % 3 ? 0.85 : 0.6);
      g.fillTriangle(x1, y1, x2, y2, x3, y3);
    }
    s.tweens.add({ targets: g, alpha: 0, delay: ms * 0.5, duration: ms * 0.5, onComplete: () => g.destroy() });
  }

  /** Full-screen boss name card. */
  async title(name, sub = '', ms = 1500) {
    const s = this.scene;
    this.cardName.setText(name);
    this.cardSub.setText(sub);
    this.card.setVisible(true).setAlpha(0).setScale(1.25);
    s.sound.play('superudar', { volume: 0.35, rate: 0.8 });
    s.tweens.add({ targets: this.card, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    await this.wait(ms);
    await new Promise((r) => s.tweens.add({ targets: this.card, alpha: 0, duration: 240, onComplete: r }));
    this.card.setVisible(false);
  }

  /**
   * Dialogue line, typed with blips. Resolves when the player confirms
   * (or after a while, so cutscenes never soft-lock).
   * @param {{ name: string, face?: string, pitch?: number, wave?: OscillatorType, color?: string }} who
   */
  async say(who, text) {
    const s = this.scene;
    this.box.setVisible(true);
    this.boxName.setText(who.name).setColor(who.color || '#ffd23f');
    const face = who.face && s.textures.exists(who.face) ? who.face : null;
    this.boxFace.setVisible(!!face);
    if (face) {
      this.boxFace.setTexture(face);
      const k = 112 / Math.max(this.boxFace.width, this.boxFace.height);
      this.boxFace.setScale(k).setFlipX(!!who.flip);
    }
    // Свидетель never talks: his *actions* read in grey
    const action = /^\*[\s\S]*\*$/.test(text);
    this.boxText.setText('').setColor(action ? '#aab6c8' : '#ffffff');
    this.boxHint.setVisible(false);
    who.onTalk?.(true);
    let shown = 0;
    let done = false;
    let skip = false;
    this._confirm = () => {
      if (!done) skip = true;
    };
    await new Promise((resolve) => {
      const tick = () => {
        if (skip) shown = text.length;
        else shown += 1;
        this.boxText.setText(text.slice(0, shown));
        const ch = text[shown - 1];
        if (!skip && ch && /[\p{L}\p{N}]/u.test(ch)) this.blip(who, shown);
        if (shown >= text.length) return resolve();
        const pause = /[.,!?…—]/.test(ch) ? TYPE_MS * 5 : TYPE_MS;
        s.time.delayedCall(pause, tick);
      };
      tick();
    });
    done = true;
    who.onTalk?.(false);
    this.boxHint.setVisible(true);
    s.tweens.add({ targets: this.boxHint, y: '+=4', yoyo: true, repeat: -1, duration: 300 });
    await new Promise((resolve) => {
      const t = s.time.delayedCall(6000, resolve);
      this._confirm = () => {
        t.remove();
        resolve();
      };
    });
    s.tweens.killTweensOf(this.boxHint);
    this.boxHint.y = 142;
    this._confirm = null;
    s.sound.play('beep', { volume: 0.15, rate: 1.6 });
  }

  hideBox() {
    this.box.setVisible(false);
  }

  /** Darken the world (true) or lift it (false). */
  dim(on, ms = 500) {
    const s = this.scene;
    s.tweens.killTweensOf(this.dimRect);
    s.tweens.add({ targets: this.dimRect, fillAlpha: on ? 0.55 : 0, duration: ms });
  }

  /**
   * The hero's answer: a list of options over the dialogue box. Options:
   * { text, tag?, tagColor?, off? } — `off` ones are greyed out and cannot be
   * picked. Resolves with the picked index.
   */
  async choose(options) {
    const s = this.scene;
    const w = Math.min(VIEW_W - 60, 920);
    const rowH = 40;
    this.menu.removeAll(true);
    const h = options.length * rowH + 24;
    const bg = s.add.rectangle(0, 0, w, h, 0x05060a, 0.92).setOrigin(0, 0).setStrokeStyle(3, 0xffd23f, 0.9);
    this.menu.add(bg);
    const rows = options.map((o, i) => {
      const y = 12 + i * rowH;
      const hl = s.add.rectangle(6, y, w - 12, rowH - 4, 0xffd23f, 0).setOrigin(0, 0);
      const num = s.add.text(18, y + 10, `${i + 1}.`, { fontFamily: '"Press Start 2P", monospace', fontSize: '14px', color: '#ffd23f' });
      let x = 58;
      const parts = [hl, num];
      if (o.tag) {
        const tg = s.add.text(x, y + 10, `[${o.tag}]`, { fontFamily: '"Press Start 2P", monospace', fontSize: '14px', color: o.tagColor || '#ffd23f' });
        parts.push(tg);
        x += tg.width + 12;
      }
      const tx = s.add.text(x, y + 10, o.text, { fontFamily: '"Press Start 2P", monospace', fontSize: '14px', color: o.off ? '#5c6270' : '#ffffff' });
      if (tx.width > w - x - 16) tx.setScale(Math.max(0.6, (w - x - 16) / tx.width), 1);
      parts.push(tx);
      hl.setInteractive({ useHandCursor: !o.off });
      this.menu.add(parts);
      return { hl, num, tx, o };
    });
    for (const ch of this.menu.list) s.tagUi(ch.setScrollFactor(0));
    // Above the dialogue box: the last line stays readable while choosing
    const boxTop = this.box.visible ? this.box.y : VIEW_H - BAR_H;
    this.menu.setPosition((VIEW_W - w) / 2, boxTop - h - 8).setVisible(true).setAlpha(0);
    s.tweens.add({ targets: this.menu, alpha: 1, duration: 160 });
    let sel = Math.max(0, options.findIndex((o) => !o.off));
    const paint = () =>
      rows.forEach((r, i) => {
        const on = i === sel;
        r.hl.setFillStyle(0xffd23f, on ? 0.18 : 0);
        r.num.setColor(on ? '#ffffff' : '#ffd23f');
        if (!r.o.off) r.tx.setColor(on ? '#ffe98a' : '#ffffff');
      });
    paint();
    const pick = await new Promise((resolve) => {
      const take = (i) => {
        if (i < 0 || i >= rows.length || rows[i].o.off) {
          s.sound.play('no_bulet', { volume: 0.3 });
          return;
        }
        resolve(i);
      };
      this._nav = (d) => {
        for (let k = 0; k < rows.length; k += 1) {
          sel = (sel + d + rows.length) % rows.length;
          if (!rows[sel].o.off) break;
        }
        s.sound.play('beep', { volume: 0.12, rate: 2 });
        paint();
      };
      this._pick = take;
      this._confirm = () => take(sel);
      rows.forEach((r, i) => {
        r.hl.on('pointerover', () => {
          if (r.o.off || sel === i) return;
          sel = i;
          paint();
        });
        r.hl.on('pointerdown', () => {
          this._pointerPick = true;
          take(i);
        });
      });
    });
    this._nav = this._pick = this._confirm = null;
    s.sound.play('beep', { volume: 0.2, rate: 1.2 });
    this.menu.setVisible(false);
    this.menu.removeAll(true);
    return pick;
  }

  /** A bubble over a world point: ! ? … ♥ # ♪ */
  emote(x, y, sym) {
    const s = this.scene;
    const col = { '!': '#ffd23f', '?': '#8fe3ff', '#': '#ff5a4a', '♥': '#ff7ab0', '♪': '#c6a0ff' }[sym] || '#ffffff';
    const bub = s.add.container(x, y).setDepth(5300);
    const r = s.add.circle(0, 0, 34, 0x0b0b12, 0.88).setStrokeStyle(4, Phaser.Display.Color.HexStringToColor(col).color);
    const tail = s.add.triangle(0, 30, -10, 0, 10, 0, 0, 16, 0x0b0b12, 0.88);
    const t = s.add.text(0, 0, sym, { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '42px', color: col }).setOrigin(0.5);
    bub.add([tail, r, t]);
    bub.setScale(0.2);
    s.tweens.add({ targets: bub, scale: 1, duration: 260, ease: 'Back.Out' });
    s.tweens.add({ targets: bub, y: y - 12, duration: 600, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
    s.tweens.add({ targets: bub, alpha: 0, delay: 1700, duration: 300, onComplete: () => bub.destroy() });
    if (sym === '!') s.sound.play('beep', { volume: 0.25, rate: 1.8 });
    return bub;
  }

  /**
   * Messages on the hero's phone (the chapter openings, the big reveal):
   * bubbles pop in one by one, then a confirm closes it.
   */
  async phone(from, msgs) {
    const s = this.scene;
    this._closePhone();
    const W = 360;
    const H = 520;
    const c = s.add.container(VIEW_W - W / 2 - 60, VIEW_H / 2 - 20).setDepth(5750);
    const body = s.add.rectangle(0, 0, W, H, 0x0d0f16, 0.97).setStrokeStyle(6, 0x2a2f3c);
    const head = s.add.rectangle(0, -H / 2 + 34, W - 12, 56, 0x1b2030, 1);
    const ava = s.add.circle(-W / 2 + 40, -H / 2 + 34, 17, 0x3b4560);
    const name = s.add.text(-W / 2 + 66, -H / 2 + 20, from, { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '17px', color: '#ffffff' });
    if (name.width > W - 90) name.setScale((W - 90) / name.width, 1);
    const sub = s.add.text(-W / 2 + 66, -H / 2 + 42, 'в сети', { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '12px', color: '#6be38c' });
    c.add([body, head, ava, name, sub]);
    const tag = (o) => {
      s.tagUi(o.setScrollFactor(0));
      return o;
    };
    tag(c);
    for (const o of c.list) tag(o);
    this.phoneUi = c;
    const y0 = c.y;
    c.setAlpha(0).setY(y0 + 60);
    s.tweens.add({ targets: c, alpha: 1, y: y0, duration: 320, ease: 'Back.Out' });
    s.sound.play('beep', { volume: 0.25, rate: 0.9 });
    await this.wait(380);
    let y = -H / 2 + 80;
    for (const m of msgs) {
      const t = s.add.text(-W / 2 + 32, y + 10, m, { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '17px', color: '#eef2ff', wordWrap: { width: W - 90 } });
      const bub = s.add.rectangle(-W / 2 + 18, y, Math.min(W - 40, t.width + 30), t.height + 20, 0x2a3350, 1).setOrigin(0, 0);
      c.add([bub, t]);
      tag(bub);
      tag(t);
      bub.setAlpha(0);
      t.setAlpha(0);
      s.tweens.add({ targets: [bub, t], alpha: 1, duration: 180 });
      s.sound.play('beep', { volume: 0.22, rate: 1.5 });
      y += t.height + 30;
      // A click skips the wait for the next bubble
      await new Promise((r) => {
        const tm = s.time.delayedCall(1000, r);
        this._confirm = () => {
          tm.remove();
          r();
        };
      });
    }
    await new Promise((r) => {
      const tm = s.time.delayedCall(5000, r);
      this._confirm = () => {
        tm.remove();
        r();
      };
    });
    this._confirm = null;
    this._closePhone();
    await this.wait(200);
  }

  _closePhone() {
    const c = this.phoneUi;
    if (!c) return;
    this.phoneUi = null;
    this.scene.tweens.add({ targets: c, alpha: 0, y: c.y + 40, duration: 220, onComplete: () => c.destroy() });
  }


  /**
   * One letter's voice: a syllable cut from the character's own voice (every
   * third letter, so they do not pile up), or a synthesized blip.
   */
  blip(who, n = 0) {
    if (who.voice && this.scene.voices) {
      if (n % 3 === 1) this.scene.voices.blip(who.voice);
      return;
    }
    const ctx = this.scene.sound.context;
    if (!ctx || this.scene.sound.mute) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = who.wave || 'square';
    o.frequency.value = (who.pitch || 220) * (0.94 + Math.random() * 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.07);
  }

  /** Camera hook: returns the overridden { targetX, targetY, zoom, speed } or null. */
  camera() {
    if (!this.cam) return null;
    return {
      x: this.cam.x - VIEW_W / 2,
      y: this.cam.y - VIEW_H / 2,
      zoom: this.cam.zoom,
      speed: this.cam.speed,
    };
  }
}

