import { stage } from './stage.js';

/** Painted-ish wooden crate drawn once into a canvas texture. */
function crateTexture(scene) {
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
    this.img = scene.add.image(0, 0, anvil ? 'nakovalna_0' : crateTexture(scene)).setOrigin(0.5, 1);
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
    this.img.setAngle(f.y > 0 ? Math.sin(y * 0.02) * 6 : dmg * 4 * Math.sign(ox || 1));
  }

  destroy() {
    this.shadow.destroy();
    this.img.destroy();
  }
}
