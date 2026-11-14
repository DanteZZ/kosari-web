import { stage, gradeLikeBg } from './stage.js';

/**
 * Easter egg: in the computer club one arcade cabinet glows. Walk up to it
 * and press J — the hero sits down and the original «Косари» (2011, the
 * classic port at /classic/) runs inside the cabinet's screen. Esc — get up
 * and go back to the fight, right where you left it.
 *
 * Single player only (online the host would freeze everybody's game).
 */
const AT = { x: 640, z: 6 };
const REACH = 150;
const TEX = 'kit_pc_club_arcade';

export class ArcadeEgg {
  /** null when this map has no cabinet. */
  static create(scene) {
    if (scene.map?.id !== 'pc_club' || scene.netMode || scene.theatre != null) return null;
    if (!scene.textures.exists(TEX)) return null;
    return new ArcadeEgg(scene);
  }

  constructor(scene) {
    this.scene = scene;
    this.near = false;
    this.open = false;
    const y = stage.groundY(AT.z);
    // Taller than the scenery copies, and it glows: this one is special
    this.img = scene.add.image(AT.x, y + 6, TEX).setOrigin(0.5, 1).setDepth(stage.depth(AT.z) - 1);
    this.img.setScale(300 / this.img.height);
    gradeLikeBg(this.img, 0.4);
    try {
      this.glow = this.img.postFX.addGlow(0xff2bd6, 4, 0, false, 0.1, 10);
    } catch (_) {
      this.glow = null;
    }
    if (this.glow) scene.tweens.add({ targets: this.glow, outerStrength: { from: 2, to: 7 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.hint = scene.add
      .text(AT.x, y - 330, 'J — сыграть в «Косари» (2011)', { fontFamily: 'Russo One, Impact, sans-serif', fontSize: '22px', color: '#ffd23f', stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5, 1)
      .setDepth(1600)
      .setVisible(false);
    scene.tweens.add({ targets: this.hint, y: this.hint.y - 8, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this._onKey = () => this.tryOpen();
    scene.input.keyboard.on('keydown-J', this._onKey);
    scene.events.once('shutdown', () => this.close(true));
  }

  /** Each frame: is the hero standing at the cabinet (and free to play)? */
  update() {
    const sc = this.scene;
    const p = sc.player;
    const free = p && !p.dead && !sc.cine?.active && !sc.finished && !sc.lock;
    this.near = !!free && Math.abs(p.x - AT.x) < REACH && Math.abs(p.z - AT.z) < 70;
    this.hint.setVisible(this.near && !this.open);
  }

  tryOpen() {
    if (!this.near || this.open || this.scene.paused) return;
    this.open = true;
    const sc = this.scene;
    sc.player.facing = AT.x >= sc.player.x ? 1 : -1;
    sc.cine.play(async (c) => {
      c.setFreeze(true);
      await c.camTo(AT.x, stage.groundY(AT.z) - 170, 1.5, 700);
      await c.say(sc.heroSpeaker(), 'Автомат… «Косари», две тысячи одиннадцатый. Тот самый. Одну партию.');
      c.hideBox();
      c.flash(0xffffff, 300, 0.7);
      await c.wait(250);
      this.mount();
    });
  }

  /** The cabinet's screen over the game: the classic port in an iframe. */
  mount() {
    const sc = this.scene;
    sc.paused = true;
    sc.music?.setPaused(true);
    sc.sound.pauseAll();
    const shell = document.getElementById('game-shell') || document.body;
    const frame = document.createElement('iframe');
    frame.className = 'arc-screen';
    frame.src = new URL('../classic/', window.location.href).href;
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.title = 'Косари (2011)';
    const ov = document.createElement('div');
    ov.className = 'arc';
    ov.innerHTML = '<div class="arc-cab"><div class="arc-marquee">КОСАРИ · 2011</div><div class="arc-bezel"></div><div class="arc-foot"><span>Esc — встать из-за автомата</span><button type="button">✕</button></div></div>';
    ov.querySelector('.arc-bezel').append(frame);
    ov.querySelector('button').addEventListener('click', () => this.close());
    shell.append(ov);
    this.ov = ov;
    // Esc closes it whichever page has the keys (the iframe is the same site)
    this._esc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close();
    };
    window.addEventListener('keydown', this._esc, true);
    // The classic game's own «Выход» (classic/main.js) asks us to close
    this._msg = (e) => {
      if (e.source === frame.contentWindow && e.data?.type === 'kosari-classic-exit') this.close();
    };
    window.addEventListener('message', this._msg);
    frame.addEventListener('load', () => {
      // Never let the cabinet wander off to another page of the site
      try {
        if (!frame.contentWindow.location.pathname.includes('/classic')) {
          this.close();
          return;
        }
      } catch (_) {
        /* another origin */
      }
      try {
        frame.contentWindow.addEventListener('keydown', this._esc, true);
      } catch (_) {
        /* another origin: the button still works */
      }
      frame.focus();
    });
    requestAnimationFrame(() => ov.classList.add('on'));
  }

  close(silent = false) {
    if (!this.ov) {
      if (silent) this.scene.input?.keyboard?.off('keydown-J', this._onKey);
      return;
    }
    const sc = this.scene;
    window.removeEventListener('keydown', this._esc, true);
    window.removeEventListener('message', this._msg);
    const ov = this.ov;
    this.ov = null;
    ov.classList.remove('on');
    // The classic game's own music goes with its page
    setTimeout(() => ov.remove(), silent ? 0 : 260);
    if (silent) return;
    sc.input.keyboard.resetKeys();
    sc.sound.resumeAll();
    sc.music?.setPaused(false);
    sc.paused = false;
    this.open = false;
    window.focus();
    sc.popText(sc.player.x, stage.groundY(sc.player.z) - 360, 'Эх, были времена…', '#ffd23f', 26);
  }
}
