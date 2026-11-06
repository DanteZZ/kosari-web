import { stage } from './stage.js';

/**
 * Placeholder view for characters that don't have bone-puppet parts yet:
 * the original game's sprite, flipped by facing, with a little procedural
 * life (walk bob, throw lean, hurt shake). Swap for a puppet once a part
 * sheet exists (see web/art-requests/).
 */
const SPRITES = {
  // e.g. someone: { key: 'their_sprite_0', height: 260, facesLeft: true },
};

export class SpriteFighterView {
  constructor(scene, f) {
    this.scene = scene;
    this.id = f.id;
    this.kind = f.kind;
    this.seenSeq = f.animSeq;
    const cfg = SPRITES[f.kind] || { key: '__DEFAULT', height: 220, facesLeft: false };
    this.cfg = cfg;
    this.shadow = scene.add.ellipse(0, 0, 120, 26, 0x000000, 0.32).setDepth(99);
    this.img = scene.add.image(0, 0, scene.textures.exists(cfg.key) ? cfg.key : '__DEFAULT').setOrigin(0.5, 1);
    this.base = cfg.height / (this.img.height || cfg.height);
    this.img.setScale(this.base);
    try {
      this.img.postFX.addGlow(0x1a0f0f, 2.2, 0, false, 0.1, 5);
    } catch (_) {
      /* Canvas renderer */
    }
    this.bodyH = cfg.height;
    this.hipsH = cfg.height * 0.55;
    this.t = 0;
    this.flashT = 0;
    this.shake = 0;
    this.squashT = 0;
    this.squashAmt = 0;
  }

  flash(ms = 70) {
    this.flashT = ms;
    this.img.setTintFill(0xffffff);
  }

  squash(a) {
    this.squashAmt = a;
    this.squashT = 130;
  }

  telegraph() {}

  render(f, alpha, dt, frameMs) {
    const x = f.px + (f.x - f.px) * alpha;
    const z = f.pz + (f.z - f.pz) * alpha;
    const y = f.py + (f.y - f.py) * alpha;
    const gy = stage.groundY(z);
    this.t += dt;

    if (f.animSeq !== this.seenSeq) {
      this.seenSeq = f.animSeq;
      if (f.anim?.type === 'hurt') {
        this.flash(90);
        this.shake = 260;
      }
    }

    // Walk bob / throw lean / hurt shake
    let bob = 0;
    let lean = 0;
    let ox = 0;
    if (f.state === 'walk') bob = Math.abs(Math.sin(this.t * 9)) * 6;
    else bob = Math.sin(this.t * 2) * 1.5;
    if (f.state === 'attack') {
      const u = Math.min(1, f.mt / 20);
      lean = u < 0.7 ? -10 * (u / 0.7) : -10 + 26 * ((u - 0.7) / 0.3);
    }
    if (this.shake > 0) {
      this.shake -= frameMs;
      ox = Math.sin(this.shake * 0.12) * 6;
      lean += Math.sin(this.shake * 0.09) * 6;
    }
    if (f.state === 'airhit' || f.state === 'down' || f.state === 'dead') lean = 70 * (f.facing > 0 ? -1 : 1);

    const facingRight = f.facing > 0;
    const flip = this.cfg.facesLeft ? facingRight : !facingRight;
    let sx = 1;
    let sy = 1;
    if (this.squashT > 0) {
      this.squashT -= frameMs;
      const a = this.squashAmt * Math.max(0, this.squashT / 130);
      sx += a;
      sy -= a;
    }
    this.img
      .setFlipX(flip)
      .setScale(this.base * sx, this.base * (sy + bob * 0.002))
      .setAngle(lean * (facingRight ? 1 : -1) * (flip === facingRight ? 1 : 1))
      .setPosition(Math.round(x + ox), Math.round(gy - y - bob))
      .setDepth(stage.depth(z));
    this.shadow.setPosition(x, gy);

    // Off-screen between phases / fading out after death
    const hidden = f.away;
    const a = f.state === 'dead' ? Math.min(1, (f.removeT || 0) / 30) : hidden ? 0 : 1;
    this.img.setAlpha(a);
    this.shadow.setAlpha(0.32 * a);

    if (this.flashT > 0) {
      this.flashT -= frameMs;
      if (this.flashT <= 0) this.img.clearTint();
    }
  }

  destroy() {
    this.shadow.destroy();
    this.img.destroy();
  }
}

export const SPRITE_KINDS = new Set(Object.keys(SPRITES));
