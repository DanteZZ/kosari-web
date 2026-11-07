import { createRng } from '../../sim/rng.js';
import { ROAD_Y, LANE_DEPTH } from '../stage.js';

/**
 * Forest assembled at runtime from loose painted parts (assets/world/sprites),
 * seeded per map so every run of a map looks the same but no two stretches repeat.
 *
 * World space: the walk lane is y = ROAD_Y … ROAD_Y + LANE_DEPTH (feet).
 * Every layer is a container with its own scroll factor (x and y), so jumping /
 * camera bob gives vertical parallax as well as horizontal.
 *
 * All of this lives on the background camera (desaturated in BrawlScene) except
 * the foreground layer, which sits in front of the fighters.
 */

/** Road art: dirt band starts this many px below the image top. */
const ROAD_DIRT_TOP = 58;
const ROAD_TOP = ROAD_Y - ROAD_DIRT_TOP - 6;
const ROAD_H = 280;
const ROAD_BOTTOM = ROAD_TOP + ROAD_H;
/** Where the back hedge stands (just behind the far road edge). */
const BACK_ROW_Y = ROAD_TOP + 22;

/** Haze per depth: far = pale, blue-grey, low contrast. */
const HAZE = {
  far: 0x8fa3ad,
  mid: 0xaebcb4,
  back: 0xcdd6cc,
};

const LAYERS = [
  // id        fx     fy    depth
  ['clouds', 0.04, 0.08, -90],
  ['hills', 0.1, 0.18, -80],
  ['far', 0.22, 0.32, -70],
  ['farFog', 0.22, 0.32, -65],
  ['mid', 0.45, 0.55, -60],
  ['midFog', 0.45, 0.55, -55],
  ['back', 1, 1, -40],
  ['road', 1, 1, -30],
  ['decal', 1, 1, -25],
  ['below', 1, 1, -20],
];

export class ForestWorld {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ length: number, seed: number, tagBg: (o) => void }} opts
   */
  constructor(scene, { length, seed, tagBg, endX = null }) {
    this.scene = scene;
    this.length = length;
    /** Near layers stop here when another theme takes over the road. */
    this.endX = endX;
    this.rng = createRng(seed);
    this.tagBg = tagBg;
    this.layers = {};
    this.baseY = 0;
    this.viewW = scene.scale.width;

    this._sky();
    for (const [id, fx, fy, depth] of LAYERS) {
      const c = scene.add.container(0, 0).setDepth(depth);
      c.setScrollFactor(fx, fy, true);
      c.fx = fx;
      c.fy = fy;
      tagBg(c);
      this.layers[id] = c;
    }
    // Foreground sits on the main (character) camera, in front of everyone
    this.fg = scene.add.container(0, 0).setDepth(3000);
    this.fg.setScrollFactor(1.28, 1.12, true);
    this.fg.fx = 1.28;
    this.fg.fy = 1.12;

    this._build();
    // Push each layer's scroll factor down to the children created by _build
    for (const c of [...Object.values(this.layers), this.fg]) c.setScrollFactor(c.fx, c.fy, true);
    for (const c of Object.values(this.layers)) tagBg(c);
    // Depth of field: soften the distant forest
    try {
      this.layers.far.postFX.addBlur(0, 1, 1, 1.1);
      this.layers.mid.postFX.addBlur(0, 1, 1, 0.6);
    } catch (_) {
      /* Canvas renderer: no FX */
    }
  }

  /** Width a layer must cover for the whole map at its scroll factor. */
  _span(fx) {
    if (this.endX != null) {
      // Distant layers only need to reach past the join (the next wall covers them)
      // Same join rule as ThemeWorld: the seam is mid-screen when the road join is
      const vw = Math.max(this.viewW, 1400);
      return fx >= 1 ? this.endX + 260 : (this.endX - vw / 2) * fx + vw / 2 + 420;
    }
    return this.length * fx + this.viewW * 1.6 + 400;
  }

  _img(layer, key, x, y, { scale = 1, flip = false, tint = null, alpha = 1, ox = 0.5, oy = 1 } = {}) {
    if (!this.scene.textures.exists(key)) return null;
    const im = this.scene.add.image(x, y, key).setOrigin(ox, oy).setScale(scale).setFlipX(flip).setAlpha(alpha);
    if (tint != null) im.setTint(tint);
    (layer === 'fg' ? this.fg : this.layers[layer]).add(im);
    return im;
  }

  _sky() {
    const s = this.scene;
    const key = 'sky_grad';
    if (!s.textures.exists(key)) {
      const tex = s.textures.createCanvas(key, 4, 512);
      const ctx = tex.getContext();
      const g = ctx.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, '#6f9fc4');
      g.addColorStop(0.55, '#a9c6d8');
      g.addColorStop(1, '#dfe8e6');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 512);
      tex.refresh();
    }
    this.sky = s.add.image(0, 0, key).setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
    this.tagBg(this.sky);
  }

  /** Seamless horizontal road tile: cross-fade the right edge into the left. */
  _roadTexture() {
    const s = this.scene;
    const key = 'road_seam';
    if (s.textures.exists(key)) return key;
    const src = s.textures.get('w_road').getSourceImage();
    const w = src.width;
    const h = src.height;
    const o = 160;
    const tex = s.textures.createCanvas(key, w - o, h);
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0);
    for (let x = 0; x < o; x += 1) {
      ctx.globalAlpha = 1 - x / o;
      ctx.drawImage(src, w - o + x, 0, 1, h, x, 0, 1, h);
    }
    ctx.globalAlpha = 1;
    tex.refresh();
    return key;
  }

  _build() {
    const r = this.rng;

    // ---- Clouds (slow, high)
    for (let x = -200; x < this._span(0.04); x += r.range(260, 520)) {
      this._img('clouds', r.chance(0.5) ? 'w_cloud_1' : 'w_cloud_2', x, r.range(70, 260), {
        scale: r.range(0.7, 1.5),
        alpha: r.range(0.55, 0.85),
        flip: r.chance(0.5),
      });
    }

    // ---- Distant hills, hazed
    for (let x = -300; x < this._span(0.1); x += r.range(260, 420)) {
      this._img('hills', 'w_hill', x, ROAD_TOP - 30 + r.range(-10, 20), {
        scale: r.range(1.3, 2.3),
        tint: HAZE.far,
        alpha: 0.9,
        flip: r.chance(0.5),
      });
    }

    // ---- Far forest line: dense, small, blue haze
    for (let x = -200; x < this._span(0.22); x += r.range(26, 70)) {
      const pine = r.chance(0.45);
      this._img('far', pine ? (r.chance(0.5) ? 'w_pine_1' : 'w_pine_2') : 'w_birch_far', x, ROAD_TOP - 12 + r.range(-8, 14), {
        scale: pine ? r.range(0.5, 0.8) : r.range(0.42, 0.62),
        tint: HAZE.far,
        flip: r.chance(0.5),
      });
    }
    this._fogBand('farFog', ROAD_TOP - 14, 0.22, 0.45);

    // ---- Mid forest: birches + pines, lighter haze
    for (let x = -200; x < this._span(0.45); x += r.range(60, 150)) {
      const pine = r.chance(0.3);
      const key = pine ? (r.chance(0.5) ? 'w_pine_1' : 'w_pine_2') : r.pick(['w_birch_1', 'w_birch_2', 'w_birch_3']);
      this._img('mid', key, x, ROAD_TOP + 2 + r.range(-6, 10), {
        scale: pine ? r.range(0.85, 1.15) : r.range(0.3, 0.42),
        tint: HAZE.mid,
        flip: r.chance(0.5),
      });
    }
    this._fogBand('midFog', ROAD_TOP + 8, 0.45, 0.3);

    // ---- Back row right behind the road: big birches + a hedge of bushes
    for (let x = -100; x < this._span(1); x += r.range(170, 420)) {
      this._img('back', r.pick(['w_birch_1', 'w_birch_2', 'w_birch_3']), x, BACK_ROW_Y + r.range(-4, 6), {
        scale: r.range(0.5, 0.72),
        tint: HAZE.back,
        flip: r.chance(0.5),
      });
      if (r.chance(0.25)) {
        this._img('back', r.chance(0.5) ? 'w_pine_1' : 'w_pine_2', x + r.range(60, 120), BACK_ROW_Y + 4, {
          scale: r.range(1.1, 1.5),
          tint: HAZE.back,
          flip: r.chance(0.5),
        });
      }
    }
    for (let x = -100; x < this._span(1); x += r.range(90, 160)) {
      this._img('back', r.chance(0.55) ? 'w_bush_1' : 'w_bush_2', x, BACK_ROW_Y + 18 + r.range(-6, 6), {
        scale: r.range(0.55, 0.95),
        tint: 0xd8e2d4,
        flip: r.chance(0.5),
      });
    }

    // ---- Road: one seamless tiled strip, broken up by decals
    const roadKey = this._roadTexture();
    const road = this.scene.add.tileSprite(-200, ROAD_TOP, this._span(1), ROAD_H, roadKey).setOrigin(0, 0);
    this.layers.road.add(road);

    for (let x = 0; x < this._span(1); x += r.range(180, 520)) {
      // Worn dirt patches on the lane
      this._img('decal', 'w_path', x, ROAD_Y + r.range(10, LANE_DEPTH - 10), {
        scale: r.range(0.6, 1.3),
        alpha: r.range(0.45, 0.8),
        flip: r.chance(0.5),
        oy: 0.5,
      });
    }
    for (let x = 0; x < this._span(1); x += r.range(140, 380)) {
      // Edge dressing: flowers / rocks / stumps along both road edges
      const top = r.chance(0.5);
      const y = top ? ROAD_TOP + 34 + r.range(-4, 8) : ROAD_BOTTOM - 40 + r.range(-6, 8);
      const roll = r.next();
      if (roll < 0.45) this._img('decal', 'w_flowers', x, y, { scale: r.range(0.6, 1), flip: r.chance(0.5) });
      else if (roll < 0.8) this._img('decal', 'w_rock_1', x, y + 6, { scale: r.range(0.25, 0.45), flip: r.chance(0.5) });
      else this._img('decal', 'w_stump', x, y + 4, { scale: r.range(0.45, 0.7), flip: r.chance(0.5) });
    }

    // ---- Below the road: dark grass falling away toward the camera
    const below = this.scene.add.rectangle(-200, ROAD_BOTTOM - 14, this._span(1), 900, 0x3d5228).setOrigin(0, 0);
    this.layers.below.add(below);
    for (let x = -100; x < this._span(1); x += r.range(110, 200)) {
      this._img('below', r.chance(0.5) ? 'w_bush_1' : 'w_bush_2', x, ROAD_BOTTOM + 30 + r.range(0, 30), {
        scale: r.range(0.7, 1.05),
        tint: 0xa9b89e,
        flip: r.chance(0.5),
      });
    }

    // ---- Foreground: sparse dark bushes that pass in front of the camera
    for (let x = 200; x < this._span(1.28); x += r.range(650, 1200)) {
      this._img('fg', r.chance(0.5) ? 'w_bush_1' : 'w_bush_2', x, ROAD_BOTTOM + 150 + r.range(0, 40), {
        scale: r.range(1.5, 2.1),
        tint: 0x4e5f45,
        flip: r.chance(0.5),
      });
    }
  }

  _fogBand(layer, y, fx, alpha) {
    for (let x = -300; x < this._span(fx); x += 1100) {
      this._img(layer, 'w_fog', x, y, { scale: 1, alpha, oy: 0.5, ox: 0, tint: 0xeef3f4 }).setScale(0.9, 0.55);
    }
  }

  /**
   * Re-anchor layers vertically so that, at camera scrollY = baseY, every layer
   * sits where it was designed (objY = designY − baseY·(1 − fy)).
   */
  setBaseY(baseY, viewW, viewH) {
    this.baseY = baseY;
    this.viewW = viewW;
    for (const c of [...Object.values(this.layers), this.fg]) {
      c.y = -baseY * (1 - c.fy);
    }
    this.sky.setDisplaySize(viewW, viewH);
  }
}

export const WORLD_GEOM = { ROAD_TOP, ROAD_BOTTOM };
