import { compileExpr, evaluate, runCode, truthy } from './expr.js';

/**
 * Minimal GameMaker 8 runtime for the original Kosari v3.0, driven by the
 * exported project (public/classic/gm/game.json). Runs the original object
 * logic action by action, so the classic plays exactly as written in 2011.
 *
 * Covered: instances + built-in variables, event order of GM8 (alarms,
 * keyboard, mouse, step, motion, outside room, collisions, animation end,
 * draw), solid collisions, D&D actions used by the game, GML expressions and
 * tiny code blocks, rooms with tiled/scrolling backgrounds, sounds/music,
 * message / question / highscore dialogs, save/load, cursor sprite, effects.
 */

export const safeName = (n) => String(n).trim().replace(/[^A-Za-z0-9_+-]/g, '_');

const DEG = Math.PI / 180;
const VK = {
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Space: 32, Enter: 13, NumpadEnter: 13, Escape: 27, Backspace: 8, Tab: 9,
  ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17,
};
function vkOf(code) {
  if (VK[code] != null) return VK[code];
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return 48 + Number(code[5]);
  if (/^Numpad[0-9]$/.test(code)) return 48 + Number(code[6]);
  return null;
}

/** GM colours are BGR integers. */
function cssColor(c) {
  const n = Number(c) | 0;
  return `rgb(${n & 255},${(n >> 8) & 255},${(n >> 16) & 255})`;
}

const BUILTIN = new Set([
  'x', 'y', 'xprevious', 'yprevious', 'xstart', 'ystart', 'hspeed', 'vspeed', 'speed', 'direction',
  'gravity', 'gravity_direction', 'friction', 'sprite_index', 'image_index', 'image_speed', 'image_alpha',
  'image_xscale', 'image_yscale', 'image_angle', 'image_blend', 'depth', 'visible', 'solid', 'persistent', 'id',
  'object_index', 'mask_index', 'sprite_width', 'sprite_height', 'image_number', 'path_index', 'path_position',
  'path_speed',
]);

class Instance {
  constructor(rt, objName, x, y) {
    const obj = rt.game.objects[objName];
    this.rt = rt;
    this.id = rt.nextId++;
    this.object_index = objName;
    this.x = x;
    this.y = y;
    this.xstart = x;
    this.ystart = y;
    this.xprevious = x;
    this.yprevious = y;
    this.hspeed = 0;
    this.vspeed = 0;
    this.gravity = 0;
    this.gravity_direction = 270;
    this.friction = 0;
    this.sprite_index = obj?.sprite || '';
    this.mask_index = obj?.mask || '';
    this.image_index = 0;
    this.image_speed = 1;
    this.image_alpha = 1;
    this.image_xscale = 1;
    this.image_yscale = 1;
    this.image_angle = 0;
    this.depth = obj?.depth || 0;
    this.visible = obj ? obj.visible : true;
    this.solid = obj ? obj.solid : false;
    this.persistent = obj ? obj.persistent : false;
    this.alarm = new Array(12).fill(-1);
    this.vars = Object.create(null);
    this.dead = false;
    this.path = null;
    this.mouseOver = false;
  }

  get speed() {
    return Math.hypot(this.hspeed, this.vspeed);
  }

  set speed(v) {
    const d = this.direction * DEG;
    this.hspeed = Math.cos(d) * v;
    this.vspeed = -Math.sin(d) * v;
    this._dir = this.direction;
  }

  get direction() {
    if (this.hspeed === 0 && this.vspeed === 0) return this._dir ?? 0;
    const d = Math.atan2(-this.vspeed, this.hspeed) / DEG;
    return (d + 360) % 360;
  }

  set direction(v) {
    const s = this.speed;
    const d = v * DEG;
    this._dir = ((v % 360) + 360) % 360;
    this.hspeed = Math.cos(d) * s;
    this.vspeed = -Math.sin(d) * s;
  }

  get obj() {
    return this.rt.game.objects[this.object_index];
  }

  get sprite() {
    return this.rt.game.sprites[this.sprite_index] || null;
  }

  /** Collision box in room coordinates (mask sprite if set). */
  bbox(x = this.x, y = this.y) {
    const s = this.rt.game.sprites[this.mask_index] || this.sprite;
    if (!s) return null;
    const [l, t, r, b] = s.bbox;
    return { l: x - s.ox + l, t: y - s.oy + t, r: x - s.ox + r + 1, b: y - s.oy + b + 1 };
  }
}

const overlap = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export class GMRuntime {
  /**
   * @param {object} game exported project
   * @param {HTMLCanvasElement} canvas
   * @param {{ images: Map, base: string, onEnd?: () => void, ui: HTMLElement }} opts
   */
  constructor(game, canvas, opts) {
    this.game = game;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.images = opts.images;
    this.base = opts.base;
    this.onEnd = opts.onEnd;
    this.ui = opts.ui;
    this.globals = Object.create(null);
    this.score = 0;
    this.lives = -1;
    this.health = 100;
    this.nextId = 100001;
    this.instances = [];
    this.roomIndex = 0;
    this.pendingRoom = null;
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();
    this.mouse = { x: -1, y: -1, down: false, pressed: false };
    this.drawColor = '#000';
    this.drawFont = null;
    this.drawAlign = 'left';
    this.sounds = new Map(); // name -> [HTMLAudioElement]
    this.modal = null; // { kind, gen, ... } — pauses the game while open
    this.particles = [];
    this.cursorSprite = null;
    this.bgState = [];
    this.fade = 0;
    this.highscores = this._loadScores();
    this._bindInput();
  }

  // ------------------------------------------------------------------ boot / loop

  start() {
    this._enterRoom(0, true);
    const stepMs = () => 1000 / (this.room.speed || 30);
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      acc += Math.min(250, now - last);
      last = now;
      while (acc >= stepMs()) {
        acc -= stepMs();
        if (!this.modal) this.step();
      }
      this.draw();
      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._stopAllSounds();
    this._unbind?.();
  }

  get room() {
    return this.game.rooms[this.roomIndex];
  }

  _enterRoom(index, gameStart = false) {
    // Room End for the old room, then clear non-persistent instances
    if (!gameStart) {
      for (const i of this.instances) this._event(i, 'OTHER:5');
      this.instances = this.instances.filter((i) => i.persistent && !i.dead);
    }
    this.roomIndex = index;
    const room = this.room;
    this.bgState = room.bgs.map((b) => ({ ...b }));
    const created = [];
    for (const d of room.inst) {
      if (!this.game.objects[d.obj]) continue;
      const inst = new Instance(this, d.obj, d.x, d.y);
      this.instances.push(inst);
      created.push(inst);
      this._event(inst, 'CREATE:0');
      if (d.code) runCode(d.code, { rt: this, self: inst, other: inst });
    }
    if (room.code) runCode(room.code, { rt: this, self: null, other: null });
    if (gameStart) for (const i of created) this._event(i, 'OTHER:2');
    for (const i of this.instances) this._event(i, 'OTHER:4');
  }

  // ------------------------------------------------------------------ step (GM8 order)

  step() {
    // A room_goto issued after a dialog closed (the step already ended)
    this._roomChange();
    if (this.modal) return;
    const live = () => this.instances.filter((i) => !i.dead);

    // Alarms
    for (const i of live()) {
      for (let a = 0; a < 12; a += 1) {
        if (i.alarm[a] > 0) {
          i.alarm[a] -= 1;
          if (i.alarm[a] === 0) {
            i.alarm[a] = -1;
            this._event(i, `ALARM:${a}`);
          }
        }
      }
    }

    // Keyboard: held, pressed, released
    for (const i of live()) {
      const ev = i.obj?.ev;
      if (!ev) continue;
      for (const k of this.keysDown) if (ev[`KEYBOARD:${k}`]) this._event(i, `KEYBOARD:${k}`);
      for (const k of this.keysPressed) if (ev[`KEYPRESS:${k}`]) this._event(i, `KEYPRESS:${k}`);
      for (const k of this.keysReleased) if (ev[`KEYRELEASE:${k}`]) this._event(i, `KEYRELEASE:${k}`);
    }

    // Mouse: enter / leave / button / pressed (top-most first doesn't matter here)
    for (const i of live()) {
      const ev = i.obj?.ev;
      if (!ev) continue;
      const bb = i.bbox();
      const over = !!bb && this.mouse.x >= bb.l && this.mouse.x < bb.r && this.mouse.y >= bb.t && this.mouse.y < bb.b;
      if (over && !i.mouseOver) this._event(i, 'MOUSE:10');
      if (!over && i.mouseOver) this._event(i, 'MOUSE:11');
      i.mouseOver = over;
      if (over && (this.mouse.down || this.mouse.pressed)) this._event(i, 'MOUSE:0');
      if (over && this.mouse.pressed) this._event(i, 'MOUSE:4');
    }

    // Step
    for (const i of live()) this._event(i, 'STEP:0');

    // Motion: friction, gravity, path, position
    for (const i of live()) {
      i.xprevious = i.x;
      i.yprevious = i.y;
      if (i.friction) {
        const s = i.speed;
        if (s > 0) {
          const ns = Math.max(0, s - i.friction);
          i.hspeed *= ns / s;
          i.vspeed *= ns / s;
        }
      }
      if (i.gravity) {
        i.hspeed += Math.cos(i.gravity_direction * DEG) * i.gravity;
        i.vspeed -= Math.sin(i.gravity_direction * DEG) * i.gravity;
      }
      if (i.path) this._followPath(i);
      i.x += i.hspeed;
      i.y += i.vspeed;
    }

    // Outside room
    for (const i of live()) {
      if (!i.obj?.ev['OTHER:0']) continue;
      const bb = i.bbox() || { l: i.x, t: i.y, r: i.x, b: i.y };
      if (bb.r < 0 || bb.l > this.room.w || bb.b < 0 || bb.t > this.room.h) this._event(i, 'OTHER:0');
    }

    // Collisions
    for (const i of live()) {
      const ev = i.obj?.ev;
      if (!ev) continue;
      for (const key of Object.keys(ev)) {
        if (!key.startsWith('COLLISION:') || i.dead) continue;
        const target = key.slice(10);
        for (const o of live()) {
          if (o === i || o.object_index !== target || o.dead || i.dead) continue;
          if (!overlap(i.bbox(), o.bbox())) continue;
          if (o.solid || i.solid) {
            i.x = i.xprevious;
            i.y = i.yprevious;
          }
          this._event(i, key, o);
          if ((o.solid || i.solid) && !i.dead) {
            // Move on with (possibly changed) speed; stay put if still blocked
            const nx = i.x + i.hspeed;
            const ny = i.y + i.vspeed;
            if (!overlap(i.bbox(nx, ny), o.bbox())) {
              i.x = nx;
              i.y = ny;
            }
          }
        }
      }
    }

    // Animation
    for (const i of live()) {
      const s = i.sprite;
      if (!s || s.n === 0) continue;
      i.image_index += i.image_speed;
      if (i.image_index >= s.n) {
        i.image_index -= s.n;
        this._event(i, 'OTHER:7');
      } else if (i.image_index < 0) {
        i.image_index += s.n;
      }
    }

    // Effects
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.room.h + 20);

    // Backgrounds scroll
    for (const b of this.bgState) {
      b.x += b.hs;
      b.y += b.vs;
    }

    this.instances = this.instances.filter((i) => !i.dead);
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouse.pressed = false;

    this._roomChange();
  }

  /** Room changes requested by actions happen at the end of the step. */
  _roomChange() {
    if (this.pendingRoom == null) return;
    const r = this.pendingRoom;
    this.pendingRoom = null;
    this.fade = 1;
    this._enterRoom(r);
  }

  _followPath(i) {
    const p = i.path;
    const pts = p.pts;
    if (!pts.length) return;
    p.pos += p.speed / Math.max(1, p.len);
    if (p.pos >= 1) {
      if (p.end === 0) {
        p.pos = 1;
        i.path = null;
      } else if (p.end === 3) {
        p.speed = -p.speed;
        p.pos = 1;
      } else p.pos -= 1;
    }
    if (p.pos < 0) {
      p.speed = -p.speed;
      p.pos = 0;
    }
    // Position along the polyline
    let d = p.pos * p.len;
    for (let k = 0; k < pts.length - 1; k += 1) {
      const a = pts[k];
      const b = pts[k + 1];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= seg || k === pts.length - 2) {
        const u = seg ? Math.min(1, d / seg) : 0;
        i.x = p.ox + a[0] + (b[0] - a[0]) * u - i.hspeed;
        i.y = p.oy + a[1] + (b[1] - a[1]) * u - i.vspeed;
        return;
      }
      d -= seg;
    }
  }

  // ------------------------------------------------------------------ events & actions

  /** Run an event of an instance (synchronously, or until a dialog opens). */
  _event(inst, key, other = null) {
    if (inst.dead && key !== 'DESTROY:0') return;
    // GM8 dialogs are blocking: nothing else runs while one is open
    if (this.modal) return;
    const list = inst.obj?.ev[key];
    if (!list) return;
    const gen = this._runActions(list, inst, other || inst);
    this._drive(gen);
  }

  _drive(gen, input) {
    const r = gen.next(input);
    if (!r.done) {
      // A dialog paused this event: resume when it closes
      this.modal = { ...r.value, gen };
      this._openModal(this.modal);
    }
  }

  _resumeModal(result) {
    const m = this.modal;
    this.modal = null;
    this._closeModalUi();
    this.keysDown.clear();
    this._drive(m.gen, result);
  }

  /** Parse the flat action list into a tree once (cached on the list). */
  _tree(list) {
    if (list._tree) return list._tree;
    let i = 0;
    const stmt = () => {
      const a = list[i++];
      if (!a) return null;
      if (a.kind === 'BEGIN') {
        const body = [];
        while (i < list.length && list[i].kind !== 'END') {
          const s = stmt();
          if (s) body.push(s);
        }
        i += 1; // END
        return { block: body };
      }
      if (a.kind === 'END') return null;
      if (a.q) {
        const node = { q: a, then: stmt(), else: null };
        if (list[i]?.kind === 'ELSE') {
          i += 1;
          node.else = stmt();
        }
        return node;
      }
      if (a.kind === 'ELSE') return null;
      return { a };
    };
    const out = [];
    while (i < list.length) {
      const s = stmt();
      if (s) out.push(s);
    }
    list._tree = out;
    return out;
  }

  *_runActions(list, self, other) {
    const rt = this;
    const EXIT = Symbol.for('gm-exit');
    function* each(a) {
      return yield* rt._targets(a, self, other, (t) => rt._action(a, t, other));
    }
    function* run(node) {
      if (!node) return undefined;
      if (node.block) {
        for (const n of node.block) {
          const r = yield* run(n);
          if (r === EXIT) return EXIT;
        }
        return undefined;
      }
      if (node.q) {
        const res = yield* each(node.q);
        const ok = node.q.not ? !res : !!res;
        return ok ? yield* run(node.then) : yield* run(node.else);
      }
      if (node.a.kind === 'EXIT') return EXIT;
      yield* each(node.a);
      return undefined;
    }
    for (const n of this._tree(list)) {
      const r = yield* run(n);
      if (r === EXIT) return;
    }
  }

  /** "Applies to": self, other, or every instance of an object. Questions: true if true for all. */
  *_targets(a, self, other, fn) {
    if (a.to === '.self' || !a.to) return yield* fn(self);
    if (a.to === '.other') return yield* fn(other);
    let all = true;
    let any = false;
    for (const t of this.instances.filter((i) => i.object_index === a.to && !i.dead)) {
      any = true;
      const r = yield* fn(t);
      if (!r) all = false;
    }
    return any && all;
  }

  _arg(a, i, self, other) {
    const g = a.a[i];
    if (!g) return undefined;
    const ctx = { rt: this, self, other };
    switch (g.k) {
      case 'EXPRESSION':
        return evaluate(compileExpr(g.v || '0'), ctx);
      case 'BOTH': {
        const v = g.v || '';
        return v.startsWith("'") || v.startsWith('"') ? evaluate(compileExpr(v), ctx) : v;
      }
      case 'BOOLEAN':
      case 'MENU':
      case 'COLOR':
        return Number(g.v) || 0;
      default:
        return g.v;
    }
  }

  // eslint-disable-next-line complexity
  *_action(a, self, other) {
    if (!self) return 0;
    const arg = (k) => this._arg(a, k, self, other);
    const rel = a.rel;
    switch (a.id) {
      // ---- move
      case 101: {
        const dirs = String(a.a[0].v);
        const opts = [];
        const ANG = [225, 270, 315, 180, null, 0, 135, 90, 45]; // numpad layout 1..9
        for (let k = 0; k < 9; k += 1) if (dirs[k] === '1') opts.push(ANG[k]);
        if (!opts.length) return 0;
        const d = opts[Math.floor(Math.random() * opts.length)];
        const sp = arg(1);
        if (d === null) {
          self.hspeed = 0;
          self.vspeed = 0;
        } else {
          self._dir = d;
          self.hspeed = 0;
          self.vspeed = 0;
          self.direction = d;
          self.speed = rel ? self.speed + sp : sp;
        }
        return 0;
      }
      case 102: {
        const d = arg(0);
        const s = arg(1);
        if (rel) {
          self.hspeed += Math.cos(d * DEG) * s;
          self.vspeed -= Math.sin(d * DEG) * s;
        } else {
          self.hspeed = Math.cos(d * DEG) * s;
          self.vspeed = -Math.sin(d * DEG) * s;
          self._dir = d;
        }
        return 0;
      }
      case 104:
        self.vspeed = rel ? self.vspeed + arg(0) : arg(0);
        return 0;
      case 107:
        self.gravity_direction = rel ? self.gravity_direction + arg(0) : arg(0);
        self.gravity = rel ? self.gravity + arg(1) : arg(1);
        return 0;
      case 109:
        self.x = rel ? self.x + arg(0) : arg(0);
        self.y = rel ? self.y + arg(1) : arg(1);
        return 0;
      case 116: {
        const d = arg(0) * DEG;
        let max = arg(1);
        if (max <= 0) max = 1000;
        const solidOnly = arg(2) === 0;
        if (this._collides(self, self.x, self.y, solidOnly)) return 0;
        for (let k = 0; k < max; k += 1) {
          const nx = self.x + Math.cos(d);
          const ny = self.y - Math.sin(d);
          if (this._collides(self, nx, ny, solidOnly)) break;
          self.x = nx;
          self.y = ny;
        }
        return 0;
      }
      case 119: {
        const p = this.game.paths[a.a[0].v];
        if (!p) return 0;
        const pts = p.pts;
        let len = 0;
        for (let k = 0; k < pts.length - 1; k += 1) len += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
        const relative = arg(3) === 0;
        self.path = {
          pts,
          len,
          speed: arg(1),
          end: arg(2),
          pos: 0,
          ox: relative ? self.x - pts[0][0] : 0,
          oy: relative ? self.y - pts[0][1] : 0,
        };
        return 0;
      }
      // ---- instances
      case 201: {
        const x = rel ? self.x + arg(1) : arg(1);
        const y = rel ? self.y + arg(2) : arg(2);
        this.createInstance(a.a[0].v, x, y);
        return 0;
      }
      case 202: {
        const to = a.a[0].v;
        const perform = arg(1) === 1;
        if (perform) this._event(self, 'DESTROY:0');
        self.object_index = to;
        const obj = this.game.objects[to];
        if (obj) {
          self.sprite_index = obj.sprite || '';
          self.mask_index = obj.mask || '';
          self.depth = obj.depth;
          self.solid = obj.solid;
          self.visible = obj.visible;
          self.image_index = 0;
        }
        if (perform) this._event(self, 'CREATE:0');
        return 0;
      }
      case 203:
        if (!self.dead) {
          self.dead = true;
          this._event(self, 'DESTROY:0');
        }
        return 0;
      case 206: {
        const x = rel ? self.x + arg(1) : arg(1);
        const y = rel ? self.y + arg(2) : arg(2);
        const inst = this.createInstance(a.a[0].v, x, y);
        if (inst) {
          inst._dir = arg(4);
          inst.hspeed = Math.cos(arg(4) * DEG) * arg(3);
          inst.vspeed = -Math.sin(arg(4) * DEG) * arg(3);
        }
        return 0;
      }
      case 207: {
        const opts = [0, 1, 2, 3].map((k) => a.a[k].v).filter((v) => v && this.game.objects[v]);
        if (!opts.length) return 0;
        const x = rel ? self.x + arg(4) : arg(4);
        const y = rel ? self.y + arg(5) : arg(5);
        this.createInstance(opts[Math.floor(Math.random() * opts.length)], x, y);
        return 0;
      }
      // ---- sound
      case 211:
        this.playSound(a.a[0].v, arg(1) === 1);
        return 0;
      case 212:
        this.stopSound(a.a[0].v);
        return 0;
      case 213:
        return this.isSoundPlaying(a.a[0].v) ? 1 : 0;
      // ---- rooms
      case 222:
        this.pendingRoom = Math.min(this.game.rooms.length - 1, this.roomIndex + 1);
        return 0;
      case 224: {
        const idx = this.game.rooms.findIndex((r) => r.name === a.a[0].v);
        if (idx >= 0) this.pendingRoom = idx;
        return 0;
      }
      // ---- timing / info
      case 301: {
        const k = arg(1);
        self.alarm[k] = rel && self.alarm[k] > 0 ? self.alarm[k] + arg(0) : arg(0);
        if (self.alarm[k] === 0) self.alarm[k] = -1;
        return 0;
      }
      case 321:
        yield { kind: 'message', text: String(arg(0)) };
        return 0;
      case 326:
        window.open(String(arg(0)), '_blank', 'noopener');
        return 0;
      case 332:
        this.stop();
        this.onEnd?.();
        return 0;
      case 333:
        this.saveGame(String(arg(0)));
        return 0;
      case 334:
        this.loadGame(String(arg(0)));
        return 0;
      // ---- questions
      case 401: {
        const x = rel ? self.x + arg(0) : arg(0);
        const y = rel ? self.y + arg(1) : arg(1);
        return this._collides(self, x, y, arg(2) === 0) ? 0 : 1;
      }
      case 403: {
        const x = rel ? self.x + arg(1) : arg(1);
        const y = rel ? self.y + arg(2) : arg(2);
        const bb = self.bbox(x, y);
        return this.instances.some((o) => o !== self && !o.dead && o.object_index === a.a[0].v && overlap(bb, o.bbox())) ? 1 : 0;
      }
      case 404: {
        const n = this.instances.filter((o) => !o.dead && o.object_index === a.a[0].v).length;
        return this._cmp(n, arg(1), arg(2));
      }
      case 405: {
        const sides = arg(0);
        return sides <= 1 || Math.random() * sides < 1 ? 1 : 0;
      }
      case 407: {
        const res = yield { kind: 'question', text: String(arg(0)) };
        return res ? 1 : 0;
      }
      // ---- variables
      case 603:
        runCode(a.a[0].v, { rt: this, self, other });
        return 0;
      case 605:
        return 0;
      case 611: {
        const name = String(a.a[0].v).trim();
        const v = arg(1);
        const ctx = { rt: this, self, other };
        this.setPath(name, rel ? this.getPath(name, ctx) + v : v, ctx);
        return 0;
      }
      case 612: {
        const v = evaluate(compileExpr(a.a[0].v), { rt: this, self, other });
        return this._cmp(v, arg(1), arg(2));
      }
      // ---- score / lives / health
      case 701:
        this.score = rel ? this.score + arg(0) : arg(0);
        return 0;
      case 702:
        return this._cmp(this.score, arg(0), arg(1));
      case 711:
        this.lives = rel ? this.lives + arg(0) : arg(0);
        return 0;
      case 712:
        return this._cmp(this.lives, arg(0), arg(1));
      case 721:
        this.health = rel ? this.health + arg(0) : arg(0);
        return 0;
      case 722:
        return this._cmp(this.health, arg(0), arg(1));
      case 709: {
        const [face, size] = String(a.a[4].v || 'Arial,10').replace(/"/g, '').split(',');
        yield { kind: 'highscore', bg: a.a[0].v, border: arg(1), newColor: arg(2), otherColor: arg(3), face, size: Number(size) || 10 };
        return 0;
      }
      // ---- drawing (Draw events)
      case 514:
        this._drawOps?.push({ op: 'text', text: String(arg(0)), x: rel ? self.x + arg(1) : arg(1), y: rel ? self.y + arg(2) : arg(2), color: this.drawColor, font: this.drawFont, align: this.drawAlign });
        return 0;
      case 524:
        this.drawColor = cssColor(arg(0));
        return 0;
      case 526: {
        this.drawFont = a.a[0].v;
        this.drawAlign = ['left', 'center', 'right'][arg(1)] || 'left';
        return 0;
      }
      case 532:
        this._effect(arg(0), rel ? self.x + arg(1) : arg(1), rel ? self.y + arg(2) : arg(2), arg(4), arg(5));
        return 0;
      case 541: {
        const sub = arg(1);
        self.sprite_index = a.a[0].v;
        if (sub !== -1) self.image_index = sub;
        self.image_speed = arg(2);
        return 0;
      }
      case 703:
        this._drawOps?.push({ op: 'text', text: `${a.a[2].v || ''}${this.score}`, x: rel ? self.x + arg(0) : arg(0), y: rel ? self.y + arg(1) : arg(1), color: this.drawColor, font: this.drawFont, align: this.drawAlign });
        return 0;
      case 714:
        this._drawOps?.push({ op: 'lives', x: rel ? self.x + arg(0) : arg(0), y: rel ? self.y + arg(1) : arg(1), sprite: a.a[2].v });
        return 0;
      case 723: {
        const x1 = rel ? self.x + arg(0) : arg(0);
        const y1 = rel ? self.y + arg(1) : arg(1);
        const x2 = rel ? self.x + arg(2) : arg(2);
        const y2 = rel ? self.y + arg(3) : arg(3);
        this._drawOps?.push({ op: 'health', x1, y1, x2, y2, back: arg(4), bar: arg(5) });
        return 0;
      }
      case 801:
        this.cursorSprite = a.a[0].v || null;
        this.canvas.style.cursor = arg(1) === 1 ? 'default' : 'none';
        return 0;
      default:
        return 0;
    }
  }

  _cmp(a, b, op) {
    if (op === 1) return a < b ? 1 : 0;
    if (op === 2) return a > b ? 1 : 0;
    // eslint-disable-next-line eqeqeq
    return a == b ? 1 : 0;
  }

  _collides(self, x, y, solidOnly) {
    const bb = self.bbox(x, y);
    if (!bb) return false;
    return this.instances.some((o) => o !== self && !o.dead && (!solidOnly || o.solid) && overlap(bb, o.bbox()));
  }

  createInstance(objName, x, y) {
    if (!this.game.objects[objName]) return null;
    const inst = new Instance(this, objName, x, y);
    this.instances.push(inst);
    this._event(inst, 'CREATE:0');
    return inst;
  }

  // ------------------------------------------------------------------ variables (expr.js hooks)

  _first(objName) {
    return this.instances.find((i) => i.object_index === objName && !i.dead) || null;
  }

  getName(name, ctx) {
    const self = ctx.self;
    switch (name) {
      case 'score': return this.score;
      case 'lives': return this.lives;
      case 'health': return this.health;
      case 'room_width': return this.room.w;
      case 'room_height': return this.room.h;
      case 'room_speed': return this.room.speed;
      case 'room': return this.roomIndex;
      case 'mouse_x': return this.mouse.x;
      case 'mouse_y': return this.mouse.y;
      case 'true': return 1;
      case 'false': return 0;
      case 'pi': return Math.PI;
      case 'self': return self?.id ?? -1;
      case 'other': return ctx.other?.id ?? -2;
      case 'noone': return -4;
      default:
    }
    if (self) {
      if (BUILTIN.has(name)) return this._getBuiltin(self, name);
      if (name in self.vars) return self.vars[name];
    }
    const g = this.game;
    if (g.sprites[name] || g.objects[name] || g.sounds[name] || g.backgrounds[name] || g.paths[name] || g.fonts[name]) return name;
    return 0;
  }

  _getBuiltin(i, name) {
    if (name === 'sprite_width') return i.sprite?.w || 0;
    if (name === 'sprite_height') return i.sprite?.h || 0;
    if (name === 'image_number') return i.sprite?.n || 0;
    return i[name];
  }

  _scope(node, ctx) {
    if (node.k === 'id') {
      if (node.v === 'global') return { global: true };
      if (node.v === 'self') return { inst: ctx.self };
      if (node.v === 'other') return { inst: ctx.other };
      return { inst: this._first(node.v) };
    }
    return { inst: null };
  }

  getMember(objNode, field, ctx) {
    const sc = this._scope(objNode, ctx);
    if (sc.global) return this.globals[field] ?? 0;
    const i = sc.inst;
    if (!i) return 0;
    if (BUILTIN.has(field)) return this._getBuiltin(i, field);
    return i.vars[field] ?? 0;
  }

  getIndexed(node, idx, ctx) {
    if (node.k === 'id' && node.v === 'alarm') return ctx.self?.alarm[idx] ?? -1;
    return 0;
  }

  /** Read "a" / "global.a" / "obj.a". */
  getPath(path, ctx) {
    return evaluate(compileExpr(path), ctx);
  }

  setPath(path, value, ctx) {
    const parts = path.split('.');
    if (parts.length === 2) {
      const [o, f] = parts;
      if (o === 'global') {
        this.globals[f] = value;
        return;
      }
      const target = o === 'self' ? ctx.self : o === 'other' ? ctx.other : this._first(o);
      if (target) this._set(target, f, value);
      return;
    }
    const name = parts[0];
    if (name === 'score') this.score = value;
    else if (name === 'lives') this.lives = value;
    else if (name === 'health') this.health = value;
    else if (ctx.self) this._set(ctx.self, name, value);
  }

  _set(i, f, v) {
    if (BUILTIN.has(f)) {
      if (f === 'speed' || f === 'direction' || f === 'hspeed' || f === 'vspeed' || f === 'x' || f === 'y' || f === 'image_index' || f === 'image_speed' || f === 'image_alpha' || f === 'depth' || f === 'gravity' || f === 'friction' || f === 'gravity_direction' || f === 'visible' || f === 'solid' || f === 'sprite_index' || f === 'image_xscale' || f === 'image_yscale' || f === 'image_angle') {
        i[f] = v;
      }
      return;
    }
    i.vars[f] = v;
  }

  callFn(name, args) {
    switch (name) {
      case 'random': return Math.random() * (args[0] || 0);
      case 'irandom': return Math.floor(Math.random() * ((args[0] || 0) + 1));
      case 'random_range': return args[0] + Math.random() * (args[1] - args[0]);
      case 'choose': return args[Math.floor(Math.random() * args.length)];
      case 'string':
        return typeof args[0] === 'number' ? String(Math.round(args[0] * 100) / 100) : String(args[0] ?? '');
      case 'real': return Number(args[0]) || 0;
      case 'floor': return Math.floor(args[0]);
      case 'ceil': return Math.ceil(args[0]);
      case 'round': return Math.round(args[0]);
      case 'abs': return Math.abs(args[0]);
      case 'sign': return Math.sign(args[0]);
      case 'min': return Math.min(...args);
      case 'max': return Math.max(...args);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'sin': return Math.sin(args[0]);
      case 'cos': return Math.cos(args[0]);
      case 'point_distance': return Math.hypot(args[2] - args[0], args[3] - args[1]);
      case 'instance_number': return this.instances.filter((i) => !i.dead && i.object_index === args[0]).length;
      case 'instance_exists': return this._first(args[0]) ? 1 : 0;
      default: return 0;
    }
  }

  // ------------------------------------------------------------------ sound

  playSound(name, loop) {
    const s = this.game.sounds[name];
    if (!s) return;
    if (s.music) this.stopSound(name); // multimedia: one at a time
    const a = new Audio(`${this.base}snd/${s.file}`);
    a.volume = Math.max(0, Math.min(1, s.vol ?? 1));
    a.loop = !!loop;
    const list = this.sounds.get(name) || [];
    list.push(a);
    this.sounds.set(name, list);
    a.addEventListener('ended', () => {
      const l = this.sounds.get(name);
      if (l) this.sounds.set(name, l.filter((x) => x !== a));
    });
    a.play().catch(() => {});
  }

  stopSound(name) {
    for (const a of this.sounds.get(name) || []) {
      a.pause();
      a.src = '';
    }
    this.sounds.set(name, []);
  }

  isSoundPlaying(name) {
    return (this.sounds.get(name) || []).some((a) => !a.paused && !a.ended);
  }

  _stopAllSounds() {
    for (const name of this.sounds.keys()) this.stopSound(name);
  }

  // ------------------------------------------------------------------ effects

  _effect(kind, x, y, color, size) {
    const col = cssColor(color);
    const big = [0.6, 1, 1.6][size] || 1;
    if (kind === 10 || kind === 11) {
      // Rain / snow over the whole room
      const n = Math.round(6 * big);
      for (let k = 0; k < n; k += 1) {
        this.particles.push({
          x: Math.random() * this.room.w,
          y: -10,
          vx: kind === 10 ? -1.5 : Math.random() - 0.5,
          vy: kind === 10 ? 14 + Math.random() * 6 : 2,
          life: 60,
          len: kind === 10 ? 12 : 0,
          r: kind === 11 ? 2 : 1,
          col: kind === 10 ? 'rgba(160,180,255,0.7)' : '#fff',
        });
      }
      return;
    }
    for (let k = 0; k < 14 * big; k += 1) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (1 + Math.random() * 3) * big;
      this.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 20 + Math.random() * 15, r: 2 * big, col });
    }
  }

  // ------------------------------------------------------------------ draw

  draw() {
    const ctx = this.ctx;
    const room = this.room;
    if (this.canvas.width !== room.w || this.canvas.height !== room.h) {
      this.canvas.width = room.w;
      this.canvas.height = room.h;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = room.drawColor ? `#${room.color}` : '#000';
    ctx.fillRect(0, 0, room.w, room.h);
    for (const b of this.bgState) if (b.visible && !b.fg) this._drawBg(b);

    const sorted = this.instances.filter((i) => !i.dead && i.visible).sort((a, b) => b.depth - a.depth);
    for (const i of sorted) {
      if (i.obj?.ev['DRAW:0']) {
        this._drawOps = [];
        // Draw events never open dialogs; run to completion
        const gen = this._runActions(i.obj.ev['DRAW:0'], i, i);
        while (!gen.next().done);
        const ops = this._drawOps;
        this._drawOps = null;
        for (const op of ops) this._drawOp(op);
      } else {
        this._drawSprite(i.sprite_index, i.image_index, i.x, i.y, i.image_alpha, i.image_xscale, i.image_yscale);
      }
    }
    for (const b of this.bgState) if (b.visible && b.fg) this._drawBg(b);

    // Particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 20));
      ctx.strokeStyle = p.col;
      ctx.fillStyle = p.col;
      if (p.len) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx, p.y - p.len);
        ctx.stroke();
      } else ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalAlpha = 1;

    if (this.cursorSprite && this.mouse.x >= 0) this._drawSprite(this.cursorSprite, 0, this.mouse.x, this.mouse.y, 1, 1, 1);

    // Room transition fade
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, room.w, room.h);
      this.fade = Math.max(0, this.fade - 0.08);
    }
    if (this.modal?.kind === 'highscore') this._drawHighscores(this.modal);
  }

  _img(key) {
    return this.images.get(key);
  }

  _drawSprite(name, index, x, y, alpha = 1, xs = 1, ys = 1) {
    const s = this.game.sprites[name];
    if (!s || !s.n) return;
    const f = ((Math.floor(index) % s.n) + s.n) % s.n;
    const img = this._img(`spr:${name}:${f}`);
    if (!img) return;
    const ctx = this.ctx;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (xs === 1 && ys === 1) ctx.drawImage(img, Math.round(x - s.ox), Math.round(y - s.oy));
    else {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(xs, ys);
      ctx.drawImage(img, -s.ox, -s.oy);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  _drawBg(b) {
    const img = this._img(`bg:${b.img}`);
    if (!img || !img.width) return;
    const ctx = this.ctx;
    const room = this.room;
    if (b.stretch) {
      ctx.drawImage(img, 0, 0, room.w, room.h);
      return;
    }
    const w = img.width;
    const h = img.height;
    const x0 = b.tx ? ((b.x % w) + w) % w - w : b.x;
    const y0 = b.ty ? ((b.y % h) + h) % h - h : b.y;
    for (let x = x0; x < room.w; x += w) {
      for (let y = y0; y < room.h; y += h) {
        ctx.drawImage(img, Math.round(x), Math.round(y));
        if (!b.ty) break;
      }
      if (!b.tx) break;
    }
  }

  _fontCss(fontName) {
    const f = this.game.fonts[fontName];
    if (!f) return '16px "Russo One", sans-serif';
    return `${f.italic ? 'italic ' : ''}${f.bold ? 'bold ' : ''}${f.size + 6}px "${f.name}", "Russo One", sans-serif`;
  }

  _drawOp(op) {
    const ctx = this.ctx;
    if (op.op === 'text') {
      ctx.font = this._fontCss(op.font);
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      ctx.textBaseline = 'top';
      String(op.text).split('#').forEach((line, k) => ctx.fillText(line, op.x, op.y + k * 22));
    } else if (op.op === 'lives') {
      const s = this.game.sprites[op.sprite];
      for (let k = 0; k < this.lives; k += 1) this._drawSprite(op.sprite, 0, op.x + k * (s?.w || 16), op.y);
    } else if (op.op === 'health') {
      const BACK = [null, '#000', '#808080', '#c0c0c0', '#fff', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#f00', '#0f0', '#ff0', '#00f', '#f0f', '#0ff'];
      const k = Math.max(0, Math.min(1, this.health / 100));
      if (BACK[op.back]) {
        ctx.fillStyle = BACK[op.back];
        ctx.fillRect(op.x1, op.y1, op.x2 - op.x1, op.y2 - op.y1);
      }
      let col;
      if (op.bar === 0) col = `rgb(${Math.round(255 * (1 - k))},${Math.round(255 * k)},0)`;
      else if (op.bar === 1) col = `rgb(${Math.round(255 * k)},${Math.round(255 * k)},${Math.round(255 * k)})`;
      else col = BACK[op.bar - 1] || '#f00';
      ctx.fillStyle = col;
      ctx.fillRect(op.x1, op.y1, (op.x2 - op.x1) * k, op.y2 - op.y1);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(op.x1 + 0.5, op.y1 + 0.5, op.x2 - op.x1, op.y2 - op.y1);
    }
  }

  // ------------------------------------------------------------------ dialogs

  _openModal(m) {
    const box = document.createElement('div');
    box.className = 'gm-dialog';
    if (m.kind === 'message' || m.kind === 'question') {
      box.innerHTML = `<div class="gm-win"><div class="gm-title">Косари v3.0</div><div class="gm-text"></div><div class="gm-buttons"></div></div>`;
      box.querySelector('.gm-text').textContent = m.text;
      const btns = box.querySelector('.gm-buttons');
      const add = (label, val) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () => this._resumeModal(val);
        btns.appendChild(b);
        return b;
      };
      if (m.kind === 'message') add('OK', true).focus();
      else {
        add('Да', true).focus();
        add('Нет', false);
      }
      m.onKey = (e) => {
        if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyY') this._resumeModal(true);
        else if (e.code === 'Escape' || e.code === 'KeyN') this._resumeModal(m.kind === 'message');
      };
    } else if (m.kind === 'highscore') {
      // New entry? Ask for a name first, then show the table until a key/click
      const pos = this._scorePlace(this.score);
      m.newIndex = -1;
      const showTable = () => {
        box.innerHTML = '';
        m.onKey = () => this._resumeModal(true);
        box.onclick = () => this._resumeModal(true);
      };
      if (pos >= 0) {
        box.innerHTML = `<div class="gm-win"><div class="gm-title">Рекорд!</div><div class="gm-text">Вы в таблице рекордов. Введите имя:</div><input class="gm-input" maxlength="20" value="Косарь"/><div class="gm-buttons"><button>OK</button></div></div>`;
        const input = box.querySelector('input');
        const ok = () => {
          m.newIndex = this._insertScore(input.value || 'Косарь', this.score);
          showTable();
        };
        box.querySelector('button').onclick = ok;
        m.onKey = (e) => {
          if (e.code === 'Enter' || e.code === 'NumpadEnter') ok();
        };
        setTimeout(() => input.select(), 0);
      } else {
        showTable();
      }
    }
    this.ui.appendChild(box);
    m.box = box;
  }

  _closeModalUi() {
    for (const el of this.ui.querySelectorAll('.gm-dialog')) el.remove();
  }

  _drawHighscores(m) {
    if (m.box?.querySelector('.gm-input')) return;
    // GM8 highscore window: the background image with the table drawn on it
    const ctx = this.ctx;
    const img = this._img(`bg:${m.bg}`);
    const W = 360;
    const H = 400;
    const x0 = (this.room.w - W) / 2;
    const y0 = (this.room.h - H) / 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x0, y0, W, H);
    if (img) ctx.drawImage(img, x0, y0, W, H);
    if (m.border) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, W, H);
      ctx.lineWidth = 1;
    }
    const px = Math.round(m.size * 1.6);
    ctx.font = `${px}px "${m.face}", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillStyle = cssColor(m.otherColor);
    ctx.fillText('Top Ten Players', x0 + W / 2, y0 + 20);
    this.highscores.forEach((h, k) => {
      ctx.fillStyle = cssColor(k === m.newIndex ? m.newColor : m.otherColor);
      const y = y0 + 64 + k * (px + 10);
      ctx.textAlign = 'left';
      ctx.fillText(h.name, x0 + 30, y);
      ctx.textAlign = 'right';
      ctx.fillText(String(h.score), x0 + W - 30, y);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = cssColor(m.otherColor);
    ctx.fillText('press <Escape> to close', x0 + W / 2, y0 + H - 34);
  }

  _loadScores() {
    try {
      const s = JSON.parse(localStorage.getItem('kosari.classic.highscores') || 'null');
      if (Array.isArray(s) && s.length === 10) return s;
    } catch (_) {
      /* ignore */
    }
    return Array.from({ length: 10 }, () => ({ name: '<nobody>', score: 0 }));
  }

  _scorePlace(score) {
    return this.highscores.findIndex((h) => score > h.score);
  }

  _insertScore(name, score) {
    const k = this._scorePlace(score);
    if (k < 0) return -1;
    this.highscores.splice(k, 0, { name, score });
    this.highscores.length = 10;
    try {
      localStorage.setItem('kosari.classic.highscores', JSON.stringify(this.highscores));
    } catch (_) {
      /* ignore */
    }
    return k;
  }

  // ------------------------------------------------------------------ save / load

  saveGame(file) {
    const data = {
      room: this.roomIndex,
      score: this.score,
      lives: this.lives,
      health: this.health,
      globals: this.globals,
      inst: this.instances.filter((i) => !i.dead).map((i) => ({
        o: i.object_index, x: i.x, y: i.y, hs: i.hspeed, vs: i.vspeed, g: i.gravity, gd: i.gravity_direction,
        s: i.sprite_index, ii: i.image_index, is: i.image_speed, a: i.image_alpha, al: i.alarm, v: i.vars,
      })),
    };
    try {
      localStorage.setItem(`kosari.classic.save.${file}`, JSON.stringify(data));
    } catch (_) {
      /* ignore */
    }
  }

  loadGame(file) {
    let data;
    try {
      data = JSON.parse(localStorage.getItem(`kosari.classic.save.${file}`) || 'null');
    } catch (_) {
      data = null;
    }
    if (!data) return;
    this._stopAllSounds();
    this.roomIndex = data.room;
    this.bgState = this.room.bgs.map((b) => ({ ...b }));
    this.score = data.score;
    this.lives = data.lives;
    this.health = data.health;
    this.globals = Object.assign(Object.create(null), data.globals);
    this.instances = data.inst.map((d) => {
      const i = new Instance(this, d.o, d.x, d.y);
      Object.assign(i, { hspeed: d.hs, vspeed: d.vs, gravity: d.g, gravity_direction: d.gd, sprite_index: d.s, image_index: d.ii, image_speed: d.is, image_alpha: d.a, alarm: d.al });
      i.vars = Object.assign(Object.create(null), d.v);
      return i;
    });
    // Music of the loaded room keeps going through the objects' own logic
    if (this.room.name === 'play' && this.globals.music_play) this.playSound('game', true);
  }

  // ------------------------------------------------------------------ input

  _toRoom(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * this.canvas.width,
      y: ((e.clientY - r.top) / r.height) * this.canvas.height,
    };
  }

  _bindInput() {
    const down = (e) => {
      if (this.modal) {
        this.modal.onKey?.(e);
        e.preventDefault();
        return;
      }
      const k = vkOf(e.code);
      if (k == null) return;
      if (!this.keysDown.has(k)) this.keysPressed.add(k);
      this.keysDown.add(k);
      if ([32, 37, 38, 39, 40, 13, 8].includes(k)) e.preventDefault();
    };
    const up = (e) => {
      const k = vkOf(e.code);
      if (k == null) return;
      if (this.keysDown.has(k)) this.keysReleased.add(k);
      this.keysDown.delete(k);
    };
    const move = (e) => {
      const p = this._toRoom(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
    };
    const mdown = (e) => {
      move(e);
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.pressed = true;
      }
    };
    const mup = (e) => {
      if (e.button === 0) this.mouse.down = false;
    };
    const blur = () => {
      this.keysDown.clear();
      this.mouse.down = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('mousedown', mdown);
    window.addEventListener('mouseup', mup);
    window.addEventListener('blur', blur);
    this._unbind = () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mouseup', mup);
      window.removeEventListener('blur', blur);
    };
  }
}

export { truthy };
