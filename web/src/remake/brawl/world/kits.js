/**
 * Element kits: how each theme is assembled from separate painted pieces
 * (assets/world/kits/<theme>/<key>.png, made by scripts/import_kits.py).
 *
 * World y: road top ≈ 536, lane 600…750, road bottom ≈ 816 (brawl/stage.js).
 *
 * sky:    [top, horizon] colours of the screen-fixed gradient
 * layers: back to front. Each layer has a scroll factor fx and either
 *   strip — { key, y (bottom edge), h (height) }  tiled horizontally
 *   items — [{ key, h, every: [min, max], y, jitter, chance, flip }]  scattered
 *   tint / alpha / blur for aerial perspective
 * road:   { key, h } tiled under the lane; edge: { key, h } strip along the far edge
 * below:  colour (or { key }) filling below the road
 * decals: items lying on the road (fx 1)
 * fg:     items passing in front of the camera (fx 1.28)
 */

import KIT_INDEX from './kits.gen.json';

const ROAD_TOP = 536;
const ROAD_BOTTOM = 816;

export const KITS = {
  highway: {
    sky: ['#7d8b99', '#c9cfd2'],
    layers: [
      { fx: 0.06, items: [{ key: '@cloud_1', h: 90, every: [300, 600], y: [60, 240], alpha: 0.75 }, { key: '@cloud_2', h: 70, every: [400, 700], y: [100, 260], alpha: 0.7 }] },
      { fx: 0.12, strip: { key: 'far_hills', y: ROAD_TOP - 80, h: 120 }, tint: 0x9aa6b0 },
      { fx: 0.2, strip: { key: 'far_fields', y: ROAD_TOP - 20, h: 150 }, tint: 0xb4bdb8 },
      { fx: 0.24, items: [{ key: 'truck_far', h: 46, every: [900, 1800], y: ROAD_TOP - 52 }], tint: 0xb4bdb8 },
      { fx: 0.45, strip: { key: 'mid_embankment', y: ROAD_TOP + 12, h: 170 }, tint: 0xd2d6cf },
      {
        fx: 1,
        items: [
          { key: 'lamp_post', h: 430, every: [520, 760], y: ROAD_TOP + 14 },
          { key: 'power_pole', h: 380, every: [700, 1200], y: ROAD_TOP + 8, chance: 0.6 },
        ],
      },
      { fx: 1, strip: { key: 'guardrail', y: ROAD_TOP + 30, h: 70 } },
      {
        fx: 1,
        items: [
          { key: 'billboard', h: 300, every: [1800, 2600], y: ROAD_TOP + 20 },
          { key: 'sign_blue', h: 210, every: [1100, 1700], y: ROAD_TOP + 32 },
          { key: 'road_sign_km', h: 80, every: [700, 1100], y: ROAD_TOP + 36 },
          { key: 'trash_bin', h: 70, every: [1300, 2000], y: ROAD_TOP + 36 },
          { key: 'car_lada', h: 110, every: [2600, 3600], y: ROAD_TOP + 40 },
        ],
      },
    ],
    edge: { key: 'roadside', h: 46 },
    road: { key: 'road', h: ROAD_BOTTOM - ROAD_TOP },
    below: { key: 'roadside', color: 0x5d5a4c },
    decals: [
      { key: 'cone', h: 56, every: [700, 1400], y: [ROAD_TOP + 40, ROAD_TOP + 50] },
      { key: 'tires', h: 70, every: [1200, 2000], y: [ROAD_BOTTOM - 20, ROAD_BOTTOM] },
    ],
    fg: [
      { key: 'weeds', h: 260, every: [600, 1100], y: ROAD_BOTTOM + 190 },
      { key: 'bush_dry', h: 200, every: [900, 1500], y: ROAD_BOTTOM + 190 },
    ],
  },

  shawarma: {
    sky: ['#3d3552', '#f0a060'],
    layers: [
      { fx: 0.06, items: [{ key: '@cloud_1', h: 90, every: [320, 640], y: [60, 220], alpha: 0.55, tint: 0xf0b090 }] },
      { fx: 0.14, strip: { key: 'far_city', y: ROAD_TOP - 60, h: 220 }, tint: 0x8a7a8a },
      { fx: 0.4, strip: { key: 'far_garages', y: ROAD_TOP + 10, h: 190 }, tint: 0xc8b8b0 },
      {
        fx: 1,
        items: [
          { key: 'street_lamp', h: 380, every: [700, 1000], y: ROAD_TOP + 20 },
          { key: 'pallets', h: 90, every: [900, 1400], y: ROAD_TOP + 36 },
        ],
      },
      {
        fx: 1,
        items: [
          { key: 'kiosk', h: 300, every: [1600, 1700], y: ROAD_TOP + 34, first: 420, noFlip: true },
          { key: 'drinks_fridge', h: 170, every: [800, 1200], y: ROAD_TOP + 40 },
          { key: 'grill', h: 150, every: [1300, 1800], y: ROAD_TOP + 40 },
          { key: 'plastic_table', h: 80, every: [500, 800], y: ROAD_TOP + 42 },
          { key: 'plastic_chair', h: 80, every: [600, 900], y: ROAD_TOP + 44 },
          { key: 'dog', h: 60, every: [2200, 3000], y: ROAD_TOP + 46 },
        ],
      },
    ],
    road: { key: 'ground', h: ROAD_BOTTOM - ROAD_TOP },
    below: { color: 0x2e2a2a },
    decals: [],
    fg: [{ key: '@weeds_hw', h: 240, every: [800, 1300], y: ROAD_BOTTOM + 190 }],
  },
};

// ---- Builders for the remaining themes ----------------------------------------

const BACK_Y = ROAD_TOP + 34;
const it = (key, h, every, extra = {}) => ({ key, h, every, y: BACK_Y, ...extra });

/** Outdoor: far strips (aerial haze) → mid strip → props behind the lane → road. */
function outdoor({ sky, far = [], mid = null, items = [], edge = 'roadside', fg = [], below = 0x3d4030, fgStrip = null }) {
  return {
    sky,
    layers: [
      { fx: 0.06, items: [{ key: '@cloud_1', h: 90, every: [320, 640], y: [60, 240], alpha: 0.7 }, { key: '@cloud_2', h: 70, every: [420, 760], y: [100, 260], alpha: 0.65 }] },
      ...far.map((f, i) => ({ fx: f.fx ?? 0.12 + i * 0.08, strip: { key: f.key, y: f.y, h: f.h }, tint: f.tint })),
      ...(mid ? [{ fx: mid.fx ?? 0.45, strip: { key: mid.key, y: mid.y ?? ROAD_TOP + 10, h: mid.h }, tint: mid.tint }] : []),
      { fx: 1, items },
    ],
    edge: edge ? { key: edge, h: 46 } : null,
    road: { key: 'road', h: ROAD_BOTTOM - ROAD_TOP },
    below: { color: below },
    decals: [],
    fg,
    fgStrip,
  };
}

/** Interior: one back wall strip (slow parallax) with the ceiling colour above it. */
function interior({ sky, wall = 'far_wall', wallH = 600, items = [], fg = [], below = 0x141414, fgStrip = null, folder }) {
  return {
    sky,
    folder,
    layers: [
      { fx: 0.62, strip: { key: wall, y: ROAD_TOP + 12, h: wallH } },
      { fx: 1, items },
    ],
    edge: null,
    road: { key: 'road', h: ROAD_BOTTOM - ROAD_TOP },
    below: { color: below },
    decals: [],
    fg,
    fgStrip,
  };
}

Object.assign(KITS, {
  village: outdoor({
    sky: ['#6fa0d0', '#dbe7ea'],
    far: [{ key: 'far_forest', y: ROAD_TOP - 60, h: 90, tint: 0x9fb0b8, fx: 0.1 }, { key: 'far_fields', y: ROAD_TOP - 6, h: 170, tint: 0xd6dccf, fx: 0.18 }],
    mid: { key: 'mid_houses', h: 230, tint: 0xe2e4dc },
    items: [it('fence', 110, [260, 460]), it('well', 170, [1300, 2000]), it('water_pump', 140, [1100, 1700]), it('bench', 80, [900, 1400]),
      it('hay_bale', 90, [800, 1300]), it('sunflowers', 180, [600, 1000]), it('cart', 120, [1600, 2400])],
    fg: [{ key: 'nettles', h: 240, every: [700, 1200], y: ROAD_BOTTOM + 190 }],
  }),
  stadium: outdoor({
    sky: ['#6fa0d0', '#dbe7ea'],
    far: [{ key: 'far_stands', y: ROAD_TOP + 4, h: 210, fx: 0.32, tint: 0xd8dcd6 }],
    mid: { key: 'mid_fence', y: ROAD_TOP + 30, h: 130, fx: 0.8 },
    items: [it('goal', 190, [1400, 1800]), it('scoreboard', 270, [2200, 3000], { noFlip: true }), it('ball_pile', 80, [700, 1200]), it('bench_subs', 130, [1000, 1600]),
      it('floodlight', 480, [1500, 2200])],
    edge: null,
  }),
  dacha: outdoor({
    sky: ['#8fa3b0', '#e0e4e1'],
    far: [{ key: 'far_dachas', y: ROAD_TOP - 6, h: 190, tint: 0xc4ccc6, fx: 0.2 }],
    mid: { key: 'mid_greenhouses', h: 210, tint: 0xe0e4de },
    items: [it('shed', 230, [1200, 1800]), it('scarecrow', 220, [1100, 1700]), it('barrel', 100, [700, 1100]), it('wheelbarrow', 80, [900, 1400]),
      it('apple_tree', 300, [600, 1000])],
    fg: [{ key: 'currant_bush', h: 210, every: [700, 1200], y: ROAD_BOTTOM + 190 }],
  }),
  cellar: interior({
    sky: ['#070b07', '#18241a'],
    wallH: 560,
    items: [it('jar_shelf', 230, [600, 1000]), it('pipes', 170, [900, 1400]), it('old_sofa', 120, [1300, 2000]), it('crates', 140, [700, 1200]),
      { key: 'bulb', h: 150, every: [700, 1100], y: ROAD_TOP - 250, noFlip: true }],
    below: 0x0e120e,
  }),
  panelki: outdoor({
    sky: ['#87909a', '#d2d6d8'],
    far: [{ key: 'far_blocks', y: ROAD_TOP - 10, h: 340, tint: 0xb4b9bc, fx: 0.16 }],
    mid: { key: 'mid_entrances', h: 240, tint: 0xdfe0de },
    items: [it('garage', 200, [1300, 1900]), it('swing', 190, [1400, 2100]), it('horizontal_bar', 210, [1500, 2200]), it('carpet_rack', 160, [1200, 1800]),
      it('trash_container', 130, [900, 1400]), it('lada', 110, [1600, 2400]), it('tree_poplar', 480, [700, 1100])],
    fg: [{ key: 'bush', h: 230, every: [800, 1300], y: ROAD_BOTTOM + 190 }],
  }),
  pc_club: interior({
    sky: ['#0d0b10', '#24202a'],
    items: [it('pc_desk', 150, [380, 620]), it('gaming_chair', 140, [500, 800]), it('arcade', 230, [1300, 1900]), it('admin_counter', 150, [2200, 3000]),
      it('water_cooler', 160, [1400, 2000])],
    fg: [{ key: 'energy_cans', h: 90, every: [900, 1500], y: ROAD_BOTTOM + 120 }],
  }),
  gym_street: outdoor({
    sky: ['#382c48', '#d8996a'],
    far: [{ key: 'far_buildings', y: ROAD_TOP - 10, h: 330, tint: 0xb0a2a8, fx: 0.2 }],
    mid: { key: 'mid_gym_front', h: 320, fx: 0.55 },
    items: [it('street_lamp', 380, [600, 900]), it('trash_bags', 80, [700, 1200])],
    edge: null,
  }),
  gym: interior({
    sky: ['#121416', '#2a2c2e'],
    items: [it('barbell_rack', 220, [700, 1100]), it('bench_press', 130, [600, 1000]), it('dumbbell_rack', 160, [800, 1300]), it('punching_bag', 230, [900, 1400])],
  }),
  museum: interior({
    sky: ['#24160f', '#3e281a'],
    wallH: 640,
    items: [it('column', 380, [700, 1000]), it('bust', 190, [800, 1300]), it('armor', 230, [1000, 1600]), it('vase', 160, [900, 1400]),
      it('rope_barrier', 100, [500, 800]), it('piano', 150, [2400, 3200])],
  }),
  river: outdoor({
    sky: ['#97a3a9', '#e0e5e3'],
    far: [{ key: 'far_shore', y: ROAD_TOP - 30, h: 210, tint: 0xc0c8c8, fx: 0.15 }],
    mid: { key: 'mid_water', y: ROAD_TOP + 14, h: 170, fx: 0.4 },
    items: [it('lamp', 340, [600, 900]), it('willow', 420, [1000, 1600]), it('bench', 90, [900, 1400]), it('boat', 80, [1600, 2400])],
    fg: [{ key: 'reeds', h: 240, every: [600, 1000], y: ROAD_BOTTOM + 190 }],
  }),
  sigma_gym: interior({
    sky: ['#030303', '#151515'],
    items: [it('statue', 330, [900, 1400]), it('greek_column', 380, [700, 1000]), it('spotlight', 200, [800, 1300])],
    fg: [{ key: 'kettlebells', h: 100, every: [800, 1300], y: ROAD_BOTTOM + 130 }],
    below: 0x060606,
  }),
  ring: interior({
    sky: ['#030303', '#141414'],
    items: [it('ring_post', 200, [900, 1300])],
    below: 0x060606,
  }),
  stream_house: interior({
    sky: ['#0b0916', '#241a38'],
    items: [it('rgb_desk', 150, [900, 1400]), it('ring_light', 200, [700, 1100]), it('sofa', 110, [1300, 2000]), it('neon_sign', 140, [1500, 2200], { noFlip: true }),
      it('boxes', 100, [800, 1300])],
  }),
  office: interior({
    sky: ['#c4ccd4', '#e6eaee'],
    items: [it('desk', 120, [500, 800]), it('plant', 150, [700, 1100]), it('cooler', 160, [1300, 1900]), it('coffee_machine', 130, [1500, 2200]),
      it('reception', 130, [2600, 3400])],
    below: 0x50545a,
  }),
  trading: interior({
    folder: 'office',
    sky: ['#c4ccd4', '#e6eaee'],
    items: [it('trading_screens', 180, [450, 750]), it('desk', 120, [600, 900]), it('plant', 150, [900, 1400])],
    below: 0x50545a,
  }),
  night_street: outdoor({
    sky: ['#07051a', '#341a4c'],
    far: [{ key: 'far_city', y: ROAD_TOP - 10, h: 360, fx: 0.15 }],
    mid: { key: 'mid_club_front', h: 300, fx: 0.55 },
    items: [it('luxury_car', 110, [1200, 1800]), it('velvet_rope', 100, [500, 800]), it('crowd_barrier', 100, [700, 1100]), it('bouncer_booth', 200, [2000, 2800])],
    edge: null,
    below: 0x0c0a14,
  }),
  stage: interior({
    sky: ['#05030c', '#1a0c30'],
    wall: 'far_screen',
    wallH: 620,
    items: [it('speaker_stack', 300, [700, 1100]), it('stage_light', 220, [500, 800]), it('pyro', 200, [900, 1400]), it('truss', 520, [1200, 1700])],
    fgStrip: { key: 'crowd', y: ROAD_BOTTOM + 230, h: 220 },
    below: 0x07050c,
  }),
});
KITS.club = { ...KITS.night_street, folder: 'night_street' };

/** True once every own piece of the kit has been imported (scripts/import_kits.py). */
export function kitReady(theme) {
  const k = KITS[theme];
  if (!k) return false;
  const have = new Set(KIT_INDEX[k.folder || theme] || []);
  return kitAssets(theme).every((key) => key.startsWith('@') || have.has(key));
}

/** Texture keys a kit needs: own pieces, plus '@shared' ones from other folders. */
export function kitAssets(theme) {
  const k = KITS[theme];
  if (!k) return [];
  const keys = new Set();
  const add = (key) => key && keys.add(key);
  for (const l of k.layers) {
    add(l.strip?.key);
    for (const it of l.items || []) add(it.key);
  }
  add(k.road?.key);
  add(k.edge?.key);
  add(k.below?.key);
  for (const x of [...(k.decals || []), ...(k.fg || [])]) add(x.key);
  add(k.fgStrip?.key);
  return [...keys];
}

/** Shared pieces ('@name'): forest sprites or another kit's element. */
const SHARED = {
  '@cloud_1': 'assets/world/sprites/cloud_1.png',
  '@cloud_2': 'assets/world/sprites/cloud_2.png',
  '@weeds_hw': 'assets/world/kits/highway/weeds.webp',
};

export function kitUrl(theme, key) {
  if (key.startsWith('@')) return SHARED[key];
  return `assets/world/kits/${KITS[theme]?.folder || theme}/${key}.webp`;
}

/** Phaser texture key of a kit piece (shared pieces are loaded once). */
export function kitTexKey(theme, key) {
  return key.startsWith('@') ? `kit_${key.slice(1)}` : `kit_${KITS[theme]?.folder || theme}_${key}`;
}
