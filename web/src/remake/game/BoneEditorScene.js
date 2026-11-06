import Phaser from 'phaser';
import { BonePuppet } from './player/BonePuppet.js';
import {
  getLayout,
  exportLayoutJson,
  resetLayout,
  applyDefaultLayout,
} from './player/layoutState.js';
import { PART_LAYOUT as PLAYER_LAYOUT } from './player/parts.js';
import { getEnemySkin, enemyPartTextureKey } from './enemies/parts.js';
import { VIEW_W, VIEW_H } from './constants.js';

const EDITABLE = [
  'hips',
  'torso',
  'head',
  'arm_l_u',
  'arm_l_l',
  'arm_r_u',
  'arm_r_l',
  'leg_l_u',
  'leg_l_l',
  'leg_r_u',
  'leg_r_l',
];

/**
 * Click a part, nudge with arrows / WASD, edit pivot with IJKL, rotate [ ],
 * copy JSON with C. Esc = exit.
 * Pass data.skinId = 'nikita' | 'buiniy' | 'boss1' to edit an enemy skin.
 */
export class BoneEditorScene extends Phaser.Scene {
  constructor() {
    super('BoneEditor');
  }

  init(data) {
    this.onExit = data?.onExit;
    this.skinId = data?.skinId || 'player';
  }

  create() {
    this.cameras.main.setBackgroundColor('#1a1a22');
    this.add.rectangle(VIEW_W / 2, VIEW_H - 8, VIEW_W, 16, 0x3a2818).setDepth(0);

    this.groundY = VIEW_H - 40;
    this.root = this.add.container(VIEW_W / 2, this.groundY).setDepth(10);

    if (this.skinId === 'player') {
      applyDefaultLayout();
      this.puppet = new BonePuppet(this, this.root, { fit: false, animate: false });
      this.puppet.baseScale = 1 / 1.5;
      this.puppet.root.setScale(1 / 1.5);
      this.skinLabel = 'Игрок';
    } else {
      const skin = getEnemySkin(this.skinId);
      this.enemySkin = skin;
      this.puppet = new BonePuppet(this, this.root, {
        fit: false,
        animate: false,
        layout: skin.layout,
        texKey: (part) => enemyPartTextureKey(skin.id, part),
        targetH: skin.targetH,
      });
      this.puppet.baseScale = skin.scale;
      this.puppet.root.setScale(skin.scale);
      this.skinLabel = skin.label || skin.id;
    }

    this.viewZoom = 2.6;
    this._applyViewZoom();

    this.selected = 'torso';
    this.mode = 'pos';
    this.step = 1;
    this.pivotDots = {};
    this.hilite = this.add.graphics().setDepth(50);

    this._makePartsInteractive();
    this._buildPivotDots();
    this._bindKeys();
    this._bindWheel();
    this._bindUi();

    this.events.on('shutdown', () => this._teardownUi());
  }

  _activeLayout() {
    return this.puppet?._layout?.() || getLayout();
  }

  _exportJson() {
    if (this.skinId === 'player') return exportLayoutJson();
    return JSON.stringify(
      { skinId: this.skinId, layout: this._activeLayout() },
      null,
      2,
    );
  }

  _resetSkinLayout() {
    if (this.skinId === 'player') {
      resetLayout();
      return;
    }
    // Reset enemy layout to a fresh player default clone
    const fresh = JSON.parse(JSON.stringify(PLAYER_LAYOUT));
    const layout = this.enemySkin.layout;
    for (const k of Object.keys(layout)) delete layout[k];
    Object.assign(layout, fresh);
  }

  _bindWheel() {
    this.input.on('wheel', (pointer, _g, _dx, dy) => {
      pointer.event?.preventDefault?.();
      const delta = dy > 0 ? -0.15 : 0.15;
      this.viewZoom = Phaser.Math.Clamp(this.viewZoom + delta, 0.8, 6);
      this._applyViewZoom();
    });
  }

  _applyViewZoom() {
    const cam = this.cameras.main;
    cam.setZoom(this.viewZoom);
    cam.centerOn(VIEW_W / 2 - 40, this.groundY - 160);
  }

  _makePartsInteractive() {
    for (const name of EDITABLE) {
      const node = this.puppet.nodes[name];
      if (!node?.sprite) continue;
      node.sprite.setInteractive({ useHandCursor: true, pixelPerfect: false });
      node.sprite.on('pointerdown', () => {
        this.selected = name;
        this._refreshUi();
        this._drawHilite();
      });
    }
  }

  _buildPivotDots() {
    for (const name of EDITABLE) {
      const node = this.puppet.nodes[name];
      if (!node) continue;
      const dot = this.add.circle(0, 0, 5, 0xff2222, 1).setDepth(60);
      dot.setStrokeStyle(1, 0xffffff, 0.9);
      node.add(dot);
      this.pivotDots[name] = dot;
    }
  }

  _bindKeys() {
    this.input.keyboard.on('keydown', (e) => {
      const node = this.puppet.nodes[this.selected];
      if (!node) return;
      const fine = e.shiftKey;
      const step = fine ? 0.5 : this.mode === 'pivot' ? 0.01 : this.step;
      const layout = this._activeLayout();
      const cfg = layout[this.selected] || (layout[this.selected] = {});

      if (e.code === 'Tab') {
        e.preventDefault();
        const i = EDITABLE.indexOf(this.selected);
        const next = EDITABLE[(i + (e.shiftKey ? -1 : 1) + EDITABLE.length) % EDITABLE.length];
        this.selected = next;
        this._refreshUi();
        this._drawHilite();
        return;
      }

      if (e.code === 'KeyM') {
        this.mode = this.mode === 'pos' ? 'pivot' : 'pos';
        this._refreshUi();
        return;
      }

      if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        this.viewZoom = Phaser.Math.Clamp(this.viewZoom + 0.2, 1, 5);
        this._applyViewZoom();
        return;
      }
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        this.viewZoom = Phaser.Math.Clamp(this.viewZoom - 0.2, 1, 5);
        this._applyViewZoom();
        return;
      }

      if (e.code === 'KeyR' && e.ctrlKey) {
        e.preventDefault();
        this._resetSkinLayout();
        this.pivotDots = {};
        this.puppet.rebuild();
        if (this.skinId !== 'player' && this.enemySkin) {
          this.puppet.baseScale = this.enemySkin.scale;
          this.puppet.root.setScale(this.enemySkin.scale);
        } else {
          this.puppet.baseScale = 1 / 1.5;
          this.puppet.root.setScale(1 / 1.5);
        }
        this._makePartsInteractive();
        this._buildPivotDots();
        this._refreshUi();
        this._drawHilite();
        return;
      }

      if (e.code === 'KeyC' && (e.ctrlKey || e.metaKey)) return;

      if (e.code === 'KeyC') {
        this._copyJson();
        return;
      }

      if (e.code === 'Escape') {
        this.onExit?.();
        return;
      }

      if (this.mode === 'pivot' && node.sprite) {
        let ox = node.sprite.originX;
        let oy = node.sprite.originY;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') ox -= step;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') ox += step;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') oy -= step;
        if (e.code === 'ArrowDown' || e.code === 'KeyS') oy += step;
        ox = Phaser.Math.Clamp(ox, 0, 1);
        oy = Phaser.Math.Clamp(oy, 0, 1);
        node.sprite.setOrigin(ox, oy);
        cfg.originX = Math.round(ox * 1000) / 1000;
        cfg.originY = Math.round(oy * 1000) / 1000;
        this._refreshUi();
        this._drawHilite();
        return;
      }

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') node.x -= step;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') node.x += step;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') node.y -= step;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') node.y += step;
      if (e.code === 'BracketLeft') node.angle -= fine ? 0.5 : 2;
      if (e.code === 'BracketRight') node.angle += fine ? 0.5 : 2;

      cfg.x = Math.round(node.x * 10) / 10;
      cfg.y = Math.round(node.y * 10) / 10;
      cfg.angle = Math.round(node.angle * 10) / 10;
      this.puppet.restAngles[this.selected] = cfg.angle;
      if (this.selected === 'hips') this.puppet.hipsRestY = node.y;

      this._refreshUi();
      this._drawHilite();
    });
  }

  _bindUi() {
    let panel = document.getElementById('bone-editor-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'bone-editor-panel';
      panel.innerHTML = `
        <div class="be-head">Редактор костей · <span id="be-skin">—</span></div>
        <div class="be-row"><b id="be-sel">—</b> · режим <span id="be-mode">pos</span></div>
        <div class="be-help">
          Клик по части · Tab след.<br/>
          Стрелки / WASD — сдвиг<br/>
          [ ] — поворот · Shift — точно<br/>
          M — режим опоры (pivot)<br/>
          Скролл / +− — зум · C — JSON · Esc — меню
        </div>
        <textarea id="be-json" spellcheck="false"></textarea>
        <div class="be-actions">
          <button type="button" id="be-copy">Копировать JSON</button>
          <button type="button" id="be-fit">Fit по земле</button>
          <button type="button" id="be-back">В меню</button>
        </div>
      `;
      document.getElementById('app')?.appendChild(panel);
    }
    panel.classList.remove('hidden');
    this.ui = {
      panel,
      skin: panel.querySelector('#be-skin'),
      sel: panel.querySelector('#be-sel'),
      mode: panel.querySelector('#be-mode'),
      json: panel.querySelector('#be-json'),
    };
    panel.querySelector('#be-copy').onclick = () => this._copyJson();
    panel.querySelector('#be-fit').onclick = () => {
      this.puppet._fitToGround();
      this.puppet.writeLayoutFromNodes();
      this._applyViewZoom();
      this._refreshUi();
      this._drawHilite();
    };
    panel.querySelector('#be-back').onclick = () => this.onExit?.();
    this._refreshUi();
    this._drawHilite();
  }

  _teardownUi() {
    const panel = document.getElementById('bone-editor-panel');
    if (panel) panel.classList.add('hidden');
  }

  _refreshUi() {
    if (!this.ui) return;
    const layout = this._activeLayout();
    const cfg = layout[this.selected] || {};
    const node = this.puppet.nodes[this.selected];
    if (this.ui.skin) this.ui.skin.textContent = this.skinLabel || this.skinId;
    this.ui.sel.textContent = `${this.selected}  x:${cfg.x ?? node?.x} y:${cfg.y ?? node?.y} ∠${cfg.angle ?? node?.angle}  ox:${cfg.originX ?? node?.sprite?.originX ?? '-'} oy:${cfg.originY ?? node?.sprite?.originY ?? '-'}`;
    this.ui.mode.textContent = this.mode === 'pivot' ? 'PIVOT' : 'POS';
    this.ui.json.value = this._exportJson();

    for (const [name, dot] of Object.entries(this.pivotDots)) {
      if (!dot?.active) continue;
      dot.setFillStyle(name === this.selected ? 0xffee00 : 0xff2222, 1);
      dot.setRadius(name === this.selected ? 6 : 4);
    }
  }

  _drawHilite() {
    this.hilite.clear();
    const node = this.puppet.nodes[this.selected];
    if (!node?.sprite) return;
    const b = node.sprite.getBounds();
    this.hilite.lineStyle(2, 0x44ff88, 0.9);
    this.hilite.strokeRect(b.x, b.y, b.width, b.height);
  }

  _copyJson() {
    this.puppet.writeLayoutFromNodes();
    const text = this._exportJson();
    if (this.ui?.json) this.ui.json.value = text;
    navigator.clipboard?.writeText(text).then(
      () => {
        if (this.ui?.sel) this.ui.sel.textContent = 'JSON скопирован — вставь в чат';
      },
      () => {
        this.ui?.json?.select();
        document.execCommand('copy');
      },
    );
  }

  update() {
    this._drawHilite();
  }
}
