import { stage } from './stage.js';

/**
 * Draws the village penalties (sim/penalty.js): the goal, the ball, your aim
 * mark and power bar, and where Дед glances before his kick.
 */
export class PenaltyView {
  constructor(scene) {
    this.scene = scene;
    this.gfx = scene.add.graphics();
    this.ball = null;
    this.ui = scene.add.graphics().setDepth(5000);
    this.label = null;
  }

  _goal(m, world) {
    const g = this.gfx;
    g.clear();
    const z0 = world.bounds.zMin + 6;
    const z1 = world.bounds.zMax - 6;
    const x = m.goalX + 70;
    const H = 230;
    const y0 = stage.groundY(z0);
    const y1 = stage.groundY(z1);
    // Net behind the line
    g.fillStyle(0xffffff, 0.08).fillRect(x, y0 - H, 70, y1 - y0 + H);
    g.lineStyle(1, 0xffffff, 0.35);
    for (let i = 0; i <= 12; i += 1) {
      const yy = y0 - H + ((y1 - y0 + H) * i) / 12;
      g.lineBetween(x, yy, x + 70, yy - 10);
    }
    for (let i = 0; i <= 5; i += 1) g.lineBetween(x + i * 14, y0 - H - i * 2, x + i * 14, y1 - i * 2);
    // Posts and crossbar
    g.lineStyle(10, 0xf2f2f2, 1);
    g.lineBetween(x, y0, x, y0 - H);
    g.lineBetween(x, y1, x, y1 - H);
    g.lineBetween(x, y0 - H, x, y1 - H);
    g.setDepth(stage.depth(z0) - 1);
    // A second, front post drawn over the players
    if (!this.front) this.front = this.scene.add.graphics();
    this.front.clear().lineStyle(10, 0xf2f2f2, 1).lineBetween(x, y1, x, y1 - H).setDepth(stage.depth(z1) + 5);
    // Penalty spot
    g.fillStyle(0xffffff, 0.9).fillEllipse(m.spotX, stage.groundY((z0 + z1) / 2), 22, 8);
  }

  render(world, alpha) {
    const m = world.mini;
    const s = this.scene;
    if (!m || m.type !== 'penalty' || m.done) {
      if (this.ball || this.label) this.destroy();
      return;
    }
    this._goal(m, world);
    const p = world.players()[0];
    // Ball: at the spot until kicked
    if (!this.ball) {
      this.ball = s.add.image(0, 0, s.textures.exists('item_football') ? 'item_football' : '__DEFAULT');
      this.ball.setScale(40 / Math.max(this.ball.width, this.ball.height));
      this.ballShadow = s.add.ellipse(0, 0, 34, 10, 0x000000, 0.35);
    }
    const bl = m.ball;
    let bx;
    let bz;
    let by = 0;
    if (bl) {
      bx = bl.px + (bl.x - bl.px) * alpha;
      bz = bl.pz + (bl.z - bl.pz) * alpha;
      by = bl.py + (bl.y - bl.py) * alpha;
      this.ball.angle += 18;
    } else {
      const kicker = m.phase === 'run' ? world.fighters.find((f) => f.id === m.keeper) : p;
      bx = m.spotX;
      bz = kicker ? kicker.z : 150;
    }
    this.ball.setPosition(bx, stage.groundY(bz) - 20 - by).setDepth(stage.depth(bz) + 3);
    this.ballShadow.setPosition(bx, stage.groundY(bz)).setDepth(stage.depth(bz) - 1);

    // Aim mark + power bar
    const ui = this.ui;
    ui.clear();
    if (m.phase === 'aim') {
      const gy = stage.groundY(m.aimZ);
      ui.lineStyle(4, 0xffd23f, 1).strokeEllipse(m.goalX + 70, gy - 70, 70, 70);
      ui.lineBetween(m.goalX + 50, gy - 70, m.goalX + 90, gy - 70).lineBetween(m.goalX + 70, gy - 90, m.goalX + 70, gy - 50);
      const x = p.x - 90;
      const y = stage.groundY(p.z) - 330;
      ui.fillStyle(0x000000, 0.7).fillRect(x - 3, y - 3, 186, 22);
      ui.fillStyle(0x2c8a3a, 1).fillRect(x + 180 * 0.6, y, 180 * 0.3, 16);
      ui.fillStyle(0xa02a22, 1).fillRect(x + 180 * 0.9, y, 180 * 0.1, 16);
      ui.fillStyle(0xffffff, 1).fillRect(x + 180 * m.power - 3, y - 4, 6, 24);
    }
    if (m.look != null) {
      // Дед glances at a corner (maybe a feint)
      const gy = stage.groundY(m.look);
      ui.fillStyle(0xff5a4a, 0.25 + 0.2 * Math.sin(s.time.now / 90)).fillEllipse(m.goalX, gy, 120, 34);
    }
    if (!this.label) {
      this.label = s.add
        .text(0, 0, '', { fontFamily: 'Arial Black, Arial', fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 4, align: 'center' })
        .setOrigin(0.5, 1)
        .setDepth(5001);
    }
    const hint =
      m.phase === 'aim'
        ? 'W/S — куда · J — бей в зелёное'
        : m.phase === 'run' || m.phase === 'save'
          ? 'W/S — вдоль ворот · L — прыжок'
          : '';
    this.label.setText(hint).setPosition(p.x, stage.groundY(p.z) - 345);
  }

  destroy() {
    this.ball?.destroy();
    this.ballShadow?.destroy();
    this.label?.destroy();
    this.front?.destroy();
    this.gfx.clear();
    this.ui.clear();
    this.ball = null;
    this.label = null;
    this.front = null;
  }
}
