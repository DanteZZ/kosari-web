import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';
import { Player } from '../objects/Player.js';
import { Kosar } from '../objects/Kosar.js';
import { Enemy } from '../objects/Enemy.js';
import { Boss } from '../objects/Boss.js';
import { Coin } from '../objects/Coin.js';
import { Crate } from '../objects/Crate.js';
import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, GROUND_Y, DEBUG_FIGHT } from './constants.js';
import { createParallax } from './parallax.js';
import { createSessionShop } from './sessionShop.js';

/** Full arcade mechanics port, wide scrolling world. */
export class PlayScene extends Phaser.Scene {
  constructor() {
    super('Play');
  }

  init(data) {
    this.onExit = data?.onExit;
    this.onHud = data?.onHud;
    this.onDead = data?.onDead;
    this.worldW = WORLD_W;
    this.worldH = WORLD_H;
    this.groundY = GROUND_Y;
  }

  create() {
    this.pausedGame = false;
    this.gameOverStarted = false;
    this.cameras.main.setBackgroundColor('#7ec8f0');
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.parallax = createParallax(this);

    this.ground = this.physics.add.staticGroup();
    this.rebuildGround();

    this.player = new Player(this, 208, GROUND_Y);
    this.player.setDepth(10);
    this.physics.add.collider(this.player, this.ground);
    // Fists only for now (no equipped weapon visual)
    this.player.selectWeapon(0);

    this.kosari = this.add.group();
    this.hitboxes = this.physics.add.group();
    this.meleeAttacks = [];
    this.anvils = this.add.group();
    this.bullets = this.physics.add.group();
    this.enemies = this.add.group();
    this.bosses = this.add.group();
    this.pickups = this.add.group();
    this.coins = this.add.group();
    this.crates = this.add.group();
    this.iFrames = 0;
    this.bossSpawned = { 1: false, 2: false, 3: false };
    this.rainOn = false;
    this.rainTimer = 5000;
    this.dirigTimer = 900;
    this.crateTimer = 400;
    this.anvilCd = 600; // no anvils for first ~20s even if progress gate is met
    this.shopOpen = false;
    this.cutsceneActive = false;
    this.sessionShop = createSessionShop(this);
    this.markUi(this.sessionShop.root);

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    // Soft follow; framing (side bias / run bob) applied each frame in updateCameraFeel
    this.cameras.main.startFollow(this.player, true, 0.14, 0.12);
    this.cameras.main.setDeadzone(0, 20);
    // Start already looking ahead (player faces right by default)
    this._camOffX = -(VIEW_W * (0.5 - 0.33));
    this._camBob = 0;
    this._camSway = 0;
    this._runCamT = 0;
    this._camZoom = 1;
    this.cameras.main.setFollowOffset(this._camOffX, 0);

    // Separate UI camera — main can zoom the world without scaling HUD
    this.uiCam = this.cameras.add(0, 0, VIEW_W, VIEW_H);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setName('ui');

    if (GameState.musicPlay) {
      this.sound.stopAll();
      this.sound.play('game', { loop: true, volume: 0.45 });
    }

    this.buildHud();

    /** Debug: body + melee pads (cyan player, magenta bots, yellow/red punches). */
    this.debugColliders = false;
    this.debugGfx = this.add.graphics().setDepth(9999);

    this.pauseText = this.add
      .text(VIEW_W / 2, VIEW_H / 2, 'Пауза. Enter / P — продолжить', {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(3000)
      .setVisible(false)
      .setData('isUi', true);

    this.bindUiCameras();

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.shopOpen) return;
      this.pausedGame = !this.pausedGame;
      this.game.events.emit('remake-pause', this.pausedGame);
    });

    // ?flip=1 — auto somersault loop so we can verify pivot vs hurtbox
    if (typeof window !== 'undefined' && window.__KOSARI_FLIP_TEST) {
      this.pausedGame = false;
      document.getElementById('pause-overlay')?.classList.add('hidden');
      const kickFlip = () => {
        const p = this.player;
        if (!p?.active || this.gameOverStarted) return;
        this.pausedGame = false;
        p.dir = 1;
        p.y = this.groundY;
        p.vy = -16;
        p.hx = 17 * 1.15;
        p.run = 1;
        p.djump = 1;
        if (p.flipping) p.endFlip();
        p.beginFlip();
      };
      this.time.delayedCall(400, kickFlip);
      this.time.addEvent({ delay: 1600, loop: true, callback: kickFlip });
    }

    this._onRemakeResize = () => this.applyViewport();
    this.game.events.on('remake-resize', this._onRemakeResize);

    this.events.on('shutdown', () => {
      this.game.events.off('remake-resize', this._onRemakeResize);
      this.sound.stopByKey('game');
      this.sound.stopByKey('rain');
      this.sound.stopByKey('boss');
      this.sound.stopByKey('dirigabb_sound');
    });

    this.applyViewport();
    this.pushHud();
  }

  rebuildGround() {
    this.ground.clear(true, true);
    for (let x = 0; x < WORLD_W; x += 32) {
      const tile = this.ground.create(x, GROUND_Y, 'spr_wall_0');
      tile.setOrigin(0, 0).setDisplaySize(32, 40).refreshBody();
      tile.setVisible(false);
    }
  }

  applyViewport() {
    this.worldH = WORLD_H;
    this.groundY = GROUND_Y;
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setSize(VIEW_W, VIEW_H);
    this.uiCam?.setSize(VIEW_W, VIEW_H);
    this.uiCam?.setViewport(0, 0, VIEW_W, VIEW_H);
    this.parallax?.resize();
    this.rebuildGround();
    if (this.player?.body) {
      this.player.groundY = GROUND_Y;
      this.player.worldW = WORLD_W;
      const feet = this.player.y;
      if (feet > GROUND_Y + 2 || feet < GROUND_Y - 80) {
        this.player.y = GROUND_Y;
      }
      this.player.syncHurtbox?.();
      this.player.body.updateFromGameObject();
    }
    this.hudWeaponList?.setPosition(VIEW_W - 14, 10);
    this.hudGrenade?.setPosition(VIEW_W - 14, VIEW_H - 28);
    this.bossHud?.setX(VIEW_W / 2);
    this.pauseText?.setPosition(VIEW_W / 2, VIEW_H / 2);
    this.sessionShop?.layout?.();
    if (this.rainFx) {
      this.rainFx.setSize(VIEW_W, VIEW_H);
    }
  }

  /** Mark GO as UI-only (drawn by uiCam, ignored by world zoom camera). */
  markUi(go) {
    if (!go) return go;
    go.setData?.('isUi', true);
    this.cameras.main.ignore(go);
    return go;
  }

  /**
   * World camera zooms; UI camera stays 1:1.
   * New world objects are ignored by uiCam via addedtoscene.
   */
  bindUiCameras() {
    const uiCam = this.uiCam;
    const main = this.cameras.main;
    if (!uiCam) return;

    const isUi = (go) =>
      !!(go?.getData?.('isUi') || go?.parentContainer?.getData?.('isUi'));

    this.children.each((child) => {
      if (isUi(child)) main.ignore(child);
      else uiCam.ignore(child);
    });

    if (this._uiCamBound) return;
    this._uiCamBound = true;
    this.events.on('addedtoscene', (go) => {
      // Defer so parentContainer is set when HUD pieces join hudRoot
      this.time.delayedCall(0, () => {
        if (!go?.scene || !this.uiCam) return;
        if (isUi(go)) {
          this.cameras.main.ignore(go);
          return;
        }
        this.uiCam.ignore(go);
      });
    });
  }

  buildHud() {
    const d = 2000;
    this.hudRoot = this.add.container(0, 0).setDepth(d).setScrollFactor(0);
    this.markUi(this.hudRoot);

    this.lifeIcons = [];
    this.hudMoney = this.add.text(120, 8, '', {
      fontFamily: 'Russo One, Impact, sans-serif',
      fontSize: '16px',
      color: '#f0c040',
    });
    this.hudScore = this.add.text(120, 28, '', {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#cccccc',
    });

    this.hpBg = this.add.rectangle(120, 46, 140, 10, 0x1a1a1a).setOrigin(0);
    this.hpBar = this.add.rectangle(120, 46, 140, 10, 0x3dcc66).setOrigin(0);

    // Right weapon list (fists + owned)
    this.hudWeaponList = this.add
      .text(VIEW_W - 14, 10, '', {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        align: 'right',
        lineSpacing: 4,
      })
      .setOrigin(1, 0);

    this.hudGrenade = this.add
      .text(VIEW_W - 14, VIEW_H - 28, '', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#aaaaaa',
      })
      .setOrigin(1, 1);

    this.bossHud = this.add
      .text(VIEW_W / 2, 14, '', {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: '15px',
        color: '#ff6b6b',
        backgroundColor: '#00000099',
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5, 0)
      .setVisible(false);

    this.hudRoot.add([
      this.hudMoney,
      this.hudScore,
      this.hpBg,
      this.hpBar,
      this.hudWeaponList,
      this.hudGrenade,
      this.bossHud,
    ]);
  }

  /**
   * Side-biased framing (~33% from the rear), run zoom + sway, jump-ready Y follow.
   * Phaser followOffset is subtracted from the target — negative X looks ahead when facing right.
   */
  updateCameraFeel() {
    const cam = this.cameras.main;
    const p = this.player;
    if (!p?.active) return;

    const face = p.flipping && p.flipDir != null ? p.flipDir : p.dir;
    const side = face === 0 ? -1 : 1;

    const onFloor = typeof p.isOnFloor === 'function' ? p.isOnFloor() : true;
    const running = p.run === 1 && onFloor && !p.flipping && !p.falling;
    if (running) this._runCamT += 1;
    else this._runCamT *= 0.9;

    // Soft zoom only on the world camera (HUD lives on uiCam)
    const zoomTarget = running ? 1.03 : 1;
    this._camZoom = Phaser.Math.Linear(this._camZoom, zoomTarget, 0.045);
    cam.setZoom(this._camZoom);

    // Keep ~33% framing in *screen* space as zoom changes
    const lookAhead = (VIEW_W / this._camZoom) * (0.5 - 0.33);
    const targetOffX = -side * lookAhead;
    this._camOffX = Phaser.Math.Linear(this._camOffX, targetOffX, 0.08);

    const bobTarget = running ? Math.sin(this._runCamT * 0.38) * 2.6 : 0;
    const swayTarget = running ? Math.sin(this._runCamT * 0.19) * 0.0025 : 0;
    this._camBob = Phaser.Math.Linear(this._camBob, bobTarget, 0.14);
    this._camSway = Phaser.Math.Linear(this._camSway, swayTarget, 0.1);

    cam.setFollowOffset(this._camOffX, this._camBob);
    cam.setRotation(this._camSway);
  }

  mapProgress() {
    const x = Math.max(GameState.maxXReached || 0, this.player?.x || 0);
    return Phaser.Math.Clamp(x / WORLD_W, 0, 1);
  }

  toggleSessionShop(force) {
    if (this.cutsceneActive || this.gameOverStarted) return;
    const next = force === undefined ? !this.shopOpen : !!force;
    this.shopOpen = next;
    // Buy menu does not pause combat (CS-style)
    this.sessionShop?.setVisible(next);
  }

  /** Hotkey buy while side shop is open (slots 1…). */
  tryBuyShopSlot(slot1based) {
    if (!this.shopOpen) return false;
    return !!this.sessionShop?.buySlot?.(slot1based);
  }

  spawnCoin(x, y, value = 500) {
    const c = new Coin(this, x, y, value);
    this.coins.add(c);
    return c;
  }

  spawnCrate(x) {
    const crate = new Crate(this, x ?? this.camX() + Phaser.Math.Between(120, VIEW_W - 80), GROUND_Y);
    this.crates.add(crate);
    return crate;
  }

  spawnCrateLoot(x, y) {
    for (let i = 0; i < Phaser.Math.Between(3, 6); i += 1) {
      this.spawnCoin(x + Phaser.Math.Between(-30, 30), y - 10, Phaser.Math.Between(600, 1800));
    }
    // Chance to drop a weapon pack on the ground
    if (Phaser.Math.Between(1, 100) <= 35) {
      const pool = [1, 2, 3, 4].filter((id) => !GameState.ownsWeapon(id));
      const id = pool.length ? Phaser.Utils.Array.GetRandom(pool) : Phaser.Math.Between(1, 4);
      this.spawnWeaponPickup(x, y - 20, id);
    }
  }

  spawnWeaponPickup(x, y, weaponId) {
    const labels = { 1: 'DE', 2: 'SG', 3: 'AK', 4: 'RPG' };
    const p = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 36, 20, 0x222228).setStrokeStyle(1, 0xf0c040);
    const t = this.add
      .text(0, 0, labels[weaponId] || '?', {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: '12px',
        color: '#f0c040',
      })
      .setOrigin(0.5);
    p.add([bg, t]);
    p.setDepth(9);
    this.physics.add.existing(p);
    p.body.setAllowGravity(false);
    p.body.setSize(40, 24);
    p.body.setOffset(-20, -12);
    p.kind = 'weapon';
    p.weaponId = weaponId;
    p.vy = -6;
    this.pickups.add(p);
  }

  update() {
    this.pauseText.setVisible(!!this.pausedGame);
    if (this.gameOverStarted) return;
    if (this.pausedGame) return;

    // Pose first, then fist/foot colliders sample the current bone positions
    this.player.step();
    this.updateCameraFeel();
    {
      const ground = this.groundY ?? GROUND_Y;
      const jumpLift = Math.max(0, ground - (this.player?.y ?? ground));
      this.parallax?.update(this.cameras.main.scrollX, jumpLift);
    }
    if (!this.cutsceneActive) {
      this.kosari.getChildren().forEach((k) => k.active && k.step());
    }
    this.enemies.getChildren().forEach((e) => e.active && e.step());
    this.bosses.getChildren().forEach((b) => {
      if (!b.active || this.cutsceneActive) return;
      b.step();
    });
    this.coins.getChildren().forEach((c) => c.active && c.step?.());
    this.crates.getChildren().forEach((c) => c.active && c.step?.());
    this.updateMeleeAttacks();
    if (this.iFrames > 0) this.iFrames -= 1;
    this.drawDebugColliders();

    this.anvils.getChildren().forEach((a) => {
      if (!a.active || this.cutsceneActive) return;
      if (a.hazardKind === 'throw') {
        a.vx = (a.vx ?? 0);
        a.vy = (a.vy ?? 4) + 0.35;
        a.x += a.vx;
        a.y += a.vy;
      } else {
        a.y += a.fallSpeed ?? 7;
      }
      a.body?.reset(a.x, a.y);
      if (a.y > WORLD_H + 40) {
        a.destroy();
        return;
      }
      this.resolveAnvilHits(a);
    });

    this.pickups.getChildren().forEach((p) => {
      if (!p.active) return;
      if (p.kind === 'weapon') {
        if (p.vy != null) {
          p.vy += 0.45;
          p.y += p.vy;
          if (p.y >= GROUND_Y - 10) {
            p.y = GROUND_Y - 10;
            p.vy = 0;
          }
        }
        p.body?.reset(p.x, p.y);
        if (this.rectsOverlap(this.player, p)) this.collectPickup(p);
        return;
      }
      p.y += 4;
      p.body?.reset(p.x, p.y);
      if (p.y > WORLD_H) p.destroy();
      else if (this.rectsOverlap(this.player, p)) this.collectPickup(p);
    });

    this.coins.getChildren().forEach((c) => {
      if (c.active && this.rectsOverlap(this.player, c)) {
        c.collect();
      }
    });

    this.kosari.getChildren().forEach((k) => {
      if (!k.active) return;
      if (this.rectsOverlap(this.player, k)) this.collectKosar(this.player, k);
    });

    // Walking bots fight with punches — no passive body bump damage
    this.bosses.getChildren().forEach((b) => {
      if (!b.active || this.cutsceneActive) return;
      if (this.iFrames <= 0 && this.rectsOverlap(this.player, b)) this.hurtPlayer();
    });

    this.bullets.getChildren().forEach((b) => {
      if (!b.active) return;
      b.x += b.vx || 0;
      b.y += b.vy || 0;
      b.body?.reset(b.x, b.y);
      if (b.x < this.camX() - 40 || b.x > this.camX() + VIEW_W + 40) {
        b.destroy();
        return;
      }
      this.kosari.getChildren().forEach((k) => {
        if (k.active && this.rectsOverlap(b, k)) {
          this.smashKosar(k);
          if (!b.pierce) b.destroy();
        }
      });
      this.enemies.getChildren().forEach((e) => {
        if (e.active && this.rectsOverlap(b, e)) {
          e.hurt(b.damage || 50);
          this.spawnHitImpact?.(b.x, b.y, Math.sign(b.vx || 1), { heavy: (b.damage || 0) >= 80 });
          if (b.explode) this.spawnExplosion?.(b.x, b.y);
          if (!b.pierce) b.destroy();
        }
      });
      this.bosses.getChildren().forEach((boss) => {
        if (boss.active && this.rectsOverlap(b, boss)) {
          boss.hurt(b.damage || 50);
          this.spawnHitImpact?.(b.x, b.y, Math.sign(b.vx || 1), { heavy: true });
          if (b.explode) this.spawnExplosion(b.x, b.y);
          if (!b.pierce) b.destroy();
        }
      });
    });

    if (!DEBUG_FIGHT && !this.cutsceneActive) {
      this.updateSessionSpawns();
    }

    this.pushHud();

    if (!DEBUG_FIGHT && GameState.lives <= 0) this.beginGameOver();
  }

  /** Distance-based enemy / hazard / boss pacing. */
  updateSessionSpawns() {
    const progress = this.mapProgress();
    const hasBoss = this.bosses.countActive() > 0;

    // Rare score-bonus kosari (not main income)
    if (this.kosari.countActive() < 3 && Phaser.Math.Between(1, 220) === 1) this.spawnKosar(1);

    // Rare anvils — late map only, cooldown + cap (never right at spawn)
    this.anvilCd = Math.max(0, (this.anvilCd || 0) - 1);
    if (
      !hasBoss &&
      progress >= 0.42 &&
      this.anvilCd <= 0 &&
      this.anvils.countActive() < 1
    ) {
      const roll = progress >= 0.75 ? 480 : progress >= 0.58 ? 640 : 820;
      if (Phaser.Math.Between(1, roll) === 1) {
        this.spawnAnvil();
        this.anvilCd = Phaser.Math.Between(180, 360); // ~6–12s at 30fps
      }
    }

    // Crates ahead of player
    this.crateTimer -= 1;
    if (this.crateTimer <= 0 && this.crates.countActive() < 2) {
      this.crateTimer = Phaser.Math.Between(350, 700);
      if (Phaser.Math.Between(1, 100) <= 40) {
        this.spawnCrate(this.player.x + Phaser.Math.Between(280, 520));
      }
    }

    const nikMax = progress < 0.15 ? 2 : progress < 0.4 ? 3 : 4;
    const buiMax = progress < 0.28 ? 0 : progress < 0.55 ? 2 : 3;
    const nikitas = this.enemies.getChildren().filter((e) => e.active && e.kind === 'nikita').length;
    const buinies = this.enemies.getChildren().filter((e) => e.active && e.kind === 'buiniy').length;
    const nikOdds = progress < 0.2 ? 90 : progress < 0.5 ? 70 : 55;
    const buiOdds = progress < 0.4 ? 110 : 75;

    if (progress >= 0.04 && nikitas < nikMax && Phaser.Math.Between(1, nikOdds) === 1) {
      this.spawnEnemy('nikita');
    }
    if (progress >= 0.28 && buinies < buiMax && Phaser.Math.Between(1, buiOdds) === 1) {
      this.spawnEnemy('buiniy');
    }

    // Bosses at map milestones
    if (!hasBoss && !this.cutsceneActive) {
      if (!this.bossSpawned[1] && progress >= 0.33) this.beginBossCutscene(1);
      else if (!this.bossSpawned[2] && progress >= 0.6) this.beginBossCutscene(2);
      else if (!this.bossSpawned[3] && progress >= 0.88) this.beginBossCutscene(3);
    }

    this.rainTimer -= 1;
    if (this.rainTimer <= 0) {
      this.rainTimer = Phaser.Math.Between(5000, 9000);
      if (progress >= 0.2) this.triggerRain();
    }

    this.dirigTimer -= 1;
    if (this.dirigTimer <= 0 && progress >= 0.5) {
      this.dirigTimer = Phaser.Math.Between(1400, 2200);
      this.spawnDirigible();
    }
  }

  beginBossCutscene(tier) {
    if (this.cutsceneActive || this.bossSpawned[tier]) return;
    this.bossSpawned[tier] = true;
    this.cutsceneActive = true;
    this.enemies.getChildren().forEach((e) => {
      if (e.active) e.aiPaused = true;
    });

    const names = { 1: 'БОСС I', 2: 'БОСС II', 3: 'БОСС III' };
    const banner = this.add
      .text(VIEW_W / 2, VIEW_H / 2, names[tier] || 'БОСС', {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: '36px',
        color: '#ff4444',
        backgroundColor: '#000000cc',
        padding: { x: 24, y: 14 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2800)
      .setData('isUi', true);
    this.markUi?.(banner);

    this.sound.stopByKey('game');
    if (GameState.musicPlay) this.sound.play('boss', { loop: true, volume: 0.5 });

    this.cameras.main.shake(200, 0.006);
    this.time.delayedCall(2000, () => {
      banner.destroy();
      this.spawnBoss(tier);
      this.cutsceneActive = false;
      this.enemies.getChildren().forEach((e) => {
        if (e.active) e.aiPaused = false;
      });
    });
  }

  beginGameOver() {
    if (DEBUG_FIGHT) return;
    if (this.gameOverStarted) return;
    this.gameOverStarted = true;
    this.player.active = false;
    this.sound.stopByKey('game');
    this.sound.stopByKey('rain');
    this.sound.stopByKey('boss');
    this.sound.stopByKey('dirigabb_sound');
    GameState.livesDoubler = 0;
    this.onDead?.(GameState.score);
  }

  /** Reliable AABB from an Arcade body (Body is not always a Geom.Rectangle). */
  bodyRect(obj) {
    const b = obj?.body;
    if (!b || !b.enable) return null;
    return new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height);
  }

  rectsOverlap(a, b) {
    const ar = a instanceof Phaser.Geom.Rectangle ? a : this.bodyRect(a);
    const br = b instanceof Phaser.Geom.Rectangle ? b : this.bodyRect(b);
    if (ar && br) return Phaser.Geom.Intersects.RectangleToRectangle(ar, br);
    if (a?.getBounds && b?.getBounds) {
      return Phaser.Geom.Intersects.RectangleToRectangle(a.getBounds(), b.getBounds());
    }
    return false;
  }

  /** World AABB of a live melee pad (tracks fist/foot). */
  meleeRect(a, owner) {
    const p = owner || a.owner || a.player;
    if (!p) return null;
    return new Phaser.Geom.Rectangle(p.x + a.ox, p.y + a.oy, a.boxW, a.boxH);
  }

  drawDebugColliders() {
    const g = this.debugGfx;
    if (!g) return;
    g.clear();
    if (!this.debugColliders) return;

    const strokeBody = (obj, color) => {
      const r = this.bodyRect(obj);
      if (!r) return;
      g.lineStyle(2, color, 0.95);
      g.strokeRectShape(r);
      g.fillStyle(color, 0.12);
      g.fillRectShape(r);
    };

    strokeBody(this.player, 0x00e5ff);
    this.enemies.getChildren().forEach((e) => e.active && strokeBody(e, 0xff00aa));
    this.bosses.getChildren().forEach((b) => b.active && strokeBody(b, 0xaa66ff));

    // Body pivot = cyan box center; green cross must sit on it while flipping
    if (this.player?.body) {
      const c = this.player.body.center;
      g.lineStyle(2, 0x00ff66, 1);
      g.lineBetween(c.x - 14, c.y, c.x + 14, c.y);
      g.lineBetween(c.x, c.y - 14, c.x, c.y + 14);
      g.strokeCircle(c.x, c.y, 8);
    }

    for (const a of this.meleeAttacks) {
      const r = this.meleeRect(a);
      if (!r) continue;
      const color = a.team === 'enemy' ? 0xff3300 : 0xffee00;
      g.lineStyle(3, color, 1);
      g.strokeRectShape(r);
      g.fillStyle(color, 0.28);
      g.fillRectShape(r);
    }
  }

  camX() {
    return this.cameras.main.scrollX;
  }

  spawnKosar(pack = 1) {
    const x = this.camX() + Phaser.Math.Between(0, VIEW_W - 80);
    this.kosari.add(new Kosar(this, x, -50, pack));
  }

  spawnAnvil() {
    // Prefer ahead of the player so it telegraphs instead of spawning on top
    const ahead = this.player?.x ?? this.camX() + VIEW_W * 0.5;
    const x = Phaser.Math.Clamp(
      ahead + Phaser.Math.Between(40, Math.floor(VIEW_W * 0.55)),
      this.camX() + 40,
      this.camX() + VIEW_W - 40,
    );
    const a = this.physics.add.image(x, -120, 'nakovalna_0');
    a.setOrigin(0.55, 0.45);
    a.body.setAllowGravity(false);
    a.fallSpeed = 7;
    a.hazardKind = 'anvil';
    this.anvils.add(a);
  }

  spawnAmmo() {
    const x = this.camX() + Phaser.Math.Between(20, VIEW_W - 60);
    const p = this.physics.add.image(x, -40, 'oboima_0');
    p.setOrigin(0);
    p.body.setAllowGravity(false);
    p.kind = 'ammo';
    this.pickups.add(p);
  }

  collectPickup(p) {
    if (p.kind === 'ammo') {
      GameState.deserteaglebullets += 8;
      this.sound.play('DE_reload', { volume: 0.5 });
    } else if (p.kind === 'weapon') {
      const id = p.weaponId || 1;
      const packs = {
        1: { flag: 'deserteagle', ammo: 'deserteaglebullets', n: 30 },
        2: { flag: 'shotgunbought', ammo: 'shotgunbullets', n: 16 },
        3: { flag: 'ak47bought', ammo: 'ak47bullets', n: 60 },
        4: { flag: 'rpg7bought', ammo: 'rpg7bullets', n: 3 },
      };
      const def = packs[id];
      if (def) {
        GameState[def.flag] = 1;
        GameState[def.ammo] += def.n;
        GameState.weaponChoose = id;
        this.player?.syncWeapon?.();
        this.sound.play('DE_reload', { volume: 0.55 });
      }
    }
    p.destroy();
    this.pushHud();
  }

  spawnEnemy(kind, xOverride) {
    const scroll = this.camX();
    // nikita walks left from the right edge; buiniy walks right from the left
    const fromLeft = kind === 'buiniy';
    const x =
      xOverride != null
        ? xOverride
        : fromLeft
          ? scroll - 60
          : scroll + VIEW_W + 40;
    this.enemies.add(new Enemy(this, x, 0, kind));
  }

  /** Debug arena: spawn bot ~180px beside the player. */
  spawnEnemyNearPlayer(kind) {
    if (!DEBUG_FIGHT || !this.player) return;
    const side = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    const x = Phaser.Math.Clamp(
      this.player.x + side * 180,
      60,
      this.worldW - 60,
    );
    this.spawnEnemy(kind, x);
  }

  spawnBoss(tier) {
    this.bossSpawned[tier] = true;
    const x = this.camX() + VIEW_W - 220;
    const b = new Boss(this, x, GROUND_Y, tier);
    this.bosses.add(b);
  }

  onBossDefeated() {
    if (this.bosses.countActive() === 0) {
      this.sound.stopByKey('boss');
      if (GameState.musicPlay) this.sound.play('game', { loop: true, volume: 0.45 });
    }
  }

  spawnBossThrow(boss) {
    const proj = this.physics.add.image(boss.x, boss.y - 120, 'nakovalna_0');
    proj.setOrigin(0.5).setScale(0.7);
    proj.body.setAllowGravity(false);
    proj.hazardKind = 'throw';
    const dx = this.player.x - boss.x;
    proj.vx = Math.sign(dx || -1) * 5.5;
    proj.vy = -2;
    this.anvils.add(proj);
  }

  triggerRain() {
    if (this.rainOn) return;
    this.rainOn = true;
    if (GameState.musicPlay) this.sound.play('rain', { loop: true, volume: 0.35 });
    if (this.textures.exists('rain_0')) {
      const r = this.add
        .tileSprite(0, 0, VIEW_W, VIEW_H, 'rain_0')
        .setOrigin(0)
        .setScrollFactor(0)
        .setAlpha(0.55)
        .setDepth(50);
      this.tweens.add({
        targets: r,
        alpha: 0.2,
        duration: 4000,
        yoyo: true,
        onComplete: () => {
          r.destroy();
          this.sound.stopByKey('rain');
          this.rainOn = false;
        },
      });
    } else {
      this.time.delayedCall(5000, () => {
        this.sound.stopByKey('rain');
        this.rainOn = false;
      });
    }
    if (Phaser.Math.Between(1, 3) === 1 && this.textures.exists('thunder_0')) {
      const t = this.add
        .image(this.camX() + Phaser.Math.Between(0, VIEW_W - 100), 0, 'thunder_0')
        .setOrigin(0)
        .setDepth(51);
      this.sound.play('thunder', { volume: 0.5 });
      this.time.delayedCall(400, () => t.destroy());
    }
  }

  spawnDirigible() {
    if (!this.textures.exists('dirig_0')) return;
    const startX = this.camX() - 100;
    const d = this.add.sprite(startX, 40, 'dirig_0').setOrigin(0).setDepth(40);
    if (this.anims.exists('dirig_fly')) d.play('dirig_fly');
    this.sound.play('dirigabb_poyav', { volume: 0.5 });
    if (GameState.musicPlay) this.sound.play('dirigabb_sound', { loop: true, volume: 0.25 });
    this.tweens.add({
      targets: d,
      x: this.camX() + VIEW_W + 80,
      duration: 9000,
      onUpdate: () => {
        if (Phaser.Math.Between(1, 40) === 1) this.dropDirigBomb(d.x + 40, d.y + 40);
      },
      onComplete: () => {
        d.destroy();
        this.sound.stopByKey('dirigabb_sound');
      },
    });
  }

  dropDirigBomb(x, y) {
    const key = this.textures.exists('dirig_bomb_0') ? 'dirig_bomb_0' : 'nakovalna_0';
    const bomb = this.textures.exists('dirig_bomb_0')
      ? this.physics.add.sprite(x, y, key)
      : this.physics.add.image(x, y, key);
    bomb.setOrigin(0.5);
    bomb.body.setAllowGravity(false);
    bomb.fallSpeed = 6;
    bomb.hazardKind = 'bomb';
    if (bomb.play && this.anims.exists('dirig_bomb_fall')) bomb.play('dirig_bomb_fall');
    this.anvils.add(bomb);
  }

  spawnExplosion(x, y) {
    this.sound.play('explosion', { volume: 0.5 });
    if (this.anims.exists('explosion_anim')) {
      const ex = this.add.sprite(x, y, 'explosion_0').setOrigin(0.5);
      ex.play('explosion_anim');
      ex.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => ex.destroy());
    } else if (this.textures.exists('explosion_0')) {
      const ex = this.add.image(x, y, 'explosion_0').setOrigin(0.5);
      this.time.delayedCall(350, () => ex.destroy());
    }
  }

  collectKosar(_player, kosar) {
    if (!kosar.active) return;
    if (GameState.musicPlay) this.sound.play('cash', { volume: 0.45 });
    // Rare sky bonus — mostly score + small money
    GameState.addScore(kosar.value);
    GameState.addMoney(Math.floor(kosar.value * 0.15));
    GameState.livesDoubler += kosar.value;
    GameState.health = Math.min(100, GameState.health + 1);
    if (GameState.livesDoubler >= 99999) {
      GameState.livesDoubler = 0;
      GameState.lives += 1;
      this.sound.play('+life', { volume: 0.6 });
      if (this.textures.exists('1up_0')) {
        const up = this.add.image(this.player.x, this.player.y - 20, '1up_0').setOrigin(0);
        this.tweens.add({
          targets: up,
          y: up.y - 40,
          alpha: 0,
          duration: 800,
          onComplete: () => up.destroy(),
        });
      }
    }
    kosar.destroy();
  }

  smashKosar(kosar) {
    if (!kosar.active) return;
    const { x, y } = kosar;
    const bonus = Math.floor(kosar.value / 2);
    kosar.destroy();
    if (this.anims.exists('kosar_die')) {
      const die = this.add.sprite(x, y, 'kosar_die_0').setOrigin(0);
      die.play('kosar_die');
      die.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => die.destroy());
    }
    GameState.addScore(bonus);
    GameState.addMoney(Math.floor(bonus * 0.2));
    this.sound.play('hit', { volume: 0.4 });
  }

  /** Anvil / bomb / boss throw — hurts player, enemies, bosses; smashes loot. */
  resolveAnvilHits(anvil) {
    if (!anvil?.active) return;

    if (this.iFrames <= 0 && this.rectsOverlap(this.player, anvil)) {
      this.hitAnvil(anvil, { onPlayer: true });
      return;
    }

    for (const e of this.enemies.getChildren()) {
      if (e.active && this.rectsOverlap(e, anvil)) {
        this.hitAnvil(anvil, { enemy: e });
        return;
      }
    }
    for (const b of this.bosses.getChildren()) {
      if (b.active && this.rectsOverlap(b, anvil)) {
        this.hitAnvil(anvil, { boss: b });
        return;
      }
    }
    for (const k of this.kosari.getChildren()) {
      if (k.active && this.rectsOverlap(k, anvil)) {
        this.smashKosar(k);
        this.hitAnvil(anvil, { soft: true });
        return;
      }
    }
    for (const c of this.crates.getChildren()) {
      if (c.active && this.rectsOverlap(c, anvil)) {
        c.bust?.();
        this.hitAnvil(anvil, { soft: true });
        return;
      }
    }

    // Ground impact — smash and clear
    if (anvil.y >= (this.groundY ?? GROUND_Y) - 8) {
      this.hitAnvil(anvil, { ground: true });
    }
  }

  hitAnvil(anvil, opts = {}) {
    if (!anvil?.active) return;
    const { x, y } = anvil;
    anvil.destroy();

    if (opts.onPlayer) {
      this.hurtPlayer();
      this.cameras.main.shake(50, 0.004);
      return;
    }
    if (opts.enemy) {
      opts.enemy.hurt?.(180, { knockout: true, knockback: 14, facing: 0 });
      this.spawnHitImpact?.(x, y - 20, 1, { heavy: true });
      this.sound.play('hit', { volume: 0.55 });
      return;
    }
    if (opts.boss) {
      opts.boss.hurt?.(120, { knockback: 8, facing: 0 });
      this.spawnHitImpact?.(x, y - 40, 1, { heavy: true });
      this.sound.play('hit', { volume: 0.5 });
      return;
    }
    if (opts.ground || opts.soft) {
      this.sound.play('hit', { volume: 0.35 });
      if (this.textures.exists('nakovalna_br_0') || this.textures.exists('nakovalna_br')) {
        /* optional break VFX if frames exist */
      }
    }
  }

  hurtPlayer(opts = {}) {
    if (this.iFrames > 0 || this.gameOverStarted) return;
    if (!DEBUG_FIGHT) GameState.lives -= 1;
    this.iFrames = 45;
    if (!DEBUG_FIGHT) this.sound.play('-life', { volume: 0.55 });
    this.sound.play('urodblya', { volume: 0.4 });
    this.cameras.main.shake(40, 0.0022);
    this.player.visual?.setAlpha(0.55);
    this.time.delayedCall(160, () => this.player.visual?.setAlpha(1));
    this.player.applyHurt?.({
      facing: opts.facing ?? -1,
      knockback: opts.knockback ?? 8,
      knockout: !!opts.knockout,
    });
    this.pushHud();
  }

  meleeDamageFor(kind, style) {
    if (style === 'knockout') return 60;
    if (kind === 'x' || style === 'bruce') return 40;
    if (style === 'upper') return 35;
    return 30;
  }

  /**
   * Impact VFX at a melee connect: flash burst, sparks, optional blood, shake + hit SFX.
   * @param {number} x
   * @param {number} y
   * @param {number} facing 1|-1
   * @param {{ heavy?: boolean }} [opts]
   */
  spawnHitImpact(x, y, facing = 1, opts = {}) {
    const heavy = !!opts.heavy;
    const depth = 40;

    // Hot impact flash
    const flash = this.add.circle(x, y, heavy ? 14 : 10, 0xfff2c4, 0.95).setDepth(depth);
    this.tweens.add({
      targets: flash,
      scale: heavy ? 3.2 : 2.4,
      alpha: 0,
      duration: heavy ? 160 : 110,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    // Slash streaks in the hit direction
    const n = heavy ? 5 : 3;
    for (let i = 0; i < n; i += 1) {
      const ang = facing * (25 + i * 18) + Phaser.Math.Between(-8, 8);
      const len = (heavy ? 28 : 20) + i * 4;
      const streak = this.add
        .rectangle(x, y, len, heavy ? 4 : 3, i % 2 ? 0xffffff : 0xffcc66)
        .setDepth(depth + 1)
        .setAngle(ang)
        .setAlpha(0.95);
      this.tweens.add({
        targets: streak,
        x: x + facing * (18 + i * 10),
        y: y + Phaser.Math.Between(-16, 16),
        alpha: 0,
        scaleX: 1.6,
        duration: 90 + i * 25,
        ease: 'Quad.easeOut',
        onComplete: () => streak.destroy(),
      });
    }

    // Blood puff if available
    if (this.anims.exists('blood_anim')) {
      const blood = this.add
        .sprite(x + facing * 6, y, 'blood_0')
        .setOrigin(0.5)
        .setDepth(depth - 1)
        .setScale(heavy ? 0.85 : 0.65)
        .setFlipX(facing < 0);
      blood.play('blood_anim');
      blood.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => blood.destroy());
    }

    this.cameras.main.shake(heavy ? 28 : 18, heavy ? 0.0022 : 0.0014);
    this.sound.play('hit', { volume: heavy ? 0.55 : 0.4 });
  }

  /** World point of the striking limb for a live melee attack. */
  meleeLimbWorld(owner, followLimb) {
    if (!owner?.puppet) return null;
    if (followLimb === 'foot') return owner.puppet.getFootWorld('l');
    if (followLimb === 'r' || followLimb === 'l') return owner.puppet.getHandWorld(followLimb);
    return null;
  }

  spawnMeleeAttack(owner, facing, kind, limb) {
    // Fist/foot pad tracks the bone every frame for the whole swing.
    // Each target is hurt at most once (hit Set) until this attack ends.
    const style = limb?.style;
    const team = limb?.team || 'player';
    const followLimb = limb?.followLimb || (kind === 'x' ? 'foot' : 'l');
    let boxW = kind === 'z' ? 72 : 78;
    let boxH = kind === 'z' ? 72 : 60;
    let reach = 42;
    if (style === 'upper') {
      boxW = 76;
      boxH = 84;
      reach = 46;
    } else if (style === 'bruce') {
      boxW = 86;
      boxH = 56;
      reach = 52;
    } else if (style === 'knockout') {
      boxW = 90;
      boxH = 76;
      reach = 50;
    }

    const at = this.meleeLimbWorld(owner, followLimb) || {
      x: limb?.hx ?? owner.x + facing * 50,
      y: limb?.hy ?? owner.y - 90,
    };
    const cx = at.x + facing * reach;
    const cy = at.y;
    const ox = cx - owner.x - boxW / 2;
    const oy = cy - owner.y - boxH / 2;

    const box = this.add.zone(cx, cy, boxW, boxH);
    this.physics.add.existing(box);
    box.body.setAllowGravity(false);
    box.body.setSize(boxW, boxH);
    this.hitboxes.add(box);

    // Full clip length in update-frames (~30fps) + tiny slack
    const durSec = limb?.dur ?? (style === 'knockout' ? 0.28 : kind === 'z' ? 0.22 : 0.3);
    const ttl = Math.max(8, Math.ceil(durSec * 30) + 2);

    this.meleeAttacks.push({
      player: owner,
      owner,
      facing,
      kind,
      style,
      team,
      overlay: null,
      box,
      ox,
      oy,
      boxW,
      boxH,
      reach,
      ttl,
      untilPunchEnd: limb?.untilPunchEnd === true,
      hit: new Set(),
      followLimb,
    });
  }

  updateMeleeAttacks() {
    for (let i = this.meleeAttacks.length - 1; i >= 0; i -= 1) {
      const a = this.meleeAttacks[i];
      const p = a.owner || a.player;
      if (!p?.active) {
        a.overlay?.destroy();
        a.box?.destroy();
        this.meleeAttacks.splice(i, 1);
        continue;
      }

      // Track fist/foot for the whole swing
      a.facing = p.dir === 0 ? -1 : 1;
      if (a.followLimb && p.puppet) {
        const at = this.meleeLimbWorld(p, a.followLimb);
        if (at) {
          const reach = a.reach ?? 42;
          const cx = at.x + a.facing * reach;
          const cy = at.y;
          a.ox = cx - p.x - a.boxW / 2;
          a.oy = cy - p.y - a.boxH / 2;
        }
      }
      if (a.overlay?.active) a.overlay.setPosition(p.x, p.y);
      if (a.box?.body) {
        a.box.setPosition(p.x + a.ox + a.boxW / 2, p.y + a.oy + a.boxH / 2);
        a.box.body.setSize(a.boxW, a.boxH);
        a.box.body.updateFromGameObject();
      }

      const pad = this.meleeRect(a, p);
      const tryHit = (target, apply) => {
        // One registration per target for this swing
        if (!target?.active || a.hit.has(target)) return;
        if (pad && this.rectsOverlap(pad, target)) {
          a.hit.add(target);
          apply(target);
        }
      };

      const knockout = a.style === 'knockout';
      const dmg = this.meleeDamageFor(a.kind, a.style);
      // Short shove — impact is the crumple anim, not a rocket slide
      const kb = knockout ? 9 : a.kind === 'x' ? 6 : 4;
      const hitAt = () => {
        const limb = this.meleeLimbWorld(p, a.followLimb);
        return {
          x: limb?.x ?? p.x + a.facing * 50,
          y: limb?.y ?? p.y - 90,
        };
      };

      if (a.team === 'enemy') {
        tryHit(this.player, () => {
          const pt = hitAt();
          this.spawnHitImpact(pt.x, pt.y, a.facing, { heavy: knockout || a.kind === 'x' });
          this.hurtPlayer({
            facing: a.facing,
            knockback: kb,
            knockout,
          });
        });
      } else {
        this.kosari.getChildren().forEach((k) => tryHit(k, (t) => this.smashKosar(t)));
        this.crates.getChildren().forEach((c) =>
          tryHit(c, (t) => {
            const pt = hitAt();
            this.spawnHitImpact(pt.x, pt.y, a.facing, { heavy: false });
            t.hit?.(a.facing);
          }),
        );
        this.enemies.getChildren().forEach((e) =>
          tryHit(e, (t) => {
            const pt = hitAt();
            this.spawnHitImpact(pt.x, pt.y, a.facing, { heavy: knockout || a.kind === 'x' });
            t.hurt(dmg, {
              knockout,
              knockback: kb,
              facing: a.facing,
            });
          }),
        );
        this.bosses.getChildren().forEach((b) =>
          tryHit(b, (t) => {
            const pt = hitAt();
            this.spawnHitImpact(pt.x, pt.y, a.facing, { heavy: knockout });
            t.hurt(knockout ? 90 : a.kind === 'z' ? 55 : 40, {
              knockback: knockout ? 12 : 6,
              facing: a.facing,
            });
          }),
        );
      }

      // Expire after hit-check so the last contact frame still counts
      a.ttl -= 1;
      const punchOver = a.untilPunchEnd && !p.punching;
      if (a.ttl <= 0 || punchOver) {
        a.overlay?.destroy();
        a.box?.destroy();
        this.meleeAttacks.splice(i, 1);
      }
    }
  }

  tryFireWeapon(player) {
    const w = GameState.weaponChoose;
    if (w === 0) return;
    const dir = player.dir === 1 ? 1 : -1;
    const muzzle = player.getMuzzle?.() || { x: player.x + dir * 40, y: player.y - 100 };
    const muzzleX = muzzle.x;
    const muzzleY = muzzle.y;

    const flash = () => {
      const f = this.add
        .rectangle(muzzleX + dir * 8, muzzleY, 18, 8, 0xffee88)
        .setDepth(25);
      this.tweens.add({
        targets: f,
        alpha: 0,
        scaleX: 1.6,
        duration: 70,
        onComplete: () => f.destroy(),
      });
    };

    const kick = () => player.onFired?.();

    if (w === 1) {
      if (GameState.deserteaglebullets <= 0) return void this.sound.play('no_bulet');
      GameState.deserteaglebullets -= 1;
      player.fireCooldown = 12;
      // ~18 screen-widths/sec feel at 30fps step
      this.spawnBullet(muzzleX, muzzleY, dir, 'proj_de', 1100, 50, { scale: 0.45 });
      flash();
      kick();
      this.sound.play('DE_shoot', { volume: 0.5 });
    } else if (w === 2) {
      if (GameState.shotgunbullets <= 0) return void this.sound.play('no_bulet');
      GameState.shotgunbullets -= 1;
      player.fireCooldown = 18;
      for (let i = -2; i <= 2; i += 1) {
        this.spawnBullet(muzzleX, muzzleY + i * 4, dir, 'proj_pellet', 950, 28, {
          pellet: true,
          scale: 0.55,
          spreadY: i * 1.4 + (Math.random() - 0.5) * 0.7,
        });
      }
      flash();
      kick();
      this.sound.play('shotgun_shoot', { volume: 0.55 });
    } else if (w === 3) {
      if (GameState.ak47bullets <= 0) return void this.sound.play('no_bulet');
      GameState.ak47bullets -= 1;
      player.fireCooldown = 5;
      this.spawnBullet(muzzleX, muzzleY, dir, 'proj_ak', 1300, 32, { scale: 0.5 });
      flash();
      kick();
      this.sound.play('DE_shoot', { volume: 0.32 });
    } else if (w === 4) {
      if (GameState.rpg7bullets <= 0) return void this.sound.play('no_bulet');
      GameState.rpg7bullets -= 1;
      player.fireCooldown = 30;
      this.spawnBullet(muzzleX, muzzleY, dir, 'proj_rpg', 620, 120, {
        explode: true,
        scale: 0.7,
      });
      flash();
      kick();
      this.sound.play('rpg_shoot', { volume: 0.55 });
    }
  }

  /**
   * @param {number} speedPxSec horizontal speed in world px / second (scene ~30fps)
   */
  spawnBullet(x, y, dir, texKey, speedPxSec, damage, opts = {}) {
    const key = this.textures.exists(texKey) ? texKey : null;
    let bullet;
    if (key) {
      bullet = this.add.image(x, y, key).setDepth(22);
      bullet.setOrigin(0.5, 0.5);
      bullet.setScale(opts.scale ?? 1);
      if (dir < 0) bullet.setFlipX(true);
    } else {
      const w = opts.explode ? 22 : opts.pellet ? 10 : 14;
      const h = opts.explode ? 10 : opts.pellet ? 10 : 5;
      bullet = this.add.rectangle(x, y, w, h, opts.tint || 0xffe066).setDepth(22);
    }
    this.physics.add.existing(bullet);
    bullet.body.setAllowGravity(false);
    const bw = Math.max(8, bullet.displayWidth * 0.7);
    const bh = Math.max(4, bullet.displayHeight * 0.7);
    bullet.body.setSize(bw, bh);
    // Per-frame step at locked 30fps: px/frame = speed / 30
    bullet.vx = dir * (speedPxSec / 30);
    bullet.vy = opts.spreadY ?? (opts.pellet ? (Math.random() - 0.5) * 2.2 : 0);
    bullet.damage = damage;
    bullet.explode = !!opts.explode;
    bullet.pierce = !!opts.pierce;
    this.bullets.add(bullet);
    const life = opts.explode ? 1800 : 900;
    this.time.delayedCall(life, () => bullet.active && bullet.destroy());
  }

  tryThrowGrenade(player) {
    if (GameState.grenades <= 0) return;
    GameState.grenades -= 1;
    const dir = player.dir === 1 ? 1 : -1;
    const key =
      dir > 0 && this.textures.exists('grenade_spr_throw_r_0')
        ? 'grenade_spr_throw_r_0'
        : this.textures.exists('grenade_spr_throw_l_0')
          ? 'grenade_spr_throw_l_0'
          : 'nakovalna_0';
    const g = this.physics.add.sprite(player.x + 60, player.y + 50, key);
    g.setOrigin(0);
    g.body.setAllowGravity(false);
    g.setVelocity(dir * 220, -120);
    if (dir > 0 && this.anims.exists('grenade_r')) g.play('grenade_r');
    if (dir < 0 && this.anims.exists('grenade_l')) g.play('grenade_l');
    this.time.delayedCall(700, () => {
      if (!g.active) return;
      this.spawnExplosion(g.x, g.y);
      this.enemies.getChildren().forEach((e) => {
        if (e.active && Phaser.Math.Distance.Between(g.x, g.y, e.x, e.y) < 100) e.hurt(100);
      });
      this.bosses.getChildren().forEach((b) => {
        if (b.active && Phaser.Math.Distance.Between(g.x, g.y, b.x, b.y) < 120) b.hurt(150);
      });
      g.destroy();
    });
  }

  pushHud() {
    if (!this.lifeIcons) this.lifeIcons = [];
    const w = GameState.weaponChoose || 0;
    const names = { 0: 'КУКИ', 1: 'DE', 2: 'SG', 3: 'AK', 4: 'RPG' };

    if (this.hudMoney) this.hudMoney.setText(`$ ${GameState.moneyScore}`);
    if (this.hudScore) this.hudScore.setText(`SCORE ${GameState.score}`);
    if (this.hpBar) {
      this.hpBar.width = Math.max(0, (140 * GameState.health) / 100);
      this.hpBar.fillColor = GameState.health > 40 ? 0x3dcc66 : 0xcc3333;
    }

    if (this.hudWeaponList) {
      const lines = [`${w === 0 ? '› ' : '  '}КУКИ`];
      for (const id of GameState.ownedWeaponIds()) {
        const mark = w === id ? '› ' : '  ';
        lines.push(`${mark}${names[id]}  ${GameState.ammoFor(id)}`);
      }
      this.hudWeaponList.setText(lines.join('\n'));
    }
    if (this.hudGrenade) {
      this.hudGrenade.setText(GameState.grenades ? `G ×${GameState.grenades}` : '');
    }

    while (this.lifeIcons.length < GameState.lives) {
      const icon = this.add
        .image(8 + this.lifeIcons.length * 42, 6, 'lives_0')
        .setOrigin(0)
        .setScale(0.7);
      this.hudRoot?.add(icon);
      this.lifeIcons.push(icon);
    }
    while (this.lifeIcons.length > GameState.lives) {
      const icon = this.lifeIcons.pop();
      this.hudRoot?.remove(icon, true);
      icon?.destroy();
    }

    const boss = this.bosses?.getChildren?.().find((b) => b.active);
    if (this.bossHud) {
      if (boss) {
        this.bossHud.setVisible(true);
        this.bossHud.setText(`BOSS ${Math.max(0, Math.floor(boss.hp))}/${boss.maxHp}`);
      } else {
        this.bossHud.setVisible(false);
      }
    }

    this.onHud?.({
      lives: GameState.lives,
      health: GameState.health,
      score: GameState.score,
      money: GameState.moneyScore,
      weapon: names[w] || '',
    });
  }
}
