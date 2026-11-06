import { BonePuppet } from '../game/player/BonePuppet.js';
import { getEnemySkin, enemyPartTextureKey } from '../game/enemies/parts.js';
import { MOVES } from '../sim/moves.js';
import { TICK_HZ } from '../sim/constants.js';
import { stage } from './stage.js';

const PLAYER_SCALE = 1 / 1.5;

/**
 * Renders one sim fighter with the existing bone puppet.
 * Reads state only — never writes back into the sim.
 *
 * visual (feet, screen pos) → spin (rotation pivot) → mount (puppet root, mirrored)
 */
export class FighterView {
  constructor(scene, f) {
    this.scene = scene;
    this.id = f.id;
    this.kind = f.kind;
    this.seenSeq = f.animSeq;

    this.shadow = scene.add.ellipse(0, 0, 74, 18, 0x000000, 0.3).setDepth(99);
    this.visual = scene.add.container(f.x, 0);
    this.spin = scene.add.container(0, 0);
    this.mount = scene.add.container(0, 0);
    this.visual.add(this.spin);
    this.spin.add(this.mount);

    if (f.kind === 'player') {
      this.puppet = new BonePuppet(scene, this.mount, { fit: false });
      this.puppet.baseScale = PLAYER_SCALE;
      this.puppet.root.setScale(PLAYER_SCALE);
    } else {
      const skin = getEnemySkin(f.kind);
      this.puppet = new BonePuppet(scene, this.mount, {
        fit: false,
        layout: skin.layout,
        texKey: (part) => enemyPartTextureKey(skin.id, part),
        targetH: skin.targetH,
      });
      this.puppet.baseScale = skin.scale;
      this.puppet.root.setScale(skin.scale);
    }
    const s = Math.abs(this.puppet.baseScale || PLAYER_SCALE);
    this.hipsH = Math.abs(this.puppet.hipsRestY ?? 222) * s;
    // Feet → top of head on screen (hips sit at ~65% of the height for these rigs)
    this.bodyH = this.hipsH * 1.52;

    this.sprites = Object.values(this.puppet.nodes)
      .map((n) => n.sprite)
      .filter(Boolean);
    this.flashT = 0;
    this.rot = 0;
    this.knockDir = 1;

    this.hpBar = null;
    if (f.team !== 'player') {
      this.hpBar = scene.add.graphics().setDepth(1500).setVisible(false);
    }
  }

  flash(ms = 70) {
    this.flashT = ms;
    for (const s of this.sprites) s.setTintFill(0xffffff);
  }

  /**
   * @param {object} f sim fighter
   * @param {number} alpha interpolation between previous and current tick
   * @param {number} dt seconds to advance animation (0 while frozen)
   * @param {number} frameMs real frame time (for flash timers)
   */
  render(f, alpha, dt, frameMs) {
    const x = f.px + (f.x - f.px) * alpha;
    const z = f.pz + (f.z - f.pz) * alpha;
    const y = f.py + (f.y - f.py) * alpha;
    const gy = stage.groundY(z);

    this.shadow.setPosition(x, gy);
    const lift = Math.min(1, y / 220);
    this.shadow.setScale(1 - lift * 0.45, 1 - lift * 0.45);
    this.shadow.setAlpha(0.3 * (1 - lift * 0.5));

    this.visual.setPosition(Math.round(x), Math.round(gy - y));
    this.visual.setDepth(stage.depth(z));

    // New one-shot (attack / hurt) started in the sim
    if (f.animSeq !== this.seenSeq) {
      this.seenSeq = f.animSeq;
      this._startAnim(f);
    }

    // Body rotation: somersault, knockdown fall, lying, getting up
    let targetRot = 0;
    let pivot = 0;
    let snap = 1 - Math.exp(-dt * 18);
    if (f.state === 'jump' && f.flip) {
      const u = Math.min(1, f.st / 30);
      targetRot = u * 360 * f.facing;
      pivot = this.hipsH * 0.75;
      snap = 1;
    } else if (f.state === 'airhit') {
      targetRot = this.knockDir * 55;
      pivot = 0;
    } else if (f.state === 'down' || f.state === 'dead') {
      targetRot = this.knockDir * 86;
      snap = 1 - Math.exp(-dt * 24);
    } else if (f.state === 'getup') {
      targetRot = 0;
      snap = 1 - Math.exp(-dt * 10);
    }
    if (snap >= 1) this.rot = targetRot;
    else {
      if (Math.abs(this.rot) > 180 && targetRot === 0) this.rot = 0;
      this.rot += (targetRot - this.rot) * snap;
    }
    this.spin.setPosition(0, -pivot);
    this.mount.setPosition(0, pivot);
    this.spin.setAngle(this.rot);

    if (!(f.state === 'jump' && f.flip)) this.puppet.setFacing(f.facing > 0 ? 1 : 0);

    this.puppet.tick(dt, {
      moving: f.state === 'walk' || f.state === 'dash',
      airborne: f.y > 2 && f.state !== 'airhit',
      falling: f.state === 'jump' && f.vy < 0,
      walkAmp: f.state === 'dash' ? 1.2 : 1,
      walkSpeed: f.team === 'player' ? 1.15 : 0.9,
    });

    // Dead enemies fade out before removal
    if (f.state === 'dead' && f.team !== 'player') {
      const a = Math.min(1, f.removeT / 30);
      this.visual.setAlpha(a);
      this.shadow.setAlpha(0.3 * a);
    } else if (f.iframes > 0 && (f.state === 'getup' || f.state === 'dash')) {
      this.visual.setAlpha(0.65 + 0.35 * Math.sin(f.st * 0.9));
    } else {
      this.visual.setAlpha(1);
    }

    if (this.flashT > 0) {
      this.flashT -= frameMs;
      if (this.flashT <= 0) for (const s of this.sprites) s.clearTint();
    }

    if (this.hpBar) {
      const show = f.hp < f.maxHp && !f.dead;
      this.hpBar.setVisible(show);
      if (show) {
        const w = 56;
        const bx = Math.round(x - w / 2);
        const by = Math.round(gy - y - this.bodyH - 14);
        this.hpBar.clear();
        this.hpBar.fillStyle(0x000000, 0.6).fillRect(bx - 1, by - 1, w + 2, 7);
        this.hpBar.fillStyle(0xe2463b, 1).fillRect(bx, by, Math.max(0, (w * f.hp) / f.maxHp), 5);
      }
    }
  }

  _startAnim(f) {
    const a = f.anim;
    if (!a) return;
    if (a.type === 'move') {
      const m = MOVES[a.id];
      this.puppet.playPunch(m.anim.kind, m.anim.step);
      if (this.puppet.oneshot) this.puppet.oneshot.dur = a.total / TICK_HZ;
    } else if (a.type === 'hurt') {
      this.knockDir = a.dir || 1;
      const dur = a.reaction === 'flinch' ? 0.3 : 0.5;
      this.puppet.playHurt(null, dur, { mirror: false });
      this.flash(a.reaction === 'kill' ? 110 : 70);
    }
  }

  destroy() {
    this.shadow.destroy();
    this.visual.destroy(true);
    this.hpBar?.destroy();
  }
}

