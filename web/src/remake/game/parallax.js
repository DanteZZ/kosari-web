import { VIEW_W, VIEW_H, LAYER_Y, LAYER_H, LAYER_W } from './constants.js';

const SKY = 0x7ec8f0;

/**
 * Draw a texture at native pixel size (no scale).
 * Two copies side-by-side for horizontal wrap.
 */
function makeStrip(scene, key, y, depth) {
  if (!scene.textures.exists(key)) return null;
  const frame = scene.textures.getFrame(key);
  const tw = frame?.width || LAYER_W;
  const th = frame?.height || LAYER_H;

  const a = scene.add.image(0, y, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
  const b = scene.add.image(tw, y, key).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
  a.setScale(1);
  b.setScale(1);

  return {
    a,
    b,
    tw,
    th,
    y,
    setY(ny) {
      this.y = ny;
      this.a.y = ny;
      this.b.y = ny;
    },
    /**
     * @param {number} scrollX
     * @param {number} factor horizontal parallax (0 = locked, 1 = 1:1)
     * @param {number} [jumpLift] px above walk line — far layers drift down (more sky)
     * @param {number} [yFactor] vertical parallax vs jumpLift
     */
    update(scrollX, factor, jumpLift = 0, yFactor = 0) {
      let ox = -Math.round(scrollX * factor) % this.tw;
      if (ox > 0) ox -= this.tw;
      if (ox <= -this.tw) ox += this.tw;
      // Jump higher → far layers rise (negative Y), not sink
      const oy = -Math.round(jumpLift * yFactor);
      this.a.x = ox;
      this.b.x = ox + this.tw;
      this.a.y = this.y + oy;
      this.b.y = this.y + oy;
    },
  };
}

/**
 * Parallax stack (back → front), matching Desktop/Clouds depth:
 * sky → clouds → far trees+fog → mid trees+fog → fog veil →
 * near world (uneven ground) → front grass.
 */
export function createParallax(scene) {
  scene.cameras.main.setBackgroundColor(SKY);

  const sky = scene.add
    .rectangle(0, 0, VIEW_W, VIEW_H, SKY)
    .setOrigin(0)
    .setScrollFactor(0)
    .setDepth(-100);

  const clouds = makeStrip(scene, 'layer_clouds', 0, -40);
  const far = makeStrip(scene, 'layer_far', LAYER_Y, -30);
  const mid = makeStrip(scene, 'layer_mid', LAYER_Y, -20);
  const fog = makeStrip(scene, 'layer_fog', LAYER_Y, -15);
  const world = makeStrip(scene, 'layer_world', LAYER_Y, -10);
  const grass = makeStrip(scene, 'layer_grass', LAYER_Y, 30);

  const layout = () => {
    sky.setSize(VIEW_W, VIEW_H);
    if (clouds) clouds.setY(Math.max(0, LAYER_Y - 30));
    if (far) far.setY(LAYER_Y);
    if (mid) mid.setY(LAYER_Y);
    if (fog) fog.setY(LAYER_Y);
    if (world) world.setY(LAYER_Y);
    if (grass) grass.setY(LAYER_Y);
  };

  layout();

  return {
    clouds,
    far,
    mid,
    fog,
    world,
    grass,
    resize: layout,
    /**
     * @param {number} scrollX
     * @param {number} [jumpLift] height above ground — far layers ease down (depth on jump)
     */
    update(scrollX, jumpLift = 0) {
      const lift = Math.max(0, jumpLift);
      // Vertical: clouds/far drift more; grass stays glued to the road
      clouds?.update(scrollX, 0.08, lift, 0.42);
      far?.update(scrollX, 0.22, lift, 0.28);
      mid?.update(scrollX, 0.4, lift, 0.16);
      fog?.update(scrollX, 0.48, lift, 0.1);
      world?.update(scrollX, 0.7, lift, 0.04);
      grass?.update(scrollX, 1.15, lift, 0);
    },
  };
}
