import { stage } from './stage.js';
import { CAR_HW } from '../sim/race.js';
import { enemyPartTextureKey } from '../game/enemies/parts.js';

/** Art for the race (all drawn facing LEFT): [texture, width on screen]. */
const ART = {
  truck: ['item_truck', 560],
  car: ['item_car_lada', 270],
  slow: ['item_car_lada', 270],
  moped: ['item_moped', 150],
};

/**
 * Draws the highway race (sim/race.js) and the roadside traps' lane warnings:
 * the hero's Lada with his head in the window, oncoming trucks and cars,
 * Никиты on mopeds, Повар's pots with their landing marks.
 */
export class RaceView {
  constructor(scene, heroFace) {
    this.scene = scene;
    this.heroFace = heroFace;
    this.car = null;
    this.obs = new Map();
    this.marks = new Map();
    this.lanes = [];
    this.speedLines = [];
  }

  _img(key, w) {
    const img = this.scene.add.image(0, 0, this.scene.textures.exists(key) ? key : '__DEFAULT').setOrigin(0.5, 1);
    img.setScale(w / (img.width || 1));
    return img;
  }

  _makeCar() {
    const s = this.scene;
    const c = s.add.container(0, 0);
    const shadow = s.add.ellipse(0, 4, 300, 40, 0x000000, 0.35);
    const body = this._img('item_car_lada', 290).setFlipX(true);
    // Driver's head in the front window (the car faces right)
    const head = s.add.image(38, -78, this.heroFace).setOrigin(0.5, 0.75);
    head.setScale(46 / Math.max(head.width || 1, head.height || 1));
    const arm = s.add.rectangle(70, -54, 0, 14, 0xd7a07a).setOrigin(0, 0.5);
    c.add([shadow, head, body, arm]);
    c.head = head;
    c.body = body;
    c.arm = arm;
    return c;
  }

  /** Red stripe across the road where a car is about to pass (traps). */
  laneWarn(z, dir, t) {
    const s = this.scene;
    const cam = s.cameras.main;
    const y = stage.groundY(z);
    const g = s.add.rectangle(cam.midPoint.x, y - 10, cam.width / cam.zoom + 400, 56, 0xff3b2f, 0.22).setDepth(stage.depth(z) - 2);
    const arrow = s.add
      .text(cam.midPoint.x - dir * (cam.width / cam.zoom / 2 - 90), y - 60, dir > 0 ? '▶▶ МАШИНА' : 'МАШИНА ◀◀', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '28px',
        color: '#ff5a4a',
        stroke: '#000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(5000);
    s.tweens.add({ targets: [g, arrow], alpha: { from: 1, to: 0.35 }, yoyo: true, repeat: Math.floor(t / 10), duration: 80 });
    s.time.delayedCall((t / 60) * 1000 + 200, () => {
      g.destroy();
      arrow.destroy();
    });
  }

  render(world, alpha) {
    const s = this.scene;
    const r = world.race;
    const p = world.fighters.find((f) => f.driving);
    const pv = p && s.views.get(p.id);
    if (!r || r.done || !p) {
      if (this.car) {
        this.car.destroy();
        this.car = null;
        for (const v of this.obs.values()) v.destroy();
        this.obs.clear();
        for (const v of this.marks.values()) v.destroy();
        this.marks.clear();
        for (const f of world.fighters) if (f.kind === 'player') s.views.get(f.id)?.visual?.setVisible(true);
      }
      return;
    }
    if (!this.car) this.car = this._makeCar();
    if (pv?.visual) pv.visual.setVisible(false);
    if (pv?.shadow) pv.shadow.setVisible(false);
    const x = p.px + (p.x - p.px) * alpha;
    const z = p.pz + (p.z - p.pz) * alpha;
    const bob = Math.sin(s.time.now / 60) * 1.5;
    this.car.setPosition(x, stage.groundY(z) + bob).setDepth(stage.depth(z));
    this.car.setAlpha(p.iframes > 0 && Math.floor(s.time.now / 80) % 2 ? 0.5 : 1);
    this.car.setAngle(((p.z - p.pz) || 0) * 0.6);
    // Punch out of the window
    const pt = p.punchT || 0;
    this.car.arm.width = pt > 0 ? Math.sin((pt / 16) * Math.PI) * 120 : 0;
    this.car.arm.y = -54 + (pt > 0 ? 6 : 0);

    // Obstacles
    const seen = new Set();
    for (const o of r.obs) {
      seen.add(o.id);
      let v = this.obs.get(o.id);
      if (!v) {
        const [key, w] = ART[o.kind];
        v = s.add.container(0, 0);
        const img = this._img(key, w);
        // Art faces left: flip the ones driving our way
        if (o.kind === 'slow' || o.kind === 'moped') img.setFlipX(true);
        const sh = s.add.ellipse(0, 4, w * 0.95, 34, 0x000000, 0.3);
        v.add([sh, img]);
        if (o.kind === 'moped') {
          const head = s.add.image(-4, -112, enemyPartTextureKey('nikita', 'head')).setOrigin(0.5, 0.8);
          head.setScale(54 / Math.max(head.width || 1, head.height || 1));
          const torso = s.add.image(-10, -70, enemyPartTextureKey('nikita', 'torso')).setOrigin(0.5, 0.5);
          torso.setScale(70 / Math.max(torso.width || 1, torso.height || 1));
          v.addAt(torso, 1);
          v.add(head);
        }
        v.img = img;
        this.obs.set(o.id, v);
      }
      const ox = o.px + (o.x - o.px) * alpha;
      const oz = o.pz + (o.z - o.pz) * alpha;
      v.setPosition(ox, stage.groundY(oz)).setDepth(stage.depth(oz));
      if (o.fall) {
        v.setAngle(-Math.min(80, o.fall * 3));
        v.setAlpha(Math.max(0, 1 - o.fall / 50));
      }
    }
    for (const [id, v] of this.obs) {
      if (!seen.has(id)) {
        v.destroy();
        this.obs.delete(id);
      }
    }

    // Повар's pots: a red mark, the pot comes down on it
    const seenM = new Set();
    for (const m of r.marks) {
      seenM.add(m.id);
      let v = this.marks.get(m.id);
      if (!v) {
        v = s.add.container(0, 0);
        const ring = s.add.ellipse(0, 0, 150, 40).setStrokeStyle(4, 0xff3b2f, 0.95).setFillStyle(0xff3b2f, 0.2);
        const pot = s.add.image(0, 0, s.textures.exists('kastrule_0') ? 'kastrule_0' : '__DEFAULT');
        pot.setScale(80 / Math.max(pot.width || 1, pot.height || 1));
        v.add([ring, pot]);
        v.ring = ring;
        v.pot = pot;
        v.t0 = m.t;
        this.marks.set(m.id, v);
      }
      const k = 1 - m.t / v.t0;
      v.setPosition(m.x, stage.groundY(m.z)).setDepth(stage.depth(m.z) - 1);
      v.ring.setScale(0.7 + k * 0.4);
      v.pot.setPosition(0, -700 * (1 - k) - 40);
      v.pot.angle += 9;
    }
    for (const [id, v] of this.marks) {
      if (!seenM.has(id)) {
        v.destroy();
        this.marks.delete(id);
      }
    }

    // Speed lines when flooring it
    if (r.v > 17 && Math.random() < 0.5) {
      const cam = s.cameras.main;
      const ly = cam.midPoint.y + (Math.random() - 0.3) * cam.height * 0.6;
      const line = s.add.rectangle(cam.midPoint.x + cam.width / cam.zoom / 2, ly, 160, 3, 0xffffff, 0.35).setDepth(6000);
      s.tweens.add({ targets: line, x: line.x - cam.width / cam.zoom - 200, duration: 260, onComplete: () => line.destroy() });
    }
    void CAR_HW;
  }
}
