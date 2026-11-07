import Phaser from 'phaser';
import { createRng } from '../../sim/rng.js';
import { ROAD_Y, LANE_DEPTH } from '../stage.js';
import { ForestWorld, WORLD_GEOM } from './ForestWorld.js';
import THEMES from './themes.gen.json';

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
const PROP_Y = ROAD_TOP + 50;

export const themeKey = (theme, part) => `th_${theme}_${part}`;

/** Theme ids used by a map (for the loader). */
export function mapThemes(map) {
  const segs = map?.world || [{ theme: 'forest' }];
  return [...new Set(segs.map((s) => s.theme).filter((t) => t !== 'forest' && THEMES[t]))];
}

export function preloadThemes(scene, map) {
  const V = 'th1';
  for (const t of mapThemes(map)) {
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
      this.segs.push({ theme: THEMES[s.theme] || s.theme === 'forest' ? s.theme : 'forest', from, to });
      from = to;
    });

    const first = this.segs[0];
    this.forest = null;
    const forestSeg = this.segs.find((s) => s.theme === 'forest');
    if (forestSeg) {
      this.forest = new ForestWorld(scene, { length, seed, tagBg, endX: forestSeg.to < length ? forestSeg.to : null });
    }
    this.sky = null;
    if (first.theme !== 'forest') {
      this.sky = scene.add.rectangle(0, 0, 4, 4, Phaser.Display.Color.HexStringToColor(THEMES[first.theme].sky).color).setOrigin(0).setScrollFactor(0).setDepth(-100);
      tagBg(this.sky);
    }

    this.wall = scene.add.container(0, 0).setDepth(-50);
    this.floor = scene.add.container(0, 0).setDepth(-29);
    this.props = scene.add.container(0, 0).setDepth(-27);
    this.fg = scene.add.container(0, 0).setDepth(3000);
    for (const c of [this.wall, this.floor, this.props]) tagBg(c);

    this.segs.forEach((s, i) => {
      if (s.theme !== 'forest') this._buildSegment(s, i);
    });
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
  _strip(container, key, x0, x1, y, h, fadeIn, kx = null) {
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
      if (n % 2 === 1) im.setFlipX(true);
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
    this._strip(this.wall, themeKey(seg.theme, 'wall'), wFrom, wTo, ROAD_TOP - wallH + 2, wallH, fadeIn);

    const fFrom = i === 0 ? -400 : seg.from - FADE;
    const fTo = Math.min(seg.to, this.length + 600) + 300;
    // Floor keeps the painting's horizontal scale and only stretches in depth
    this._strip(this.floor, themeKey(seg.theme, 'floor'), fFrom, fTo, ROAD_TOP, FLOOR_H, fadeIn, ART_SCALE * 1.4);

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

  setBaseY(baseY, viewW, viewH) {
    this.baseY = baseY;
    this.viewW = viewW;
    this.forest?.setBaseY(baseY, viewW, viewH);
    this.sky?.setSize(viewW, viewH);
  }
}

export { ROAD_Y, LANE_DEPTH };
