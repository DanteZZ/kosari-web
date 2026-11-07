import Phaser from 'phaser';
import { createRng } from '../../sim/rng.js';
import { ROAD_Y, LANE_DEPTH } from '../stage.js';
import { ForestWorld, WORLD_GEOM } from './ForestWorld.js';
import THEMES from './themes.gen.json';
import { KITS as ALL_KITS, kitAssets, kitUrl, kitTexKey, kitReady, joinFor, joinTexKey, joinUrl, joinReady } from './kits.js';

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
 * paintings join without seams.
 *
 * Joins: every scenery layer of a kit segment is masked to the segment's own
 * road range [from, to) in world space, whatever its scroll factor, so all
 * layers are cut on the same screen line: the join. A tall piece (tree trunk,
 * pillar, brick pier...) stands there and hides the cut; it also gets a dark
 * copy passing in front of the camera. Only the ground (road, below, decals,
 * bottom row) still cross-fades.
 */

const { ROAD_TOP, ROAD_BOTTOM } = WORLD_GEOM;
const WALL_FX = 0.55;
/** Minimum on-screen wall height; above it the theme's sky colour fills in. */
const WALL_MIN = 560;
/** Painted strips are shown at this scale (sources are ~3000 px wide). */
const ART_SCALE = 1.05;
const FLOOR_H = ROAD_BOTTOM - ROAD_TOP + 420;
const FADE = 260;
const PROP_Y = ROAD_TOP + 50;
/** Wide enough for any screen: how far layers run past a join (layer px). */
const VW_MAX = 2200;
/** Join piece: bottom edge on the road, top far above any camera position. */
const JOIN_BASE = ROAD_TOP + 48;
const JOIN_TOP = -2600;
const FG_FX = 1.28;

export const themeKey = (theme, part) => `th_${theme}_${part}`;

/** Theme ids used by a map (for the loader). */
export function mapThemes(map) {
  const segs = map?.world || [{ theme: 'forest' }];
  return [...new Set(segs.map((s) => s.theme).filter((t) => t !== 'forest' && (THEMES[t] || KITS[t])))];
}

/** Join pieces a map needs (one per segment boundary). */
export function mapJoins(map) {
  const segs = map?.world || [];
  const out = [];
  for (let i = 1; i < segs.length; i += 1) out.push(joinFor(segs[i - 1].theme, segs[i].theme).piece);
  return [...new Set(out)];
}

export function preloadThemes(scene, map) {
  const V = 'th1';
  for (const piece of mapJoins(map)) if (joinReady(piece)) scene.load.image(joinTexKey(piece), `${joinUrl(piece)}?v=${V}`);
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
    // Screen-fixed sky of the first segment; later ones bring their own (curtain)
    this.skies = this.segs.map((sg, i) => {
      if (sg.theme === 'forest' || i > 0) return null;
      const im = scene.add.image(0, 0, this._skyTexture(sg.theme)).setOrigin(0).setScrollFactor(0).setDepth(-99);
      tagBg(im);
      return im;
    });
    this.kitLayers = [];
    // One world-space mask per segment: its road range, full height
    this.masks = this.segs.map((sg, i) => {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const x0 = i === 0 ? -50000 : sg.from;
      const x1 = i === this.segs.length - 1 ? 1e6 : sg.to;
      g.fillStyle(0xffffff, 1).fillRect(x0, -50000, x1 - x0, 100000);
      return g.createGeometryMask();
    });

    this.wall = scene.add.container(0, 0).setDepth(-50);
    this.floor = scene.add.container(0, 0).setDepth(-29);
    this.props = scene.add.container(0, 0).setDepth(-27);
    this.fg = scene.add.container(0, 0).setDepth(3000);
    for (const c of [this.wall, this.floor, this.props]) tagBg(c);

    this.segs.forEach((s, i) => {
      if (KITS[s.theme]) this._buildKit(s, i);
      else if (s.theme !== 'forest') this._buildSegment(s, i);
    });
    for (let i = 1; i < this.segs.length; i += 1) this._join(this.segs[i - 1], this.segs[i], i);
    for (const c of this.kitLayers) if (c.clip != null) c.setMask(this.masks[c.clip]);
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
  _kitLayer(fx, depth, fg = false, clip = null) {
    const c = this.scene.add.container(0, 0).setDepth(depth);
    c.fx = fx;
    c.isFg = fg;
    /** Segment index whose mask cuts this layer (null: not masked). */
    c.clip = clip;
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

  /**
   * Span a masked layer must cover so that, with the mask cutting it at the
   * joins, nothing behind ever shows: from the join seen at the screen's left
   * edge to the next join seen at its right edge.
   */
  _clipSpan(seg, fx, i) {
    const first = i === 0;
    const last = i === this.segs.length - 1;
    const x0 = first ? -600 : seg.from * fx - 500;
    const x1 = last ? this.length * fx + VW_MAX + 400 : seg.to * fx + VW_MAX * (1 - fx) + 500;
    return [x0, x1];
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
    // Each later segment sits above the previous one so it can fade in over it
    const base = -19.9 + i * 2;
    let d = base + 0.05;
    let near = -4.6 + i * 2;
    this._curtain(seg, i, base);
    // Far → near layers, all cut hard at the joins by the segment mask
    for (const l of kit.layers) {
      const fx = l.fx;
      const c = this._kitLayer(fx, fx < 1 ? (d += 0.1) : (near += 0.05), false, i);
      const [x0, x1] = this._clipSpan(seg, fx, i);
      if (l.strip) {
        const key = kitTexKey(t, l.strip.key);
        this._strip(c, key, x0, x1, l.strip.y - l.strip.h, l.strip.h, false, null, false);
        if (l.tint) for (const im of c.list) im.setTint(l.tint);
      }
      if (l.items) {
        // Near items keep clear of the join pieces so none is cut in half
        const ix0 = fx >= 1 && i > 0 ? seg.from + 150 : x0;
        const ix1 = fx >= 1 && i < this.segs.length - 1 ? seg.to - 150 : x1;
        this._scatter(c, t, l.items, ix0, ix1, l.tint);
      }
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
    const road = this._kitLayer(1, -4.9 + i * 2);
    const below = this._kitLayer(1, -4.95 + i * 2);
    const bh = 700;
    if (kit.below?.color != null) below.add(s.add.rectangle(r0 + (fadeIn ? FADE : 0), ROAD_BOTTOM - 10, r1 - r0 - (fadeIn ? FADE : 0), bh, kit.below.color).setOrigin(0, 0));
    if (kit.road) this._strip(road, kitTexKey(t, kit.road.key), r0, r1, ROAD_TOP, kit.road.h, fadeIn, null, false);
    if (kit.edge) {
      // The far road edge pokes above the road: cut it at the join like the scenery
      const edge = this._kitLayer(1, -4.85 + i * 2, false, i);
      const [e0, e1] = this._clipSpan(seg, 1, i);
      this._strip(edge, kitTexKey(t, kit.edge.key), e0, e1, ROAD_TOP - kit.edge.h * 0.35, kit.edge.h, false, null, false);
    }
    if (kit.decals?.length) this._scatter(this._kitLayer(1, -4 + i * 2), t, kit.decals, r0 + FADE, r1 - FADE * 0.6);
    if (kit.bottom?.length) this._bottomRow(this._kitLayer(1, -3.5 + i * 2), t, kit.bottom, r0 + FADE * 0.5, r1 - FADE * 0.6);
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
   * Sky curtain: the segment's sky gradient behind its own far layers. The
   * segment mask cuts it at the join, so it hides everything of the previous
   * segment to the right of the join piece.
   */
  _curtain(seg, i, depth) {
    if (i === 0) return;
    const s = this.scene;
    const c = this._kitLayer(1, depth, false, i);
    const [, x1] = this._clipSpan(seg, 1, i);
    const top = JOIN_TOP;
    const h = ROAD_TOP + 60 - top;
    c.add(s.add.image(seg.from - 40, top, this._skyTexture(seg.theme)).setOrigin(0, 0).setDisplaySize(x1 - seg.from + 40, h));
  }

  /** Vertical tile of a join piece (falls back to a plain painted column). */
  _joinTexture(piece) {
    const s = this.scene;
    const key = joinTexKey(piece);
    if (s.textures.exists(key)) return key;
    const fk = `${key}__fallback`;
    if (s.textures.exists(fk)) return fk;
    const tex = s.textures.createCanvas(fk, 128, 384);
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, '#3a3a3c');
    g.addColorStop(0.3, '#8a8a86');
    g.addColorStop(0.75, '#5c5c5a');
    g.addColorStop(1, '#2c2c2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 384);
    tex.refresh();
    return fk;
  }

  /** Bottom-to-top gradient that grounds a join piece (contact shadow). */
  _aoTexture() {
    const s = this.scene;
    const key = 'join_ao';
    if (s.textures.exists(key)) return key;
    const tex = s.textures.createCanvas(key, 4, 128);
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
    tex.refresh();
    return key;
  }

  /** Stack a vertical tile from y1 (bottom) up past y0 in container c, centred on x. */
  _column(c, key, x, y0, y1, w, tint) {
    const s = this.scene;
    const src = s.textures.get(key).getSourceImage();
    const k = w / src.width;
    const h = src.height * k;
    for (let y = y1; y > y0; y -= h - 1) {
      const im = s.add.image(x, y, key).setOrigin(0.5, 1).setScale(k);
      if (tint != null) im.setTint(tint);
      c.add(im);
    }
  }

  /**
   * The piece standing at the join between segments a and b. It is drawn above
   * every scenery layer, on the road's far edge, and hides their hard cut; a
   * dark copy passes in front of the camera (doorway / under a bridge / trunk).
   */
  _join(a, b, i) {
    const s = this.scene;
    const cfg = joinFor(a.theme, b.theme);
    const key = this._joinTexture(cfg.piece);
    const x = b.from;
    const w = cfg.w;
    const back = this._kitLayer(1, 40 + i * 0.1);
    back.add(s.add.ellipse(x, JOIN_BASE - 4, w * 1.7, 34, 0x000000, 0.35));
    this._column(back, key, x, JOIN_TOP, JOIN_BASE, w, 0xd8d8d2);
    back.add(s.add.image(x, JOIN_BASE, this._aoTexture()).setOrigin(0.5, 1).setDisplaySize(w + 2, 150));
    if (!cfg.front) return;
    // Same scroll rule as the kit foreground: passes mid-screen together with the join
    const vw = Math.max(this.viewW, 1400);
    const fx = (x - vw / 2) * FG_FX + vw / 2;
    const front = this._kitLayer(FG_FX, 3001 + i * 0.1, true);
    this._column(front, key, fx, JOIN_TOP - 1200, ROAD_BOTTOM + 900, w * 1.35, 0x5a5a60);
  }

  /**
   * Near edge of the road: a dense, slightly darkened row of pieces whose
   * bottoms sit below the screen edge, so only their tops show (bush tops,
   * piles, crates) — the same job the forest's bushes do.
   */
  _bottomRow(c, theme, pieces, x0, x1) {
    const s = this.scene;
    const r = this.rng;
    const ok = pieces.filter((p) => s.textures.exists(kitTexKey(theme, p.key)));
    if (!ok.length) return;
    const total = ok.reduce((a, p) => a + (p.weight ?? 1), 0);
    const pick = () => {
      let v = r.next() * total;
      for (const p of ok) if ((v -= p.weight ?? 1) <= 0) return p;
      return ok[ok.length - 1];
    };
    for (let x = x0 + r.range(0, 80); x < x1; ) {
      const p = pick();
      const key = kitTexKey(theme, p.key);
      const src = s.textures.get(key).getSourceImage();
      const sc = (p.h * r.range(0.85, 1.15)) / src.height;
      // Only the top ~45 % pokes above the road's near edge
      const im = s.add
        .image(x, ROAD_BOTTOM + src.height * sc * 0.55 + r.range(-6, 22), key)
        .setOrigin(0.5, 1)
        .setScale(sc)
        .setFlipX(r.chance(0.5))
        .setTint(0x9a9a92);
      c.add(im);
      // Pack them so the edge never shows gaps
      x += Math.max(60, src.width * sc * r.range(0.45, 0.75));
    }
  }

  /** Cross-fade segment skies around each join as the camera moves. */
  update(camX) {
    if (!this.skies) return;
    const mid = camX + this.viewW / 2;
    // The first segment's screen-fixed sky can rest once the camera is far past
    // its join (later segments draw their own sky curtain over it)
    const im = this.skies[0];
    if (im && this.segs.length > 1) im.setVisible(mid < this.segs[0].to + VW_MAX);
  }

  setBaseY(baseY, viewW, viewH) {
    this.baseY = baseY;
    this.viewW = viewW;
    this.forest?.setBaseY(baseY, viewW, viewH);
    for (const im of this.skies || []) im?.setDisplaySize(viewW, viewH);
  }
}

export { ROAD_Y, LANE_DEPTH };
