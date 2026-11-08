import { stage } from './stage.js';
import { VIEW_W, VIEW_H } from '../game/constants.js';
import { crateTexture } from './CrateView.js';
import { TRAVEL } from '../sim/bench.js';
import { VIEW as GUARD_VIEW } from '../sim/stealth.js';

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
          .text(0, 0, n.key, { fontFamily: 'Arial Black, Arial', fontSize: '30px', color: '#ffffff', backgroundColor: n.key === 'J' ? '#d0412f' : '#2f6fd0', padding: { x: 12, y: 4 } })
          .setOrigin(0.5)
          .setDepth(9001);
        s.tagUi(o);
        T.notes.set(n, o);
      }
      o.setPosition(ringX + (dt / TRAVEL) * len, y);
      o.setAlpha(n.hit === 'miss' ? 0.25 : n.hit ? 0 : 1);
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
    const top = v ? v.visual.y - (v.bodyH || 300) : stage.groundY(f.z) - 300;
    this[key].setPosition(f.x, top + 30 - k * 70).setDepth(stage.depth(f.z) + 4);
  }

  // ---------------------------------------------------------------- stealth
  _stealth(world, m) {
    const s = this.scene;
    const b = world.bounds;
    if (!this.covers.length) {
      for (const c of m.covers) {
        for (const z of [b.zMin + 12, (b.zMin + b.zMax) / 2, b.zMax - 12]) {
          const im = s.add.image(c.x, stage.groundY(z), crateTexture(s)).setOrigin(0.5, 1).setScale(1.5);
          im.setDepth(stage.depth(z));
          this.covers.push(im);
          if (z !== b.zMin + 12) continue;
          // Taller stack at the back
          const top = s.add.image(c.x, stage.groundY(z) - 96, crateTexture(s)).setOrigin(0.5, 1).setScale(1.5);
          top.setDepth(stage.depth(z));
          this.covers.push(top);
        }
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
    // «!» over the hero while he is being noticed
    if (!this.alert) this.alert = s.add.text(0, 0, '!', { fontFamily: 'Arial Black, Arial', fontSize: '54px', color: '#ff3b2f', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5, 1);
    this.alert.setVisible(m.seen > 0 && !!p);
    if (p) this.alert.setPosition(p.x, stage.groundY(p.z) - 320).setDepth(9000).setScale(0.7 + (m.seenK || 0) * 0.8);
  }

  _clearStealth() {
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
      this.water = s.add.graphics();
    }
    const y0 = stage.groundY(b.zMin) - 20;
    const y1 = stage.groundY(b.zMax) + 30;
    const w = rb.xMax - rb.xMin;
    this.raft.setPosition(rb.xMin, (y0 + y1) / 2 + 10).setDepth(stage.depth(b.zMin) - 3);
    this.raft.setDisplaySize(w, y1 - y0 + 40);
    // Water around the raft
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

  render(world) {
    const m = world.mini;
    if (m && m.type === 'bench' && !m.done) this._bench(world, m);
    else if (this.track) {
      for (const o of this.track.notes.values()) o.destroy();
      this.track.destroy();
      this.track = null;
      this.barP?.destroy();
      this.barR?.destroy();
      this.barP = null;
      this.barR = null;
    }
    if (m && m.type === 'stealth' && !m.done) this._stealth(world, m);
    else if (this.covers.length) this._clearStealth();
    if (world.raftBox) this._raft(world);
    else if (this.raft) {
      this.raft.destroy();
      this.water.destroy();
      this.raft = null;
      this.water = null;
    }
  }
}
