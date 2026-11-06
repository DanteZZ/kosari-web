import Phaser from 'phaser';
import { BonePuppet } from './player/BonePuppet.js';
import { applyDefaultLayout } from './player/layoutState.js';
import { listClips, exportAnimJson, resetAnimState } from './player/animState.js';
import { sampleKeyframes, easeInOutCubic } from './player/anims.js';
import { VIEW_W, VIEW_H } from './constants.js';

const EDITABLE = [
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
  'hips',
];

/**
 * Edit attack keyframe offsets. Wheel = zoom.
 * Pose values are offsets from rest (same as anims.js).
 */
export class AnimEditorScene extends Phaser.Scene {
  constructor() {
    super('AnimEditor');
  }

  init(data) {
    this.onExit = data?.onExit;
  }

  create() {
    this.cameras.main.setBackgroundColor('#14141c');
    this.add.rectangle(VIEW_W / 2, VIEW_H - 8, VIEW_W, 16, 0x3a2818).setDepth(0);

    this.groundY = VIEW_H - 40;
    this.root = this.add.container(VIEW_W / 2, this.groundY).setDepth(10);
    applyDefaultLayout();
    this.puppet = new BonePuppet(this, this.root, { fit: true, animate: false });

    this.viewZoom = 2.4;
    this._applyViewZoom();

    this.clips = listClips();
    this.clipIndex = 0;
    this.frameIndex = 0;
    this.selected = 'arm_r_u';
    this.playing = false;
    this.playT = 0;
    this.pivotDots = {};
    this.hilite = this.add.graphics().setDepth(50);

    this._makePartsInteractive();
    this._buildPivotDots();
    this._applyFramePose();
    this._bindKeys();
    this._bindWheel();
    this._bindUi();

    this.events.on('shutdown', () => this._teardownUi());
  }

  _clip() {
    return this.clips[this.clipIndex];
  }

  _frame() {
    const c = this._clip();
    return c?.frames?.[this.frameIndex];
  }

  _applyViewZoom() {
    const cam = this.cameras.main;
    cam.setZoom(this.viewZoom);
    cam.centerOn(VIEW_W / 2 - 50, this.groundY - 160);
  }

  _bindWheel() {
    this.input.on('wheel', (pointer, _g, _dx, dy) => {
      pointer.event?.preventDefault?.();
      const delta = dy > 0 ? -0.15 : 0.15;
      this.viewZoom = Phaser.Math.Clamp(this.viewZoom + delta, 0.8, 6);
      this._applyViewZoom();
      this._refreshUi();
    });
  }

  _makePartsInteractive() {
    for (const name of EDITABLE) {
      if (name === 'hips') continue;
      const node = this.puppet.nodes[name];
      if (!node?.sprite) continue;
      node.sprite.setInteractive({ useHandCursor: true });
      node.sprite.on('pointerdown', () => {
        this.selected = name;
        this._refreshUi();
      });
    }
  }

  _buildPivotDots() {
    for (const name of EDITABLE) {
      if (name === 'hips') continue;
      const node = this.puppet.nodes[name];
      if (!node) continue;
      const dot = this.add.circle(0, 0, 5, 0xff2222, 1);
      dot.setStrokeStyle(1, 0xffffff, 0.85);
      node.add(dot);
      this.pivotDots[name] = dot;
    }
  }

  /** Apply current keyframe pose (or scrub) onto puppet from rest. */
  _applyFramePose(poseOverride) {
    const rest = this.puppet.restAngles;
    const hipsRest = this.puppet.hipsRestY;
    let pose = poseOverride;
    if (!pose) {
      const fr = this._frame();
      pose = fr?.pose || {};
    }
    for (const name of EDITABLE) {
      if (name === 'hips') continue;
      const node = this.puppet.nodes[name];
      if (!node) continue;
      node.angle = (rest[name] || 0) + (pose[name] ?? 0);
    }
    if (this.puppet.nodes.hips) {
      this.puppet.nodes.hips.y = hipsRest + (pose.hipsY ?? 0);
    }
  }

  /** Write current bone deltas into the active keyframe pose. */
  _writePoseFromNodes() {
    const fr = this._frame();
    if (!fr) return;
    const rest = this.puppet.restAngles;
    const pose = { ...(fr.pose || {}) };
    for (const name of EDITABLE) {
      if (name === 'hips') continue;
      const node = this.puppet.nodes[name];
      if (!node) continue;
      const off = Math.round((node.angle - (rest[name] || 0)) * 10) / 10;
      if (Math.abs(off) < 0.05) delete pose[name];
      else pose[name] = off;
    }
    const hips = this.puppet.nodes.hips;
    if (hips) {
      const hy = Math.round((hips.y - this.puppet.hipsRestY) * 10) / 10;
      if (Math.abs(hy) < 0.05) delete pose.hipsY;
      else pose.hipsY = hy;
    }
    fr.pose = pose;
  }

  _bindKeys() {
    this.input.keyboard.on('keydown', (e) => {
      if (e.code === 'Escape') {
        this.onExit?.();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        this.playing = !this.playing;
        this.playT = 0;
        if (!this.playing) this._applyFramePose();
        this._refreshUi();
        return;
      }
      if (e.code === 'KeyQ') {
        this.clipIndex = (this.clipIndex - 1 + this.clips.length) % this.clips.length;
        this.frameIndex = 0;
        this.playing = false;
        this.clips = listClips();
        this._applyFramePose();
        this._refreshUi();
        return;
      }
      if (e.code === 'KeyE') {
        this.clipIndex = (this.clipIndex + 1) % this.clips.length;
        this.frameIndex = 0;
        this.playing = false;
        this.clips = listClips();
        this._applyFramePose();
        this._refreshUi();
        return;
      }
      if (e.code === 'Comma' || e.code === 'KeyZ') {
        this.playing = false;
        this.frameIndex = Math.max(0, this.frameIndex - 1);
        this._applyFramePose();
        this._refreshUi();
        return;
      }
      if (e.code === 'Period' || e.code === 'KeyX') {
        this.playing = false;
        const max = (this._clip()?.frames?.length || 1) - 1;
        this.frameIndex = Math.min(max, this.frameIndex + 1);
        this._applyFramePose();
        this._refreshUi();
        return;
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        const i = EDITABLE.indexOf(this.selected);
        this.selected = EDITABLE[(i + (e.shiftKey ? -1 : 1) + EDITABLE.length) % EDITABLE.length];
        this._refreshUi();
        return;
      }
      if (e.code === 'KeyC' && !e.ctrlKey && !e.metaKey) {
        this._copyJson();
        return;
      }
      if (e.code === 'KeyR' && e.ctrlKey) {
        e.preventDefault();
        resetAnimState();
        this.clips = listClips();
        this.frameIndex = 0;
        this._applyFramePose();
        this._refreshUi();
        return;
      }
      if (e.code === 'KeyN') {
        this._insertFrame();
        return;
      }
      if (e.code === 'KeyD' && e.shiftKey) {
        this._deleteFrame();
        return;
      }

      // Duration nudge
      if (e.code === 'Digit9' || e.code === 'Digit0') {
        const c = this._clip();
        if (!c) return;
        c.dur = Math.round((c.dur + (e.code === 'Digit0' ? 0.02 : -0.02)) * 100) / 100;
        c.dur = Phaser.Math.Clamp(c.dur, 0.1, 1.5);
        this._refreshUi();
        return;
      }

      const fine = e.shiftKey;
      const step = fine ? 0.5 : 2;
      const node =
        this.selected === 'hips' ? this.puppet.nodes.hips : this.puppet.nodes[this.selected];
      if (!node || this.playing) return;

      if (this.selected === 'hips') {
        if (e.code === 'ArrowUp' || e.code === 'KeyW') node.y -= step;
        if (e.code === 'ArrowDown' || e.code === 'KeyS') node.y += step;
      } else {
        if (e.code === 'BracketLeft' || e.code === 'ArrowLeft' || e.code === 'KeyA') {
          node.angle -= step;
        }
        if (e.code === 'BracketRight' || e.code === 'ArrowRight' || e.code === 'KeyD') {
          node.angle += step;
        }
      }
      this._writePoseFromNodes();
      this._refreshUi();
    });
  }

  _insertFrame() {
    const c = this._clip();
    if (!c) return;
    const cur = this._frame();
    const t = cur ? Math.min(0.99, (cur.t + 0.1)) : 0.5;
    const pose = cur ? { ...cur.pose } : {};
    c.frames.splice(this.frameIndex + 1, 0, { t, pose });
    // normalize t ascending 0..1
    this._normalizeTimes(c);
    this.frameIndex += 1;
    this._applyFramePose();
    this._refreshUi();
  }

  _deleteFrame() {
    const c = this._clip();
    if (!c || c.frames.length <= 2) return;
    c.frames.splice(this.frameIndex, 1);
    this._normalizeTimes(c);
    this.frameIndex = Math.min(this.frameIndex, c.frames.length - 1);
    this._applyFramePose();
    this._refreshUi();
  }

  _normalizeTimes(c) {
    const n = c.frames.length;
    c.frames.forEach((f, i) => {
      f.t = n <= 1 ? 0 : Math.round((i / (n - 1)) * 100) / 100;
    });
    c.frames[0].t = 0;
    c.frames[n - 1].t = 1;
  }

  _bindUi() {
    let panel = document.getElementById('anim-editor-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'anim-editor-panel';
      panel.innerHTML = `
        <div class="be-head">Редактор анимаций</div>
        <div class="be-row">
          <select id="ae-clip"></select>
        </div>
        <div class="be-row"><b id="ae-info">—</b></div>
        <div class="be-row">
          кадр
          <input id="ae-frame" type="range" min="0" max="4" value="0" />
          <span id="ae-frame-lab">0</span>
        </div>
        <div class="be-row">
          dur <input id="ae-dur" type="number" min="0.1" max="1.5" step="0.02" style="width:70px" />
          зум <span id="ae-zoom">2.4</span>
        </div>
        <div class="be-help">
          Q/E — клип · ,/. или Z/X — кадр<br/>
          Клик / Tab — кость · ←→ / [ ] — угол<br/>
          hips: ↑↓ — hipsY · Space — play<br/>
          N — кадр · Shift+D — удалить<br/>
          Скролл — зум · C — JSON · Esc — меню
        </div>
        <textarea id="ae-json" spellcheck="false"></textarea>
        <div class="be-actions">
          <button type="button" id="ae-copy">Копировать JSON</button>
          <button type="button" id="ae-play">Play</button>
          <button type="button" id="ae-back">В меню</button>
        </div>
      `;
      document.getElementById('app')?.appendChild(panel);
    }
    panel.classList.remove('hidden');
    this.ui = {
      panel,
      clip: panel.querySelector('#ae-clip'),
      info: panel.querySelector('#ae-info'),
      frame: panel.querySelector('#ae-frame'),
      frameLab: panel.querySelector('#ae-frame-lab'),
      dur: panel.querySelector('#ae-dur'),
      zoom: panel.querySelector('#ae-zoom'),
      json: panel.querySelector('#ae-json'),
      playBtn: panel.querySelector('#ae-play'),
    };

    this.ui.clip.innerHTML = '';
    this.clips = listClips();
    for (const c of this.clips) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      this.ui.clip.appendChild(opt);
    }
    this.ui.clip.onchange = () => {
      this.clipIndex = this.clips.findIndex((c) => c.id === this.ui.clip.value);
      this.frameIndex = 0;
      this.playing = false;
      this._applyFramePose();
      this._refreshUi();
    };
    this.ui.frame.oninput = () => {
      this.playing = false;
      this.frameIndex = Number(this.ui.frame.value) || 0;
      this._applyFramePose();
      this._refreshUi();
    };
    this.ui.dur.onchange = () => {
      const c = this._clip();
      if (!c) return;
      c.dur = Phaser.Math.Clamp(Number(this.ui.dur.value) || 0.3, 0.1, 1.5);
      this._refreshUi();
    };
    panel.querySelector('#ae-copy').onclick = () => this._copyJson();
    panel.querySelector('#ae-play').onclick = () => {
      this.playing = !this.playing;
      this.playT = 0;
      if (!this.playing) this._applyFramePose();
      this._refreshUi();
    };
    panel.querySelector('#ae-back').onclick = () => this.onExit?.();
    this._refreshUi();
  }

  _teardownUi() {
    document.getElementById('anim-editor-panel')?.classList.add('hidden');
  }

  _refreshUi() {
    if (!this.ui) return;
    this.clips = listClips();
    const c = this._clip();
    const fr = this._frame();
    if (!c) return;
    this.ui.clip.value = c.id;
    this.ui.frame.max = String(Math.max(0, c.frames.length - 1));
    this.ui.frame.value = String(this.frameIndex);
    this.ui.frameLab.textContent = `${this.frameIndex}/${c.frames.length - 1}  t=${fr?.t ?? 0}`;
    this.ui.dur.value = String(c.dur);
    this.ui.zoom.textContent = this.viewZoom.toFixed(2);
    this.ui.playBtn.textContent = this.playing ? 'Stop' : 'Play';

    const rest = this.puppet.restAngles[this.selected] || 0;
    const node = this.puppet.nodes[this.selected];
    const off = fr?.pose?.[this.selected === 'hips' ? 'hipsY' : this.selected] ?? 0;
    if (this.selected === 'hips') {
      this.ui.info.textContent = `hipsY offset:${off}  y:${node?.y?.toFixed?.(1)}`;
    } else {
      this.ui.info.textContent = `${this.selected}  rest:${rest}  off:${off}  ∠${node?.angle?.toFixed?.(1)}`;
    }
    this.ui.json.value = exportAnimJson();

    for (const [name, dot] of Object.entries(this.pivotDots)) {
      if (!dot?.active) continue;
      dot.setFillStyle(name === this.selected ? 0xffee00 : 0xff2222, 1);
      dot.setRadius(name === this.selected ? 6 : 4);
    }
  }

  _drawHilite() {
    this.hilite.clear();
    if (this.selected === 'hips') return;
    const node = this.puppet.nodes[this.selected];
    if (!node?.sprite) return;
    const b = node.sprite.getBounds();
    this.hilite.lineStyle(2, 0x66aaff, 0.9);
    this.hilite.strokeRect(b.x, b.y, b.width, b.height);
  }

  _copyJson() {
    const text = exportAnimJson();
    if (this.ui?.json) this.ui.json.value = text;
    navigator.clipboard?.writeText(text).then(
      () => {
        if (this.ui?.info) this.ui.info.textContent = 'JSON скопирован — вставь в чат';
      },
      () => {
        this.ui?.json?.select();
        document.execCommand('copy');
      },
    );
  }

  update(_t, dt) {
    if (this.playing) {
      const c = this._clip();
      if (c) {
        this.playT += (dt / 1000) / (c.dur || 0.3);
        if (this.playT >= 1) this.playT = 0;
        const pose = sampleKeyframes(c.frames, this.playT);
        this._applyFramePose(pose);
        // scrubber follows eased time so it matches what you see
        const te = easeInOutCubic(this.playT);
        const idx = c.frames.findIndex((f, i) => {
          const next = c.frames[i + 1];
          return te >= f.t && (!next || te < next.t);
        });
        if (idx >= 0 && idx !== this.frameIndex) {
          this.frameIndex = idx;
          if (this.ui?.frame) this.ui.frame.value = String(idx);
        }
      }
    }
    this._drawHilite();
  }
}
