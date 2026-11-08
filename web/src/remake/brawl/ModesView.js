import { stage } from './stage.js';
import { TRAPS } from '../sim/td.js';
import { VIEW_W } from '../game/constants.js';

const TRAP_ART = { rake: ['item_rake', 110], petard: ['item_petard', 64], glue: ['item_glue_puddle', 170] };
const TRAP_COLOR = { rake: 0x9a6532, petard: 0xd83a2a, glue: 0xe8c43a };

/**
 * Panelki traps (sim/td.js) on the road and the PC club «Чат решает» poll
 * (sim/votes.js) in the corner of the screen.
 */
export class ModesView {
  constructor(scene) {
    this.scene = scene;
    this.traps = new Map();
    this.poll = null;
  }

  _trap(t) {
    const s = this.scene;
    const [key, w] = TRAP_ART[t.kind];
    let o;
    if (s.textures.exists(key)) {
      o = s.add.image(t.x, stage.groundY(t.z), key).setOrigin(0.5, 0.8);
      o.setScale(w / o.width);
    } else {
      o = s.add.ellipse(t.x, stage.groundY(t.z), TRAPS[t.kind].r * 1.6, TRAPS[t.kind].r * 0.5, TRAP_COLOR[t.kind], 0.7);
    }
    o.setDepth(stage.depth(t.z) - 3);
    return o;
  }

  render(world) {
    const s = this.scene;
    // ---- TD traps
    const td = world.td;
    const seen = new Set();
    for (const t of td?.traps || []) {
      seen.add(t.id);
      let o = this.traps.get(t.id);
      if (!o) {
        o = this._trap(t);
        this.traps.set(t.id, o);
      }
      o.setAlpha(t.cd > 0 ? 0.45 : 1);
    }
    for (const [id, o] of this.traps) {
      if (!seen.has(id)) {
        o.destroy();
        this.traps.delete(id);
      }
    }
    // Ghost of the trap you are about to place
    if (td?.phase === 'prep') {
      // Ghost of the trap you are about to set: the trap itself, see-through, with its reach
      const p = world.players()[0];
      const kind = Object.keys(TRAPS)[td.kind];
      if (!this.ghost) this.ghost = s.add.ellipse(0, 0, 10, 10, 0xffffff, 0.18).setStrokeStyle(2, 0xffffff, 0.7);
      if (this.ghostKind !== kind) {
        this.ghostKind = kind;
        this.ghostImg?.destroy();
        this.ghostImg = this._trap({ kind, x: 0, z: 0 }).setAlpha(0.55);
      }
      this.ghost.setVisible(!!p).setSize(TRAPS[kind].r * 2, TRAPS[kind].r * 0.9);
      if (p) {
        const gx = p.x + p.facing * 90;
        this.ghost.setPosition(gx, stage.groundY(p.z)).setDepth(stage.depth(p.z) - 3);
        this.ghostImg.setPosition(gx, stage.groundY(p.z)).setDepth(stage.depth(p.z) - 2).setAlpha(0.45 + 0.15 * Math.sin(s.time.now / 160));
      }
    } else if (this.ghost) {
      this.ghost.destroy();
      this.ghostImg?.destroy();
      this.ghost = null;
      this.ghostImg = null;
      this.ghostKind = null;
    }

    // ---- Chat poll (top right, under the weapon box)
    const v = world.votes;
    if (!v?.poll && !v?.active) {
      if (this.poll) {
        this.poll.destroy();
        this.poll = null;
      }
      return;
    }
    if (!this.poll) {
      this.poll = s.add.container(0, 0).setScrollFactor(0).setDepth(9000);
      this.poll.bg = s.add.rectangle(0, 0, 330, 150, 0x0d0b1a, 0.85).setOrigin(0).setStrokeStyle(2, 0x9147ff, 1);
      this.poll.title = s.add.text(12, 8, '', { fontFamily: 'Arial Black, Arial', fontSize: '17px', color: '#c9a6ff' });
      this.poll.g = s.add.graphics();
      this.poll.lines = [0, 1, 2].map((i) => s.add.text(14, 40 + i * 34, '', { fontFamily: 'Arial', fontSize: '15px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }));
      this.poll.add([this.poll.bg, this.poll.g, this.poll.title, ...this.poll.lines]);
      // HUD camera only
      s.tagUi(this.poll);
      for (const o of this.poll.list) s.tagUi(o);
    }
    const P = this.poll;
    P.setPosition(VIEW_W - 350, 190);
    P.g.clear();
    if (v.poll) {
      const total = v.poll.counts.reduce((a, b) => a + b, 0) || 1;
      P.bg.setSize(330, 150);
      P.title.setText(`ЧАТ РЕШАЕТ · ${Math.ceil(v.poll.t / 60)}с`);
      v.poll.options.forEach((id, i) => {
        const k = v.poll.counts[i] / total;
        P.g.fillStyle(0x2a2440, 1).fillRect(12, 38 + i * 34, 306, 26);
        P.g.fillStyle(0x9147ff, 0.85).fillRect(12, 38 + i * 34, 306 * k, 26);
        P.lines[i].setText(`${i + 1}. ${MOD_TITLES[id] || id}  ${Math.round(k * 100)}%`).setVisible(true);
      });
    } else {
      P.bg.setSize(330, 44);
      P.title.setText(`ЧАТ: ${MOD_TITLES[v.active.id]} · ${Math.ceil(v.active.t / 60)}с`);
      for (const l of P.lines) l.setVisible(false);
    }
  }
}

const MOD_TITLES = {
  moon: 'Гравитация Луны',
  double: 'Двойной урон всем',
  money: 'Дождь из косарей',
  swarm: 'Позвать ещё зрителей',
  heal: 'Задонатить аптечку',
  lazy: 'Враги — сонные',
  fast: 'Все на энергетиках',
};
