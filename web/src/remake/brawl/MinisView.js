import { stage, gradeLikeBg } from './stage.js';
import { VIEW_W, VIEW_H } from '../game/constants.js';
import { crateTexture } from './CrateView.js';
import { TRAVEL } from '../sim/bench.js';
import { VIEW as GUARD_VIEW, HIDE_W } from '../sim/stealth.js';

const NOTE_COL = { J: '#d0412f', K: '#2f6fd0', W: '#d0412f', A: '#2fa04a', S: '#2f6fd0', D: '#c08a1a' };

/**
 * Gym bench press (note track on the HUD, barbells over both lifters),
 * museum stealth (crate stacks, guards' view cones, the exit) and the
 * river raft (the raft under the fight, water around it).
 */
export class MinisView {
  constructor(scene) {
    this.scene = scene;
    this.covers = [];
  }

  // ---------------------------------------------------------------- bench
  _bench(world, m) {
    const s = this.scene;
    if (!this.track) {
      this.track = s.add.container(0, 0).setDepth(9000);
      const g = s.add.graphics();
      this.track.g = g;
      this.track.add(g);
      this.track.notes = new Map();
      s.tagUi(this.track);
      s.tagUi(g);
    }
    const T = this.track;
    const y = VIEW_H - 170;
    const ringX = VIEW_W / 2 - 300;
    const len = 640;
    T.g.clear();
    T.g.fillStyle(0x000000, 0.55).fillRoundedRect(ringX - 70, y - 44, len + 120, 88, 14);
    T.g.lineStyle(5, 0xffd23f, 1).strokeCircle(ringX, y, 34);
    const seen = new Set();
    for (const n of m.notes) {
      const dt = n.at - m.t;
      if (dt > TRAVEL || (n.hit && dt < -20)) continue;
      seen.add(n);
      let o = T.notes.get(n);
      if (!o) {
        o = s.add
          .text(0, 0, { W: '↑', A: '←', S: '↓', D: '→' }[n.key] || n.key, { fontFamily: 'Arial Black, Arial', fontSize: '30px', color: '#ffffff', backgroundColor: NOTE_COL[n.key] || '#444', padding: { x: 12, y: 4 } })
          .setOrigin(0.5)
          .setDepth(9001);
        s.tagUi(o);
        T.notes.set(n, o);
      }
      o.setPosition(ringX + (dt / TRAVEL) * len, y);
      o.setAlpha(n.who === 'rival' ? (n.hit ? 0 : 0.3) : n.hit === 'miss' ? 0.25 : n.hit ? 0 : 1);
    }
    for (const [n, o] of T.notes) {
      if (!seen.has(n)) {
        o.destroy();
        T.notes.delete(n);
      }
    }
    // Barbells over the lifters: yours rises with each good hit
    const p = world.players()[0];
    const r = world.fighters.find((f) => f.id === m.rival);
    if (m.cfg.rap) {
      // Mic stands in front of both rappers
      for (const [key, f] of [['micP', p], ['micR', r]]) {
        if (!f) continue;
        if (!this[key]) {
          this[key] = this.scene.add.image(0, 0, 'item_mic_stand').setOrigin(0.5, 1);
          this[key].setScale(230 / this[key].height);
        }
        this[key].setPosition(f.x + f.facing * 70, stage.groundY(f.z) + 4).setDepth(stage.depth(f.z) + 2);
      }
      return;
    }
    this._bar('barP', p, 0.15 + (m.prog / 3) * 0.85);
    this._bar('barR', r, 0.5 + 0.5 * Math.sin((m.rivalT / 150) * Math.PI * 2));
  }

  _bar(key, f, k) {
    const s = this.scene;
    if (!f) return;
    if (!this[key]) {
      const tex = s.textures.exists('item_barbell') ? 'item_barbell' : null;
      this[key] = tex ? s.add.image(0, 0, tex) : s.add.rectangle(0, 0, 220, 14, 0x333333);
      if (tex) this[key].setScale(130 / this[key].width);
    }
    const v = s.views.get(f.id);
    // Above the head (the puppet's real head, whatever the rig's height)
    const head = v?.puppet?.nodes?.head?.sprite;
    const top = head ? head.getBounds().top : v ? v.visual.y - (v.bodyH || 300) : stage.groundY(f.z) - 300;
    // The plate's lower edge clears the head, and rises with each good rep
    const r = this[key].displayHeight / 2;
    this[key].setPosition(f.x, top - r - 12 - k * 50).setDepth(stage.depth(f.z) + 4);
  }

  // ---------------------------------------------------------------- stealth
  _stealth(world, m) {
    const s = this.scene;
    const b = world.bounds;
    if (!this.covers.length) {
      m.covers.forEach((c, i) => {
        // A statue mid-lane: whoever stands in front of it (below) is out of the guards' sight
        const key = [`kit_museum_statue_${(i % 3) + 1}`, `item_statue_${(i % 3) + 1}`].find((k) => s.textures.exists(k));
        // The pedestal stands on its shadow (the hiding spot is right in front of it)
        const y = stage.groundY(m.zHide + 8);
        // The hiding spot: a patch on the floor right in front of (below) the statue
        const shadow = s.add.ellipse(c.x, stage.groundY(m.zHide + 12), HIDE_W * 2.6, 62, 0x05060c, 0.55).setDepth(stage.depth(b.zMin) - 2);
        const im = key ? s.add.image(c.x, y, key).setOrigin(0.5, 1) : s.add.rectangle(c.x, y, 120, 360, 0xd8d0c0).setOrigin(0.5, 1);
        im.setScale(key ? 400 / im.height : 1).setDepth(stage.depth(m.statueZ));
        const tag = c.practice ? s.add.text(c.x, stage.groundY(b.zMax) + 40, '▲ укрытие ▲', { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '20px', color: '#9fd3e0', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5, 1).setDepth(9000) : null;
        this.covers.push(shadow, im);
        if (tag) this.covers.push(tag);
        // Night museum: the statues stand in the dark
        if (key) im.setTint(0x55596a);
        gradeLikeBg(im, 0.6);
      });
      const y0Floor = stage.groundY(b.zMax) + 26;
      if (m.practiceX) {
        this.covers.push(
          s.add.text(m.practiceX, y0Floor + 34, 'ОХРАНА ДАЛЬШЕ →', { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '26px', color: '#ff8a7a', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(9000),
        );
      }
      this.exit = s.add
        .text(m.exitX, stage.groundY(b.zMin) - 260, 'ВЫХОД →', { fontFamily: 'Arial Black, Arial', fontSize: '30px', color: '#7dff7a', stroke: '#000', strokeThickness: 6 })
        .setOrigin(0.5)
        .setDepth(stage.depth(b.zMax) + 5);
    }
    if (!this.cones) this.cones = s.add.graphics();
    const g = this.cones;
    g.clear();
    g.setDepth(stage.depth(b.zMin) - 1);
    const p = world.players()[0];
    for (const id of m.guards) {
      const gd = world.fighters.find((f) => f.id === id);
      if (!gd || gd.dead || (gd.state !== 'idle' && gd.state !== 'walk')) continue;
      const pts = [];
      for (let i = 0; i <= 10; i += 1) {
        const dx = (GUARD_VIEW * i) / 10;
        pts.push({ x: gd.x + dx * gd.facing, y: stage.groundY(Math.max(b.zMin, gd.z - (50 + dx * 0.3))) });
      }
      for (let i = 10; i >= 0; i -= 1) {
        const dx = (GUARD_VIEW * i) / 10;
        pts.push({ x: gd.x + dx * gd.facing, y: stage.groundY(Math.min(b.zMax, gd.z + 50 + dx * 0.3)) });
      }
      const hot = m.seen > 0 && p && Math.abs(p.x - gd.x) < GUARD_VIEW + 20 && Math.sign(p.x - gd.x) === gd.facing;
      g.fillStyle(hot ? 0xff2a1a : 0xff5a4a, hot ? 0.42 : 0.26).fillPoints(pts, true);
    }
    // The hero darkens in a statue's shadow
    const pv = p && s.views.get(p.id);
    pv?.shade?.(!!m.hidden);
    // «!» over the hero while he is being noticed
    if (!this.alert) this.alert = s.add.text(0, 0, '!', { fontFamily: 'Arial Black, Arial', fontSize: '54px', color: '#ff3b2f', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5, 1);
    this.alert.setVisible(m.seen > 0 && !!p);
    if (p) this.alert.setPosition(p.x, stage.groundY(p.z) - 320).setDepth(9000).setScale(0.7 + (m.seenK || 0) * 0.8);
  }

  _clearStealth() {
    const p = this.scene.player;
    this.scene.views.get(p?.id)?.shade?.(false);
    for (const c of this.covers) c.destroy();
    this.covers = [];
    this.exit?.destroy();
    this.exit = null;
    this.cones?.clear();
    this.alert?.setVisible(false);
  }

  // ---------------------------------------------------------------- raft
  _raft(world) {
    const s = this.scene;
    const rb = world.raftBox;
    const b = world.bounds;
    if (!this.raft) {
      const tex = s.textures.exists('item_raft') ? 'item_raft' : null;
      this.raft = tex ? s.add.image(0, 0, tex).setOrigin(0, 0.5) : s.add.rectangle(0, 0, 100, 100, 0x7a5a32).setOrigin(0, 0.5);
      this.water = true;
    }
    const y0 = stage.groundY(b.zMin) - 20;
    const y1 = stage.groundY(b.zMax) + 30;
    const w = rb.xMax - rb.xMin;
    // A little wider than the box: a knocked-down fighter lies on logs, not on water
    this.raft.setPosition(rb.xMin - 150, (y0 + y1) / 2 + 10).setDepth(stage.depth(b.zMin) - 3);
    this.raft.setDisplaySize(w + 230, y1 - y0 + 40);
    // (the water itself is the river set, brawl/SetView.js)
    if (this.water) return;
    const cam = s.cameras.main;
    const vx0 = cam.worldView.x - 200;
    const vx1 = cam.worldView.right + 200;
    const t = s.time.now / 400;
    this.water.clear().setDepth(stage.depth(b.zMin) - 4);
    this.water.fillStyle(0x2c5a6e, 0.92).fillRect(vx0, y0 - 30, vx1 - vx0, y1 - y0 + 70);
    this.water.lineStyle(2, 0x9fd3e0, 0.35);
    for (let i = 0; i < 8; i += 1) {
      const yy = y0 + ((y1 - y0 + 40) * i) / 8;
      const off = ((t * 60 + i * 97) % 240) - 120;
      for (let x = vx0 + off; x < vx1; x += 240) this.water.lineBetween(x, yy, x + 70, yy);
    }
  }

  // ---------------------------------------------------------------- HUD helpers
  _hud(key, make) {
    if (!this[key]) {
      this[key] = make();
      const tag = (o) => {
        this.scene.tagUi(o);
        if (o.list) for (const c of o.list) tag(c);
      };
      tag(this[key]);
    }
    return this[key];
  }

  _drop(key) {
    if (!this[key]) return;
    this[key].destroy();
    this[key] = null;
  }

  // ---------------------------------------------------------------- pose-off
  _pose(m) {
    const s = this.scene;
    const P = this._hud('poseHud', () => {
      const c = s.add.container(VIEW_W / 2, VIEW_H - 190).setDepth(9000);
      c.g = s.add.graphics();
      c.add(c.g);
      c.cells = [];
      for (let i = 0; i < 7; i += 1) {
        const t = s.add.text(0, 0, '', { fontFamily: 'Arial Black, Arial', fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);
        c.cells.push(t);
        c.add(t);
      }
      return c;
    });
    const ARR = { W: '↑', A: '←', S: '↓', D: '→' };
    const K = ['W', 'A', 'S', 'D'];
    const n = m.seq.length;
    P.g.clear().fillStyle(0x000000, 0.6).fillRoundedRect(-n * 40 - 20, -40, n * 80 + 40, 80, 14);
    P.cells.forEach((c, i) => {
      if (i >= n) return c.setVisible(false);
      c.setVisible(true).setPosition(-((n - 1) * 80) / 2 + i * 80, 0);
      let txt = '?';
      let col = '#888888';
      if (m.phase === 'show') {
        if (i <= m.shown) {
          txt = ARR[K[m.seq[i]]];
          col = i === m.shown ? '#ffd23f' : '#ffffff';
        }
      } else {
        txt = i < m.input ? ARR[K[m.seq[i]]] : '•';
        col = i < m.input ? '#7dff7a' : '#ffffff';
      }
      c.setText(txt).setColor(col);
    });
  }

  // ---------------------------------------------------------------- trading
  _trade(m) {
    const s = this.scene;
    const T = this._hud('tradeHud', () => {
      const c = s.add.container(VIEW_W / 2 - 330, 150).setDepth(9000);
      c.g = s.add.graphics();
      c.label = s.add.text(16, 10, '', { fontFamily: 'Arial Black, Arial', fontSize: '20px', color: '#ffffff' });
      c.add([c.g, c.label]);
      return c;
    });
    const W = 660;
    const H = 260;
    const g = T.g.clear();
    g.fillStyle(0x07130c, 0.88).fillRoundedRect(0, 0, W, H, 12).lineStyle(2, 0x2fd06a, 0.8).strokeRoundedRect(0, 0, W, H, 12);
    const h = m.hist;
    const lo = Math.min(...h) * 0.95;
    const hi = Math.max(...h) * 1.05;
    const X = (i) => 20 + ((W - 40) * i) / 119;
    const Y = (v) => H - 20 - ((H - 70) * (v - lo)) / (hi - lo || 1);
    for (let i = 1; i < h.length; i += 1) {
      g.lineStyle(4, h[i] >= h[i - 1] ? 0x2fd06a : 0xe0463a, 1).lineBetween(X(i - 1), Y(h[i - 1]), X(i), Y(h[i]));
    }
    if (m.held) g.lineStyle(2, 0xffd23f, 0.8).lineBetween(20, Y(m.buyAt ?? h[h.length - 1]), W - 20, Y(m.buyAt ?? h[h.length - 1]));
    T.label.setText(`$ГИТЛ ${m.price.toFixed(1)} · ${m.held ? 'В ПОЗИЦИИ' : 'кэш'} · J купить · K продать`);
  }

  // ---------------------------------------------------------------- stream style
  _style(st) {
    const s = this.scene;
    const S = this._hud('styleHud', () => {
      const c = s.add.container(VIEW_W - 350, 190).setDepth(9000);
      c.g = s.add.graphics();
      c.rank = s.add.text(290, 14, 'D', { fontFamily: 'Arial Black, Arial', fontSize: '48px', color: '#ffffff', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5, 0);
      c.view = s.add.text(14, 10, '', { fontFamily: 'Arial Black, Arial', fontSize: '18px', color: '#ff5a6a' });
      c.add([c.g, c.view, c.rank]);
      return c;
    });
    const COL = { D: '#9a9a9a', C: '#7dc8ff', B: '#7dff7a', A: '#ffd23f', S: '#ff8a2a', SSS: '#ff3b6b' };
    S.g.clear().fillStyle(0x12060a, 0.82).fillRoundedRect(0, 0, 340, 84, 12).lineStyle(2, 0xff3b6b, 0.9).strokeRoundedRect(0, 0, 340, 84, 12);
    S.g.fillStyle(0x331018, 1).fillRect(14, 48, 236, 16).fillStyle(Number.parseInt(COL[st.rank].slice(1), 16), 1).fillRect(14, 48, 236 * (st.meter / 100), 16);
    S.view.setText(`● LIVE  ${Math.round(st.viewers).toLocaleString('ru-RU')} зрителей`);
    S.rank.setText(st.rank).setColor(COL[st.rank]);
  }

  // ---------------------------------------------------------------- elevator
  _lift(world, lift) {
    const s = this.scene;
    const b = world.bounds;
    if (!this.liftGfx) this.liftGfx = s.add.graphics();
    const g = this.liftGfx.clear();
    const top = stage.groundY(b.zMin) - 420;
    const bot = stage.groundY(b.zMax) + 40;
    g.setDepth(stage.depth(b.zMax) + 6);
    // Steel walls just outside the box, a frame up top
    for (const x of [lift.left - 60, lift.right]) {
      g.fillStyle(0x6d747c, 1).fillRect(x, top, 60, bot - top);
      g.fillStyle(0x8c949c, 1).fillRect(x + 8, top, 6, bot - top);
    }
    g.fillStyle(0x3a3f45, 1).fillRect(lift.left - 60, top - 40, lift.right - lift.left + 120, 40);
    if (!this.liftLabel) {
      this.liftLabel = s.add.text(0, 0, '', { fontFamily: 'Arial Black, Arial', fontSize: '26px', color: '#ff5a3a', backgroundColor: '#111', padding: { x: 10, y: 4 } }).setOrigin(0.5, 1);
    }
    this.liftLabel.setText(`ЭТАЖ ${lift.floor * 4 + 3}`).setPosition((lift.left + lift.right) / 2, top - 44).setDepth(stage.depth(b.zMax) + 7);
  }

  // ---------------------------------------------------------------- entry hint
  _entry(world) {
    const s = this.scene;
    const e = world.entry;
    if (!e || e.used || e.cfg.auto) {
      this._drop('entryHint');
      return;
    }
    if (!this.entryHint) {
      this.entryHint = s.add
        .text(0, 0, '', { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '26px', color: '#ffd23f', stroke: '#000', strokeThickness: 6, align: 'center' })
        .setOrigin(0.5, 1);
    }
    const art = e.cfg.h || 120;
    const bob = Math.sin(s.time.now / 220) * 6;
    this.entryHint
      .setText(e.near ? e.cfg.prompt || 'J' : '▼')
      .setFontSize(e.near ? 26 : 34)
      .setPosition(e.x, stage.groundY(e.z) - art - 40 + bob)
      .setDepth(9000);
  }

  // ---------------------------------------------------------------- QTE
  _qte(q) {
    const s = this.scene;
    const Q = this._hud('qteHud', () => {
      const c = s.add.container(VIEW_W / 2, VIEW_H / 2 + 120).setDepth(9400);
      c.g = s.add.graphics();
      c.key = s.add.text(0, 0, '', { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '72px', color: '#ffffff', stroke: '#000', strokeThickness: 10 }).setOrigin(0.5);
      c.dots = s.add.text(0, 96, '', { fontFamily: 'Arial Black, Arial', fontSize: '26px', color: '#ffd23f' }).setOrigin(0.5);
      c.add([c.g, c.key, c.dots]);
      return c;
    });
    const ARR = { W: '↑', A: '←', S: '↓', D: '→' };
    const g = Q.g.clear();
    if (q.intro > 0 || q.done) {
      Q.key.setText('');
      Q.dots.setText('');
      return;
    }
    const k = 1 - q.t / q.win;
    g.fillStyle(0x000000, 0.55).fillCircle(0, 0, 78);
    g.lineStyle(10, k > 0.35 ? 0xffd23f : 0xff3b2f, 1).beginPath().arc(0, 0, 70, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k).strokePath();
    Q.key.setText(ARR[q.seq[q.i]] || q.seq[q.i]);
    Q.dots.setText(q.seq.map((_, i) => (i < q.i ? '●' : '○')).join(' '));
  }

  render(world) {
    this._entry(world);
    if (world.qte) this._qte(world.qte);
    else this._drop('qteHud');
    const m = world.mini;
    if (m && m.type === 'pose' && !m.done) this._pose(m);
    else this._drop('poseHud');
    if (m && m.type === 'trading' && !m.done) this._trade(m);
    else this._drop('tradeHud');
    if (world.style) this._style(world.style);
    else this._drop('styleHud');
    if (world.elevator) this._lift(world, world.elevator);
    else if (this.liftGfx) {
      this._drop('liftGfx');
      this._drop('liftLabel');
    }
    if (m && m.type === 'bench' && !m.done) this._bench(world, m);
    else if (this.track) {
      for (const o of this.track.notes.values()) o.destroy();
      this.track.destroy();
      this.track = null;
      for (const k of ['barP', 'barR', 'micP', 'micR']) {
        this[k]?.destroy();
        this[k] = null;
      }
    }
    if (m && m.type === 'stealth' && !m.done) this._stealth(world, m);
    else if (this.covers.length) this._clearStealth();
    if (world.raftBox) this._raft(world);
    else if (this.raft) {
      this.raft.destroy();
      this.raft = null;
      this.water = null;
    }
  }
}
