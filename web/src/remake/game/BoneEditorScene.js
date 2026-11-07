import Phaser from 'phaser';
import { BonePuppet } from './player/BonePuppet.js';
import { getLayout, resetLayout, applyDefaultLayout } from './player/layoutState.js';
import { PART_LAYOUT as PLAYER_LAYOUT } from './player/parts.js';
import { getEnemySkin, enemyPartTextureKey, ENEMY_SKINS } from './enemies/parts.js';
import { HEROES } from './heroes.js';
import { VARIANTS } from '../brawl/FighterView.js';
import { VIEW_W, VIEW_H } from './constants.js';

const EDITABLE = ['hips', 'torso', 'head', 'arm_l_u', 'arm_l_l', 'arm_r_u', 'arm_r_l', 'leg_l_u', 'leg_l_l', 'leg_r_u', 'leg_r_l'];
const LABEL = {
  hips: 'таз',
  torso: 'тело',
  head: 'голова',
  arm_l_u: 'л. плечо',
  arm_l_l: 'л. предплечье',
  arm_r_u: 'п. плечо',
  arm_r_l: 'п. предплечье',
  leg_l_u: 'л. бедро',
  leg_l_l: 'л. голень',
  leg_r_u: 'п. бедро',
  leg_r_l: 'п. голень',
};
/** Screen px: grab radius of pivot dots and the rotate handle. */
const GRAB = 11;
/** Screen px: rotate handle distance from the pivot. */
const HANDLE = 70;

/**
 * Bone editor for every rig (player + all skins).
 *
 * Mouse: drag a part — move it (children follow); drag a red dot — move the
 * pivot (the image stays put, the joint moves); drag the blue handle of the
 * selected part (or right-drag anywhere) — rotate it around its pivot.
 * Keys: arrows/WASD nudge, [ ] rotate, M pivot mode, Tab next part,
 * Ctrl+Z undo, P test walk, scroll zoom, middle-drag / Space-drag pan.
 */
export class BoneEditorScene extends Phaser.Scene {
  constructor() {
    super('BoneEditor');
  }

  init(data) {
    this.onExit = data?.onExit;
    this.skinId = data?.skinId || 'player';
    this.keepView = data?.view || null;
  }

  create() {
    // Keep the open skin in the address: a reload comes back to it
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('bones') || u.searchParams.has('dev')) {
        u.searchParams.set('bones', this.skinId);
        window.history.replaceState(null, '', u);
      }
    } catch (_) {
      /* ignore */
    }
    this.cameras.main.setBackgroundColor('#1a1a22');
    this.input.mouse?.disableContextMenu();
    this.groundY = VIEW_H - 40;
    this.add.rectangle(VIEW_W / 2, this.groundY + 400, 4000, 800, 0x2a2018).setDepth(0);
    this.add.rectangle(VIEW_W / 2, this.groundY, 4000, 1, 0x7a6040).setDepth(1);
    this.root = this.add.container(VIEW_W / 2, this.groundY).setDepth(10);

    this.undo = [];
    this.selected = 'torso';
    this.mode = 'pos';
    this.step = 1;
    this.walking = false;
    this.drag = null;
    this.overlay = this.add.graphics().setDepth(50);

    this._buildPuppet();

    const cam = this.cameras.main;
    if (this.keepView) {
      this.viewZoom = this.keepView.zoom;
      cam.setZoom(this.viewZoom);
      cam.centerOn(this.keepView.x, this.keepView.y);
    } else {
      this.viewZoom = 2;
      cam.setZoom(this.viewZoom);
      this._centerOnFigure();
    }

    this._bindPointer();
    this._bindKeys();
    this._bindUi();
    this.events.on('shutdown', () => this._teardownUi());
  }

  // ---------------------------------------------------------------- puppet

  _skinScale() {
    if (this.skinId === 'player') return 1 / 1.5;
    return this.enemySkin.scale;
  }

  _buildPuppet() {
    if (this.puppet) {
      // puppet.root is our own container: drop only the rig inside it
      this.root.removeAll(true);
      this.puppet = null;
    }
    if (this.skinId === 'player') {
      if (!this._playerLoaded) applyDefaultLayout();
      this._playerLoaded = true;
      this.puppet = new BonePuppet(this, this.root, { fit: false, animate: true });
      this.skinLabel = 'Поцык (игрок)';
    } else {
      const skin = getEnemySkin(this.skinId);
      this.enemySkin = skin;
      this.puppet = new BonePuppet(this, this.root, {
        fit: false,
        animate: true,
        layout: skin.layout,
        texKey: (part) => enemyPartTextureKey(skin.id, part),
        targetH: skin.targetH,
      });
      this.skinLabel = skin.label || skin.id;
    }
    this.puppet.baseScale = this._skinScale();
    this.puppet.root.setScale(this._skinScale());
    for (const name of EDITABLE) {
      const spr = this.puppet.nodes[name]?.sprite;
      if (!spr) continue;
      // Pixel-perfect so overlapping limbs pick the one actually under the cursor
      spr.setInteractive({ pixelPerfect: true, alphaTolerance: 40, useHandCursor: true });
    }
  }

  _layout() {
    return this.puppet?._layout?.() || getLayout();
  }

  /** Rebuild the puppet from the layout (after undo / reset / walk test). */
  _rebuild() {
    this._buildPuppet();
    this._refreshUi();
  }

  _snapshot() {
    this.puppet.writeLayoutFromNodes();
    this.undo.push(JSON.stringify(this._layout()));
    if (this.undo.length > 100) this.undo.shift();
  }

  _undo() {
    const s = this.undo.pop();
    if (!s) return;
    this._setLayout(JSON.parse(s));
    this._rebuild();
  }

  _setLayout(data) {
    const layout = this._layout();
    for (const k of Object.keys(layout)) delete layout[k];
    Object.assign(layout, data);
  }

  _resetSkinLayout() {
    if (this.skinId === 'player') {
      resetLayout();
      return;
    }
    this._setLayout(JSON.parse(JSON.stringify(this.enemySkin.defaultLayout || PLAYER_LAYOUT)));
  }

  /** Commit node transforms → layout (and keep rest angles / hips in sync). */
  _commit() {
    this.puppet.writeLayoutFromNodes();
    this._refreshUi();
  }

  // ---------------------------------------------------------------- geometry

  /** World (camera space) point → local space of container c. */
  _toLocal(c, wx, wy) {
    const m = c.getWorldTransformMatrix();
    const out = new Phaser.Math.Vector2();
    m.applyInverse(wx, wy, out);
    return out;
  }

  _pivotWorld(name) {
    const m = this.puppet.nodes[name].getWorldTransformMatrix();
    return { x: m.tx, y: m.ty, rot: m.rotationNormalized ?? m.rotation };
  }

  _handleWorld(name) {
    const p = this._pivotWorld(name);
    const r = HANDLE / this.viewZoom;
    // Along the bone's own "down" (limbs hang from their pivot)
    const a = p.rot + Math.PI / 2;
    return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
  }

  _near(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) * this.viewZoom <= GRAB;
  }

  // ---------------------------------------------------------------- pointer

  _bindPointer() {
    this.input.on('pointerdown', (pointer, over) => {
      if (this.walking) return;
      const w = { x: pointer.worldX, y: pointer.worldY };
      // Pan: middle button or Space held
      if (pointer.middleButtonDown() || this.keySpace?.isDown) {
        this.drag = { kind: 'pan', sx: pointer.x, sy: pointer.y, cx: this.cameras.main.scrollX, cy: this.cameras.main.scrollY };
        return;
      }
      // 1) rotate handle of the selected part
      if (this.selected !== 'hips' && this._near(w, this._handleWorld(this.selected))) {
        this._startRotate(this.selected, w);
        return;
      }
      // 2) pivot dots (selected first, then the rest, top-most parts first)
      const order = [this.selected, ...EDITABLE.slice().reverse().filter((n) => n !== this.selected)];
      for (const name of order) {
        if (!this.puppet.nodes[name]) continue;
        if (this._near(w, this._pivotWorld(name))) {
          this._select(name);
          if (name === 'hips' || pointer.rightButtonDown()) this._startMove(name, w);
          else this._startPivot(name, w);
          return;
        }
      }
      // 3) a part under the cursor
      const spr = over.find((o) => o.boneName && EDITABLE.includes(o.boneName));
      if (spr) {
        this._select(spr.boneName);
        if (pointer.rightButtonDown() || pointer.event?.altKey) this._startRotate(spr.boneName, w);
        else this._startMove(spr.boneName, w);
      }
    });

    this.input.on('pointermove', (pointer) => {
      const d = this.drag;
      if (!d) return;
      const w = { x: pointer.worldX, y: pointer.worldY };
      const node = this.puppet.nodes[d.name];
      if (d.kind === 'pan') {
        const cam = this.cameras.main;
        cam.setScroll(d.cx - (pointer.x - d.sx) / this.viewZoom, d.cy - (pointer.y - d.sy) / this.viewZoom);
        return;
      }
      if (d.kind === 'move') {
        const p = this._toLocal(node.parentContainer, w.x, w.y);
        node.x = d.nx + (p.x - d.px);
        node.y = d.ny + (p.y - d.py);
        if (d.name === 'hips') this.puppet.hipsRestY = node.y;
      } else if (d.kind === 'rotate') {
        const p = this._toLocal(node.parentContainer, w.x, w.y);
        const a = Phaser.Math.RadToDeg(Math.atan2(p.y - node.y, p.x - node.x));
        let ang = d.angle + Phaser.Math.Angle.ShortestBetween(d.a0, a);
        if (pointer.event?.shiftKey) ang = Math.round(ang / 5) * 5;
        node.angle = ang;
        this.puppet.restAngles[d.name] = ang;
      } else if (d.kind === 'pivot') {
        this._movePivotTo(d.name, w);
      }
      this._refreshUi(true);
    });

    this.input.on('pointerup', () => {
      if (!this.drag) return;
      const kind = this.drag.kind;
      this.drag = null;
      if (kind !== 'pan') this._commit();
    });

    this.input.on('wheel', (pointer, _g, _dx, dy) => {
      pointer.event?.preventDefault?.();
      this._zoomAt(dy > 0 ? 1 / 1.12 : 1.12, pointer);
    });
  }

  _select(name) {
    this.selected = name;
    this._refreshUi();
  }

  _startMove(name, w) {
    this._snapshot();
    const node = this.puppet.nodes[name];
    const p = this._toLocal(node.parentContainer, w.x, w.y);
    this.drag = { kind: 'move', name, px: p.x, py: p.y, nx: node.x, ny: node.y };
  }

  _startRotate(name, w) {
    this._snapshot();
    const node = this.puppet.nodes[name];
    const p = this._toLocal(node.parentContainer, w.x, w.y);
    this.drag = { kind: 'rotate', name, a0: Phaser.Math.RadToDeg(Math.atan2(p.y - node.y, p.x - node.x)), angle: node.angle };
  }

  _startPivot(name, w) {
    if (!this.puppet.nodes[name]?.sprite) return this._startMove(name, w);
    this._snapshot();
    this.drag = { kind: 'pivot', name };
    return null;
  }

  /**
   * Move the joint of `name` to world point w without moving any image: the
   * sprite origin changes, the node moves by the same amount, and the node's
   * children are shifted back so they stay where they were.
   */
  _movePivotTo(name, w) {
    const node = this.puppet.nodes[name];
    const spr = node.sprite;
    const p = this._toLocal(node, w.x, w.y); // offset from the current pivot, node space
    const fw = spr.width;
    const fh = spr.height;
    const ox = Phaser.Math.Clamp(spr.originX + p.x / fw, -0.5, 1.5);
    const oy = Phaser.Math.Clamp(spr.originY + p.y / fh, -0.5, 1.5);
    const dx = (ox - spr.originX) * fw;
    const dy = (oy - spr.originY) * fh;
    if (!dx && !dy) return;
    spr.setOrigin(ox, oy);
    // Node moves by (dx, dy) in its own rotated frame → parent frame
    const r = node.rotation;
    const sx = node.scaleX;
    const sy = node.scaleY;
    node.x += (dx * Math.cos(r) - dy * Math.sin(r)) * sx;
    node.y += (dx * Math.sin(r) + dy * Math.cos(r)) * sy;
    for (const ch of node.list) {
      if (ch === spr || !ch.boneName) continue;
      ch.x -= dx;
      ch.y -= dy;
    }
  }

  _zoomAt(f, pointer) {
    const cam = this.cameras.main;
    const before = pointer ? cam.getWorldPoint(pointer.x, pointer.y) : null;
    this.viewZoom = Phaser.Math.Clamp(this.viewZoom * f, 0.4, 8);
    cam.setZoom(this.viewZoom);
    if (before) {
      const after = cam.getWorldPoint(pointer.x, pointer.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    }
  }

  _centerOnFigure() {
    const b = this.puppet.root.getBounds();
    const cam = this.cameras.main;
    if (b.width > 0) {
      this.viewZoom = Phaser.Math.Clamp(Math.min((VIEW_H * 0.85) / b.height, (VIEW_W * 0.6) / b.width), 0.4, 8);
      cam.setZoom(this.viewZoom);
      cam.centerOn(b.centerX + 60 / this.viewZoom, b.centerY);
    } else cam.centerOn(VIEW_W / 2, this.groundY - 160);
  }

  // ---------------------------------------------------------------- keys

  _bindKeys() {
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
    this.input.keyboard.on('keydown', (e) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
      if (e.code === 'Escape') return this.onExit?.();
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        return this._undo();
      }
      if (e.code === 'KeyP') return this._toggleWalk();
      if (e.code === 'KeyF') return this._centerOnFigure();
      if (e.code === 'Equal' || e.code === 'NumpadAdd') return this._zoomAt(1.15);
      if (e.code === 'Minus' || e.code === 'NumpadSubtract') return this._zoomAt(1 / 1.15);
      if (this.walking) return null;
      if (e.code === 'Tab') {
        e.preventDefault();
        const i = EDITABLE.indexOf(this.selected);
        return this._select(EDITABLE[(i + (e.shiftKey ? -1 : 1) + EDITABLE.length) % EDITABLE.length]);
      }
      if (e.code === 'KeyM') {
        this.mode = this.mode === 'pos' ? 'pivot' : 'pos';
        return this._refreshUi();
      }
      const node = this.puppet.nodes[this.selected];
      if (!node) return null;
      const fine = e.shiftKey;
      const dir = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] }[e.code];
      if (dir) {
        e.preventDefault();
        if (!e.repeat) this._snapshot();
        if (this.mode === 'pivot' && node.sprite) {
          // Pivot nudge: 1 image px (0.25 with Shift), image stays put
          const st = fine ? 0.25 : 1;
          const m = node.getWorldTransformMatrix();
          const lx = dir[0] * st;
          const ly = dir[1] * st;
          this._movePivotTo(this.selected, { x: m.a * lx + m.c * ly + m.tx, y: m.b * lx + m.d * ly + m.ty });
        } else {
          const st = fine ? 0.5 : this.step * 2;
          node.x += dir[0] * st;
          node.y += dir[1] * st;
        }
        return this._commit();
      }
      if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        if (!e.repeat) this._snapshot();
        node.angle += (e.code === 'BracketLeft' ? -1 : 1) * (fine ? 0.5 : 2);
        return this._commit();
      }
      return null;
    });
  }

  /** P: play the walk / idle cycle on the current rig to see the joints bend. */
  _toggleWalk() {
    if (!this.walking) {
      this.puppet.writeLayoutFromNodes();
      this._walkSnap = JSON.stringify(this._layout());
      this.walking = true;
      this.walkT = 0;
    } else {
      this.walking = false;
      this._setLayout(JSON.parse(this._walkSnap));
      this._rebuild();
    }
    this._refreshUi();
  }

  // ---------------------------------------------------------------- UI

  _skinOptions() {
    const heroes = Object.values(HEROES).map((h) => [h.id === 'pocik' ? 'player' : h.skin, h.label]);
    const used = new Set(heroes.map(([id]) => id));
    const bosses = [];
    const others = [];
    for (const k of Object.values(ENEMY_SKINS)) {
      if (used.has(k.id)) continue;
      const isBoss = Object.values(VARIANTS).some((v) => v.skin === k.id && v.tint == null) || k.id === 'povar';
      (isBoss ? bosses : others).push([k.id, k.label || k.id]);
    }
    return [
      ['Герои', heroes.filter(([id]) => id === 'player' || ENEMY_SKINS[id])],
      ['Боссы', bosses],
      ['Враги', others],
    ];
  }

  _bindUi() {
    let panel = document.getElementById('bone-editor-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'bone-editor-panel';
      document.getElementById('app')?.appendChild(panel);
    }
    panel.innerHTML = `
      <div class="be-head">Кости · <select id="be-skinsel"></select></div>
      <div class="be-row"><b id="be-sel">—</b></div>
      <div class="be-row be-nums" id="be-nums"></div>
      <div class="be-parts" id="be-parts"></div>
      <div class="be-help">
        <b>Мышь:</b> тащи часть — сдвиг · тащи <span style="color:#ff5555">●</span> — опора (pivot)<br/>
        тащи <span style="color:#55aaff">●</span> или ПКМ / Alt+тащи — поворот (Shift — шаг 5°)<br/>
        ПКМ по опоре — сдвиг с опорой · колесо — зум · средняя кнопка / Space — панорама<br/>
        <b>Клавиши:</b> стрелки/WASD — сдвиг (Shift точнее) · [ ] — поворот · M — режим опоры<br/>
        Tab — след. часть · Ctrl+Z — отмена · P — проверка ходьбы · F — по центру
      </div>
      <textarea id="be-json" spellcheck="false"></textarea>
      <div class="be-actions">
        <button type="button" id="be-save">Сохранить в проект</button>
        <button type="button" id="be-walk">Ходьба (P)</button>
        <button type="button" id="be-undo">Отмена</button>
        <button type="button" id="be-reset">Сброс</button>
        <button type="button" id="be-copy">Копировать JSON</button>
        <button type="button" id="be-back">В меню</button>
      </div>`;
    panel.classList.remove('hidden');
    this.ui = {
      panel,
      sel: panel.querySelector('#be-sel'),
      nums: panel.querySelector('#be-nums'),
      parts: panel.querySelector('#be-parts'),
      json: panel.querySelector('#be-json'),
      walk: panel.querySelector('#be-walk'),
    };
    const sel = panel.querySelector('#be-skinsel');
    for (const [group, items] of this._skinOptions()) {
      if (!items.length) continue;
      const g = document.createElement('optgroup');
      g.label = group;
      for (const [id, label] of items) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = label;
        if (id === this.skinId) o.selected = true;
        g.appendChild(o);
      }
      sel.appendChild(g);
    }
    sel.onchange = () => {
      sel.blur();
      if (this.walking) this._toggleWalk();
      this.scene.restart({ onExit: this.onExit, skinId: sel.value });
    };
    // Part buttons (parts hidden behind others are easier to pick here)
    for (const name of EDITABLE) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.part = name;
      b.textContent = LABEL[name];
      b.onclick = () => {
        b.blur();
        this._select(name);
      };
      this.ui.parts.appendChild(b);
    }
    this.ui.json.onchange = () => {
      try {
        const data = JSON.parse(this.ui.json.value);
        this._snapshot();
        this._setLayout(data.layout || data);
        this._rebuild();
      } catch (_) {
        this.ui.sel.textContent = 'JSON не разобрался';
      }
    };
    panel.querySelector('#be-copy').onclick = () => this._copyJson();
    panel.querySelector('#be-save').onclick = () => this._saveToProject();
    panel.querySelector('#be-walk').onclick = (e) => {
      e.target.blur();
      this._toggleWalk();
    };
    panel.querySelector('#be-undo').onclick = () => this._undo();
    panel.querySelector('#be-reset').onclick = () => {
      this._snapshot();
      this._resetSkinLayout();
      this._rebuild();
    };
    panel.querySelector('#be-back').onclick = () => this.onExit?.();
    this._refreshUi();
  }

  _teardownUi() {
    const panel = document.getElementById('bone-editor-panel');
    if (panel) panel.classList.add('hidden');
  }

  _refreshUi(dragging = false) {
    if (!this.ui) return;
    const node = this.puppet.nodes[this.selected];
    const spr = node?.sprite;
    const r1 = (v) => Math.round(v * 10) / 10;
    this.ui.sel.textContent = `${this.skinLabel} · ${LABEL[this.selected] || this.selected}${this.walking ? ' · ХОДЬБА' : ''}${this.mode === 'pivot' ? ' · стрелки двигают опору' : ''}`;
    this.ui.nums.textContent = node
      ? `x ${r1(node.x)}  y ${r1(node.y)}  ∠ ${r1(node.angle)}°${spr ? `  опора ${spr.originX.toFixed(3)} / ${spr.originY.toFixed(3)}` : ''}`
      : '';
    for (const b of this.ui.parts.children) b.classList.toggle('on', b.dataset.part === this.selected);
    this.ui.walk.classList.toggle('on', this.walking);
    if (!dragging && document.activeElement !== this.ui.json) {
      this.ui.json.value = JSON.stringify(this._layout(), null, 2);
    }
  }

  _drawOverlay() {
    const g = this.overlay;
    g.clear();
    if (this.walking) return;
    const z = this.viewZoom;
    const node = this.puppet.nodes[this.selected];
    // Outline of the selected image (rotated quad)
    if (node?.sprite) {
      const s = node.sprite;
      const m = s.getWorldTransformMatrix();
      const x0 = -s.originX * s.width;
      const y0 = -s.originY * s.height;
      const pts = [
        [x0, y0],
        [x0 + s.width, y0],
        [x0 + s.width, y0 + s.height],
        [x0, y0 + s.height],
      ].map(([x, y]) => new Phaser.Math.Vector2(m.a * x + m.c * y + m.tx, m.b * x + m.d * y + m.ty));
      g.lineStyle(1.5 / z, 0x44ff88, 0.9);
      g.strokePoints(pts, true);
    }
    // Bones: pivot → child pivots
    g.lineStyle(1.5 / z, 0xffffff, 0.35);
    for (const name of EDITABLE) {
      const n = this.puppet.nodes[name];
      if (!n || name === 'hips') continue;
      const parent = Object.entries(this.puppet.nodes).find(([, v]) => v === n.parentContainer)?.[0];
      if (!parent) continue;
      const a = this._pivotWorld(parent);
      const b = this._pivotWorld(name);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    // Pivot dots
    for (const name of EDITABLE) {
      if (!this.puppet.nodes[name]) continue;
      const p = this._pivotWorld(name);
      const on = name === this.selected;
      g.fillStyle(name === 'hips' ? 0xffaa22 : on ? 0xffee00 : 0xff3333, 1);
      g.lineStyle(1.5 / z, 0xffffff, 0.9);
      g.fillCircle(p.x, p.y, (on ? 6 : 4.5) / z);
      g.strokeCircle(p.x, p.y, (on ? 6 : 4.5) / z);
    }
    // Rotate handle of the selected part
    if (node && this.selected !== 'hips') {
      const p = this._pivotWorld(this.selected);
      const h = this._handleWorld(this.selected);
      g.lineStyle(1.5 / z, 0x55aaff, 0.8);
      g.lineBetween(p.x, p.y, h.x, h.y);
      g.fillStyle(0x55aaff, 1);
      g.fillCircle(h.x, h.y, 6 / z);
      g.strokeCircle(h.x, h.y, 6 / z);
    }
  }

  /** Dev server writes the rig into the project (layout json of this skin). */
  async _saveToProject() {
    if (this.walking) this._toggleWalk();
    this.puppet.writeLayoutFromNodes();
    const layout = JSON.parse(JSON.stringify(this._layout()));
    if (this.enemySkin) this.enemySkin.defaultLayout = JSON.parse(JSON.stringify(layout));
    try {
      const r = await fetch('/__kosari/save-layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: this.skinId, layout }),
      });
      const j = await r.json();
      this.ui.sel.textContent = j.ok ? `Сохранено: ${j.file}` : `Ошибка: ${j.error}`;
    } catch (e) {
      this._copyJson();
      this.ui.sel.textContent = 'Нет dev-сервера — JSON скопирован';
    }
  }

  _copyJson() {
    this.puppet.writeLayoutFromNodes();
    const text = JSON.stringify(this._layout(), null, 2);
    this.ui.json.value = text;
    navigator.clipboard?.writeText(text).then(
      () => {
        this.ui.sel.textContent = 'JSON скопирован';
      },
      () => {},
    );
  }

  update(_t, dtMs) {
    if (this.walking) {
      // Walk for 2 s, stand for 1 s, repeat
      this.walkT = (this.walkT + dtMs / 1000) % 3;
      this.puppet.tick(dtMs / 1000, { moving: this.walkT < 2, dtBlend: true });
    }
    this._drawOverlay();
  }
}
