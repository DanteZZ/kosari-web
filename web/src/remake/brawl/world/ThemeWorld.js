import Phaser from 'phaser';
import { createRng } from '../../sim/rng.js';
import { ROAD_Y, LANE_DEPTH } from '../stage.js';
import { ForestWorld, WORLD_GEOM } from './ForestWorld.js';
import THEMES from './themes.gen.json';
import { KITS as ALL_KITS, kitAssets, kitUrl, kitTexKey, kitReady } from './kits.js';

/** Themes whose element kit is complete; the rest still use the painted backdrop. */
const KITS = Object.fromEntries(Object.entries(ALL_KITS).filter(([t]) => kitReady(t)));

/**
 * Map backgrounds built from segments along the road:
 *
 *   map.world = [{ theme: 'forest', to: 2600 }, { theme: 'highway', to: 4300 }, { theme: 'shawarma' }]
 *
 * 'forest' is the hand-assembled ForestWorld; every other theme comes from
 * assets/world/themes/<theme> (scripts/import_themes.py): a WALL strip with slow
 * parallax above the road, a FLOOR strip under the lane, and props standing
 * behind the lane. Strips are tiled with every other copy mirrored, so the AI
 * paintings join without seams. A segment fades in over the previous one.
 */

const { ROAD_TOP, ROAD_BOTTOM } = WORLD_GEOM;
const WALL_FX = 0.55;
/** Minimum on-screen wall height; above it the theme's sky colour fills in. */
const WALL_MIN = 560;
/** Painted strips are shown at this scale (sources are ~3000 px wide). */
const ART_SCALE = 1.05;
const FLOOR_H = ROAD_BOTTOM - ROAD_TOP + 420;
const FADE = 260;
/** Sky curtain of a segment: scroll factor and fade width (hides the previous distance). */
const CURTAIN_FX = 0.3;
const CURTAIN_FADE = 700;
const PROP_Y = ROAD_TOP + 50;

export const themeKey = (theme, part) => `th_${theme}_${part}`;

/** Theme ids used by a map (for the loader). */
export function mapThemes(map) {
  const segs = map?.world || [{ theme: 'forest' }];
  return [...new Set(segs.map((s) => s.theme).filter((t) => t !== 'forest' && (THEMES[t] || KITS[t])))];
}

export function preloadThemes(scene, map) {
  const V = 'th1';
  for (const t of mapThemes(map)) {
    if (KITS[t]) {
      for (const k of kitAssets(t)) scene.load.image(kitTexKey(t, k), `${kitUrl(t, k)}?v=${V}`);
      continue;
    }
    scene.load.image(themeKey(t, 'wall'), `assets/world/themes/${t}/wall.jpg?v=${V}`);
    scene.load.image(themeKey(t, 'floor'), `assets/world/themes/${t}/floor.jpg?v=${V}`);
    for (const p of THEMES[t].props) {
      scene.load.image(themeKey(t, p.key), `assets/world/themes/${t}/props/${p.key}.png?v=${V}`);
    }
  }
}

export class ThemeWorld {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ map: object|null, length: number, seed: number, tagBg: (o) => void }} opts
   */
  constructor(scene, { map, length, seed, tagBg }) {
    this.scene = scene;
    this.length = length;
    this.tagBg = tagBg;
    this.viewW = scene.scale.width;
    this.rng = createRng(seed ^ 0x5eed);
    const raw = map?.world || [{ theme: 'forest' }];
    // Resolve segment ranges [from, to)
    this.segs = [];
    let from = 0;
    raw.forEach((s, i) => {
      const to = i === raw.length - 1 ? length + 2000 : s.to;
      this.segs.push({ theme: KITS[s.theme] || THEMES[s.theme] || s.theme === 'forest' ? s.theme : 'forest', from, to });
      from = to;
    });

    const first = this.segs[0];
    this.forest = null;
    const forestSeg = this.segs.find((s) => s.theme === 'forest');
    if (forestSeg) {
      this.forest = new ForestWorld(scene, { length, seed, tagBg, endX: forestSeg.to < length ? forestSeg.to : null });
    }
    // Screen-fixed sky per segment; neighbours cross-fade as the camera passes the join
    this.skies = this.segs.map((sg) => {
      if (sg.theme === 'forest') return null;
      const im = scene.add.image(0, 0, this._skyTexture(sg.theme)).setOrigin(0).setScrollFactor(0).setDepth(-99);
      tagBg(im);
      return im;
    });
    this.kitLayers = [];

    this.wall = scene.add.container(0, 0).setDepth(-50);
    this.floor = scene.add.container(0, 0).setDepth(-29);
    this.props = scene.add.container(0, 0).setDepth(-27);
    this.fg = scene.add.container(0, 0).setDepth(3000);
    for (const c of [this.wall, this.floor, this.props]) tagBg(c);

    this.segs.forEach((s, i) => {
      if (KITS[s.theme]) this._buildKit(s, i);
      else if (s.theme !== 'forest') this._buildSegment(s, i);
    });
    for (const c of this.kitLayers) {
      tagBg(c);
      c.setScrollFactor(c.fx, 1, true);
    }
    this.kitFg = this.kitLayers.filter((c) => c.isFg);
    for (const c of this.kitFg) {
      // Foreground passes in front of the fighters: main camera, not the bg one
      c.__camTag = null;
      c.cameraFilter = 0;
      for (const ch of c.list) ch.cameraFilter = scene.bgCam ? scene.bgCam.id | (scene.uiCam?.id || 0) : 0;
    }
    // Children were added after tagging: tag again so the bg camera draws them
    for (const c of [this.wall, this.floor, this.props]) tagBg(c);
    this.wall.setScrollFactor(WALL_FX, 1, true);
    for (const c of [this.floor, this.props]) c.setScrollFactor(1, 1, true);
    this.fg.setScrollFactor(1.28, 1.12, true);
    try {
      this.wall.postFX.addBlur(0, 1, 1, 0.5);
    } catch (_) {
      /* Canvas renderer */
    }
  }

  /** Texture with the left FADE px faded to transparent (segment joins). */
  _fadedKey(key) {
    const s = this.scene;
    const fk = `${key}__fade`;
    if (s.textures.exists(fk)) return fk;
    const src = s.textures.get(key).getSourceImage();
    const tex = s.textures.createCanvas(fk, src.width, src.height);
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createLinearGradient(0, 0, FADE * 1.4, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FADE * 1.4, src.height);
    tex.refresh();
    return fk;
  }

  /** Lay a strip from x0 to x1 (layer coords), mirrored every other tile. */
  _strip(container, key, x0, x1, y, h, fadeIn, kx = null, mirror = true) {
    const s = this.scene;
    if (!s.textures.exists(key)) return;
    const src = s.textures.get(key).getSourceImage();
    const k = h / src.height;
    const sx = kx ?? k;
    const w = src.width * sx;
    let n = 0;
    for (let x = x0; x < x1; x += w - 1, n += 1) {
      const tk = n === 0 && fadeIn ? this._fadedKey(key) : key;
      const im = s.add.image(x, y, tk).setOrigin(0, 0).setScale(sx, k);
      // Mirror odd tiles (keeps the faded edge on the left for the first)
      if (mirror && n % 2 === 1) im.setFlipX(true);
      container.add(im);
    }
  }

  _buildSegment(seg, i) {
    const s = this.scene;
    const th = THEMES[seg.theme];
    const fadeIn = i > 0;
    const vw = Math.max(this.viewW, 1400);
    // Wall: segment boundary lines up with the floor boundary when it is mid-screen
    const wx = (x) => (x - vw / 2) * WALL_FX + vw / 2;
    const wFrom = i === 0 ? -400 : wx(seg.from) - FADE;
    const wTo = wx(Math.min(seg.to, this.length + 400)) + vw + 200;
    const wallH = Math.max(th.wall[1] * ART_SCALE, WALL_MIN);
    // Plain sky colour behind the wall top for very tall screens
    const sky = s.add.rectangle(wFrom + (fadeIn ? FADE : 0), ROAD_TOP - wallH - 1200, wTo - wFrom, 1210, Phaser.Display.Color.HexStringToColor(th.sky).color).setOrigin(0, 0);
    this.wall.add(sky);
    this._strip(this.wall, themeKey(seg.theme, 'wall'), wFrom, wTo, ROAD_TOP - wallH + 2, wallH, fadeIn, null, th.mirror !== false);

    const fFrom = i === 0 ? -400 : seg.from - FADE;
    const fTo = Math.min(seg.to, this.length + 600) + 300;
    // Floor keeps the painting's horizontal scale and only stretches in depth
    this._strip(this.floor, themeKey(seg.theme, 'floor'), fFrom, fTo, ROAD_TOP, FLOOR_H, fadeIn, ART_SCALE * 1.4, th.mirror !== false);

    // Props behind the lane: random picks, spaced out, a couple scaled down for depth
    const r = this.rng;
    const props = th.props.filter((p) => p.place !== 'fg' && s.textures.exists(themeKey(seg.theme, p.key)));
    if (props.length) {
      for (let x = seg.from + r.range(120, 300); x < Math.min(seg.to, this.length + 300) - 80; x += r.range(260, 560)) {
        const p = r.pick(props);
        const key = themeKey(seg.theme, p.key);
        const src = s.textures.get(key).getSourceImage();
        const sc = (p.h * r.range(0.9, 1.1)) / src.height;
        const im = s.add.image(x, PROP_Y + r.range(-6, 6), key).setOrigin(0.5, 1).setScale(sc).setFlipX(r.chance(0.5));
        this.props.add(im);
      }
    }
    // A dark soft shadow strip where floor meets wall (sells the depth)
    const shade = s.add.rectangle(fFrom, ROAD_TOP, fTo - fFrom, 26, 0x000000, 0.28).setOrigin(0, 0);
    this.floor.add(shade);
  }

  _skyTexture(theme) {
    const key = `sky_${theme}`;
    const s = this.scene;
    if (s.textures.exists(key)) return key;
    const tex = s.textures.createCanvas(key, 4, 512);
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    const sky = KITS[theme]?.sky || [THEMES[theme]?.sky || '#a9c6d8', THEMES[theme]?.sky || '#dfe8e6'];
    g.addColorStop(0, sky[0]);
    g.addColorStop(1, sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
    tex.refresh();
    return key;
  }

  /** New container for one kit layer of a segment. */
  _kitLayer(fx, depth, fg = false) {
    const c = this.scene.add.container(0, 0).setDepth(depth);
    c.fx = fx;
    c.isFg = fg;
    this.kitLayers.push(c);
    return c;
  }

  /** Visible span of a segment in a layer with scroll factor fx (joins line up mid-screen). */
  _layerSpan(seg, fx, i) {
    const vw = Math.max(this.viewW, 1400);
    const lx = (x) => (x - vw / 2) * fx + vw / 2;
    const from = i === 0 ? -600 : lx(seg.from) - FADE;
    const last = i === this.segs.length - 1;
    // Strips run on under the next segment's faded edge; the last one covers the map end
    const to = last ? lx(this.length + 400) + vw * 1.3 + 300 : lx(seg.to) + FADE * 0.6;
    return [from, to];
  }

  /** Scatter kit items along [x0, x1) in container c. */
  _scatter(c, theme, items, x0, x1, tint) {
    const s = this.scene;
    const r = this.rng;
    for (const it of items) {
      const key = kitTexKey(theme, it.key);
      if (!s.textures.exists(key)) continue;
      const src = s.textures.get(key).getSourceImage();
      let x = x0 + (it.first ?? r.range(0, (it.every[0] + it.every[1]) / 2));
      for (; x < x1; x += r.range(it.every[0], it.every[1])) {
        if (it.chance != null && !r.chance(it.chance)) continue;
        const y = Array.isArray(it.y) ? r.range(it.y[0], it.y[1]) : it.y + r.range(-4, 4);
        const sc = (it.h * r.range(0.92, 1.08)) / src.height;
        const im = s.add.image(x, y, key).setOrigin(0.5, 1).setScale(sc);
        if (it.flip !== false && !it.noFlip) im.setFlipX(r.chance(0.5));
        if (it.alpha != null) im.setAlpha(it.alpha);
        if (it.tint ?? tint) im.setTint(it.tint ?? tint);
        c.add(im);
      }
    }
  }

  _buildKit(seg, i) {
    const s = this.scene;
    const kit = KITS[seg.theme];
    const t = seg.theme;
    const fadeIn = i > 0;
    // Depths: forest layers are −100…−20; a kit segment draws above them so it can
    // fade in over the forest: sky curtain −19.9, far layers −19.8…, road −15, near −14…
    let d = -19.8;
    let near = -14;
    this._curtain(seg, i, CURTAIN_FX);
    // Far → near layers
    for (const l of kit.layers) {
      const fx = l.fx;
      const c = this._kitLayer(fx, fx < 1 ? (d += 0.2) : (near += 0.1));
      let [x0, x1] = this._layerSpan(seg, fx, i);
      // Distant layers start a little before the join so the horizon is never empty
      if (fx < 1 && i > 0) x0 -= (1 - fx) * 500;
      const x1Items = i === this.segs.length - 1 ? x1 : x1 - FADE * 0.6;
      if (l.strip) {
        const key = kitTexKey(t, l.strip.key);
        this._strip(c, key, x0, x1, l.strip.y - l.strip.h, l.strip.h, fadeIn, null, false);
        if (l.tint) for (const im of c.list) im.setTint(l.tint);
      }
      if (l.items) this._scatter(c, t, l.items, x0 + (fadeIn ? FADE : 0), x1Items, l.tint);
      if (l.blur) {
        try {
          c.postFX.addBlur(0, 1, 1, l.blur);
        } catch (_) {
          /* canvas */
        }
      }
    }
    // Road, its far edge, what lies below, decals
    const [r0, r1] = this._layerSpan(seg, 1, i);
    const road = this._kitLayer(1, -15);
    const below = this._kitLayer(1, -15.2);
    const bh = 700;
    if (kit.below?.color != null) below.add(s.add.rectangle(r0 + (fadeIn ? FADE : 0), ROAD_BOTTOM - 10, r1 - r0 - (fadeIn ? FADE : 0), bh, kit.below.color).setOrigin(0, 0));
    if (kit.road) this._strip(road, kitTexKey(t, kit.road.key), r0, r1, ROAD_TOP, kit.road.h, fadeIn, null, false);
    if (kit.edge) {
      const edge = this._kitLayer(1, -14.9);
      this._strip(edge, kitTexKey(t, kit.edge.key), r0, r1, ROAD_TOP - kit.edge.h * 0.35, kit.edge.h, fadeIn, null, false);
    }
    if (kit.decals?.length) this._scatter(this._kitLayer(1, -12), t, kit.decals, r0 + FADE, r1 - FADE * 0.6);
    if (kit.fgStrip) {
      const fx = 1.28;
      const [f0, f1] = this._layerSpan(seg, fx, i);
      const fgs = this._kitLayer(fx, 2990, true);
      this._strip(fgs, kitTexKey(t, kit.fgStrip.key), f0, f1, kit.fgStrip.y - kit.fgStrip.h, kit.fgStrip.h, fadeIn, null, false);
      for (const im of fgs.list) im.setTint(0x3a3040);
    }
    if (kit.fg?.length) {
      const fx = 1.28;
      const [f0, f1] = this._layerSpan(seg, fx, i);
      const fg = this._kitLayer(fx, 3000, true);
      this._scatter(fg, t, kit.fg, f0 + FADE, f1 - FADE * 0.6, 0x56524a);
    }
  }

  /**
   * Sky curtain: the segment's sky gradient as a layer behind its own far
   * layers, so it hides whatever the previous segment had in the distance.
   */
  _curtain(seg, i, fx) {
    if (i === 0) return;
    const s = this.scene;
    const c = this._kitLayer(fx, -19.9);
    const [x0, x1] = this._layerSpan(seg, fx, i);
    const top = -1400;
    const h = ROAD_TOP + 60 - top;
    const fadeKey = this._skyFadeTexture(seg.theme);
    const fw = CURTAIN_FADE;
    c.add(s.add.image(x0 - fw / 2, top, fadeKey).setOrigin(0, 0).setDisplaySize(fw, h));
    c.add(s.add.image(x0 + fw / 2 - 1, top, this._skyTexture(seg.theme)).setOrigin(0, 0).setDisplaySize(x1 - x0 - fw / 2 + 1, h));
  }

  _skyFadeTexture(theme) {
    const key = `skyfade_${theme}`;
    const s = this.scene;
    if (s.textures.exists(key)) return key;
    const src = s.textures.get(this._skyTexture(theme)).getSourceImage();
    const tex = s.textures.createCanvas(key, 64, 512);
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0, 64, 512);
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 512);
    tex.refresh();
    return key;
  }

  /** Cross-fade segment skies around each join as the camera moves. */
  update(camX) {
    if (!this.skies) return;
    const mid = camX + this.viewW / 2;
    this.skies.forEach((im, i) => {
      if (!im) return;
      const sg = this.segs[i];
      const a = Math.min(1, Math.max(0, (mid - (sg.from - 500)) / 1000));
      const b = i + 1 < this.segs.length ? Math.min(1, Math.max(0, (sg.to + 500 - mid) / 1000)) : 1;
      im.setAlpha(i === 0 ? b : Math.min(a, b));
      im.setVisible(im.alpha > 0.01);
    });
  }

  setBaseY(baseY, viewW, viewH) {
    this.baseY = baseY;
    this.viewW = viewW;
    this.forest?.setBaseY(baseY, viewW, viewH);
    for (const im of this.skies || []) im?.setDisplaySize(viewW, viewH);
  }
}

export { ROAD_Y, LANE_DEPTH };
