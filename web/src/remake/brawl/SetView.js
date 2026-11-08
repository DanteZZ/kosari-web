import { stage } from './stage.js';
import { VIEW_W, VIEW_H } from '../game/constants.js';

/**
 * Separate sets laid over the map's scenery for modes that happen "somewhere
 * else": the lift cabin (office) and the open river under the raft. The fight
 * keeps its sim coordinates; only the picture changes. Entering and leaving
 * fade through black.
 *
 *   lift  — the cabin wall behind the lane, steel floor, dark shaft around
 *   river — sky, far banks, water under the lane, a pier at the landing
 */
export class SetView {
  constructor(scene) {
    this.scene = scene;
    this.kind = null;
    this.parts = [];
  }

  _fade(then) {
    const s = this.scene;
    if (!this.black) {
      this.black = s.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W * 2, VIEW_H * 2, 0x000000, 1).setDepth(9800).setAlpha(0);
      s.tagUi(this.black);
    }
    s.tweens.killTweensOf(this.black);
    s.tweens.add({
      targets: this.black,
      alpha: 1,
      duration: 260,
      onComplete: () => {
        then();
        s.tweens.add({ targets: this.black, alpha: 0, duration: 420, delay: 120 });
      },
    });
  }

  _clear() {
    for (const o of this.parts) o.destroy();
    this.parts = [];
  }

  /** A tiled strip of the given size (or a flat colour if the art is missing). */
  _tile(key, w, h, color) {
    const s = this.scene;
    const o = s.textures.exists(key) ? s.add.tileSprite(0, 0, w, h, key) : s.add.rectangle(0, 0, w, h, color);
    this.parts.push(o);
    return o;
  }

  _build(kind, world) {
    const s = this.scene;
    this._clear();
    const roadTop = stage.groundY(world.bounds.zMin) - 30;
    const roadBot = stage.groundY(world.bounds.zMax) + 60;
    const W = VIEW_W * 2.6;
    if (kind === 'lift') {
      const L = world.elevator;
      const cw = L.right - L.left + 120;
      this.shaft = s.add.rectangle(0, 0, W, VIEW_H * 3, 0x0c0d10);
      this.parts.push(this.shaft);
      this.wallH = 560;
      this.wall = s.textures.exists('item_set_lift_wall') ? s.add.image(0, 0, 'item_set_lift_wall').setDisplaySize(cw, this.wallH) : s.add.rectangle(0, 0, cw, this.wallH, 0x7a8088);
      this.parts.push(this.wall);
      this.floor = this._tile('item_set_lift_floor', cw, roadBot - roadTop, 0x3a3d42);
      if (this.floor.setTileScale) this.floor.setTileScale((roadBot - roadTop) / (this.floor.texture.source[0].height || 1));
    } else if (kind === 'river') {
      this.sky = s.add.rectangle(0, 0, W, VIEW_H * 2, 0xb6c4c8);
      this.parts.push(this.sky);
      this.bankH = 120;
      this.banks = this._tile('item_set_river_banks', W, this.bankH, 0x6d7a6a);
      if (this.banks.setTileScale) this.banks.setTileScale(this.bankH / (this.banks.texture.source[0].height || 1));
      this.waterH = roadBot - roadTop + 260;
      this.water = this._tile('item_set_river_water', W, this.waterH, 0x2c5a6e);
      if (this.water.setTileScale) this.water.setTileScale(this.waterH / (this.water.texture.source[0].height || 1));
      if (s.textures.exists('item_set_river_pier')) {
        this.pier = s.add.image(0, 0, 'item_set_river_pier').setOrigin(0, 1);
        this.pier.setScale(420 / this.pier.height);
        this.parts.push(this.pier);
      }
    }
  }

  /** Call every frame. */
  render(world) {
    const want = world.elevator ? 'lift' : world.raftBox ? 'river' : null;
    if (want !== this.kind) {
      const k = want;
      this.kind = want;
      this._fade(() => {
        if (k && (world.elevator || world.raftBox)) this._build(k, world);
        else this._clear();
      });
    }
    if (!this.parts.length) return;
    const v = this.scene.cameras.main.worldView;
    const cx = v.centerX;
    const roadTop = stage.groundY(world.bounds.zMin) - 30;
    const roadBot = stage.groundY(world.bounds.zMax) + 60;
    const back = stage.depth(world.bounds.zMin) - 20;
    if (this.kind === 'lift' && world.elevator) {
      const L = world.elevator;
      const mid = (L.left + L.right) / 2;
      this.shaft.setPosition(cx, v.centerY).setDepth(back - 2);
      this.wall.setPosition(mid, roadTop - this.wallH / 2 + 4).setDepth(back - 1);
      this.floor.setPosition(mid, (roadTop + roadBot) / 2).setDepth(back - 1);
    } else if (this.kind === 'river') {
      this.sky.setPosition(cx, roadTop - this.bankH - VIEW_H + 40).setDepth(back - 3);
      this.banks.setPosition(cx, roadTop - this.bankH / 2 + 20).setDepth(back - 2);
      if (this.banks.tilePositionX != null) this.banks.tilePositionX = (v.x * 0.3) / this.banks.tileScaleX;
      this.water.setPosition(cx, roadTop + this.waterH / 2 - 20).setDepth(back - 1);
      // The river flows: the texture drifts on its own besides following the camera
      if (this.water.tilePositionX != null) this.water.tilePositionX = (v.x + this.scene.time.now * 0.06) / this.water.tileScaleX;
      // The landing pier waits at the end of the stretch
      if (this.pier && world.raftEndX) this.pier.setPosition(world.raftEndX - 60, roadBot + 10).setDepth(back);
    }
  }
}
