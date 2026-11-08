import { stage } from './stage.js';

/** Painted-ish wooden crate drawn once into a canvas texture. */
export function crateTexture(scene) {
  // Painted crate (Cursor art); the canvas one is only a fallback
  if (scene.textures.exists('item_crate')) return 'item_crate';
  const key = 'crate_tex';
  if (scene.textures.exists(key)) return key;
  const w = 76;
  const h = 66;
  const tex = scene.textures.createCanvas(key, w, h);
  const c = tex.getContext();
  c.fillStyle = '#6b4321';
  c.fillRect(0, 0, w, h);
  // Planks
  const planks = ['#9a6532', '#a96f37', '#8f5c2c', '#a16a35'];
  for (let i = 0; i < 4; i += 1) {
    c.fillStyle = planks[i];
    c.fillRect(5, 5 + i * 14.5, w - 10, 12.5);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 6; k += 1) c.fillRect(8 + k * 11 + (i % 2) * 4, 7 + i * 14.5, 6, 1);
  }
  // Diagonal brace
  c.strokeStyle = '#5a3818';
  c.lineWidth = 9;
  c.beginPath();
  c.moveTo(8, h - 8);
  c.lineTo(w - 8, 8);
  c.stroke();
  c.strokeStyle = '#b57a3e';
  c.lineWidth = 5;
  c.stroke();
  // Frame + metal corners
  c.strokeStyle = '#3d250e';
  c.lineWidth = 5;
  c.strokeRect(2.5, 2.5, w - 5, h - 5);
  c.fillStyle = '#8c9298';
  for (const [x, y] of [[0, 0], [w - 12, 0], [0, h - 12], [w - 12, h - 12]]) {
    c.fillRect(x, y, 12, 12);
    c.fillStyle = '#5d6268';
    c.fillRect(x + 4, y + 4, 4, 4);
    c.fillStyle = '#8c9298';
  }
  tex.refresh();
  return key;
}

/** Loot crate: falls with a growing shadow (landing telegraph), shakes when hit. */
export class CrateView {
  constructor(scene, f) {
    this.scene = scene;
    this.id = f.id;
    this.seenSeq = f.animSeq;
    this.bodyH = 66;
    this.shake = 0;
    this.shadow = scene.add.ellipse(0, 0, 90, 22, 0x000000, 0.35).setDepth(99);
    const anvil = f.kind === 'anvil' && scene.textures.exists('nakovalna_0');
    // Arena-goal props: the kiosk to defend and the cameras to break
    const goalTex = { objective: ['item_kiosk', 250, 150], target_cam: ['item_camera_tripod', 190, 70], entry: [`item_${f.art}`, f.artH || 200, 200] }[f.kind];
    this.img = scene.add
      .image(0, 0, goalTex && scene.textures.exists(goalTex[0]) ? goalTex[0] : anvil ? 'nakovalna_0' : crateTexture(scene))
      .setOrigin(0.5, 1);
    // Entry art is drawn facing left; flip what should face the road ahead
    if (f.kind === 'entry' && ['car_lada', 'moped'].includes(f.art)) this.img.setFlipX(true);
    if (!goalTex && !anvil && this.img.texture.key === 'item_crate') this.img.setScale(80 / this.img.height);
    if (goalTex) {
      this.img.setScale(goalTex[1] / this.img.height);
      this.shadow.setSize(goalTex[2], 24);
    }
    if (f.kind === 'objective') {
      // Health bar over the kiosk
      this.barBack = scene.add.rectangle(0, 0, 150, 12, 0x000000, 0.7).setOrigin(0.5, 0.5);
      this.barFill = scene.add.rectangle(0, 0, 146, 8, 0x5ad35a).setOrigin(0, 0.5);
      this.mark = scene.add.text(0, 0, 'ЗАЩИТИ', { fontFamily: 'Arial Black, Arial', fontSize: '18px', color: '#ffe36b', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5, 1);
    }
    if (anvil) {
      this.img.setScale(1.15);
      this.shadow.setFillStyle(0x550000, 0.4);
    }
  }

  flash() {}

  squash() {}

  telegraph() {}

  render(f, alpha, dt, frameMs) {
    const x = f.px + (f.x - f.px) * alpha;
    const z = f.pz + (f.z - f.pz) * alpha;
    const y = f.py + (f.y - f.py) * alpha;
    const gy = stage.groundY(z);
    if (f.animSeq !== this.seenSeq) {
      this.seenSeq = f.animSeq;
      this.shake = 120;
      this.img.setTintFill(0xffffff);
    }
    let ox = 0;
    if (this.shake > 0) {
      this.shake -= frameMs;
      ox = Math.sin(this.shake * 0.25) * 4;
      if (this.shake <= 60) this.img.clearTint();
    }
    // Shadow grows as the crate comes down — shows where it will land
    const k = Math.min(1, y / 560);
    this.shadow.setPosition(x, gy).setScale(1 - k * 0.6).setAlpha(0.35 + (1 - k) * 0.15);
    this.img.setPosition(Math.round(x + ox), Math.round(gy - y)).setDepth(stage.depth(z));
    const dmg = 1 - f.hp / f.maxHp;
    if (this.barBack) {
      const top = Math.round(gy - this.img.displayHeight - 18);
      const d = stage.depth(z) + 1;
      this.barBack.setPosition(x, top).setDepth(d);
      this.barFill.setPosition(x - 73, top).setDepth(d).setSize(146 * (1 - dmg), 8);
      this.barFill.setFillStyle(dmg > 0.6 ? 0xe04a3a : dmg > 0.3 ? 0xe0b43a : 0x5ad35a);
      this.mark.setPosition(x, top - 8).setDepth(d).setAlpha(0.7 + Math.sin(Date.now() / 200) * 0.3);
      if (!this.img.isTinted || this.shake <= 60) { const g = Math.round(255 - dmg * 90); this.img.setTint((255 << 16) | (g << 8) | g); }
    }
    this.img.setAngle(f.y > 0 ? Math.sin(y * 0.02) * 6 : dmg * 4 * Math.sign(ox || 1));
  }

  destroy() {
    this.shadow.destroy();
    this.img.destroy();
    this.barBack?.destroy();
    this.barFill?.destroy();
    this.mark?.destroy();
  }
}
