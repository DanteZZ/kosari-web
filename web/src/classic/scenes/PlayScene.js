import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';
import { Player } from '../objects/Player.js';
import { Kosar } from '../objects/Kosar.js';
import { Enemy } from '../objects/Enemy.js';
import { Boss } from '../objects/Boss.js';

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('Play');
  }

  create() {
    this.pausedGame = false;
    this.gameOverStarted = false;
    this.farBg = this.add.tileSprite(0, 0, 640, 480, 'bg_background4').setOrigin(0);
    this.nearBg = this.add.image(0, 0, 'bg_background9').setOrigin(0);

    this.ground = this.physics.add.staticGroup();
    for (let x = 0; x < 640; x += 16) {
      const tile = this.ground.create(x, 464, 'spr_wall_0');
      tile.setOrigin(0, 0).refreshBody();
      tile.setVisible(false);
    }

    this.player = new Player(this, 208, 256);
    this.player.setDepth(10);
    this.physics.add.collider(this.player, this.ground);

    this.kosari = this.add.group();
    this.hitboxes = this.physics.add.group();
    this.meleeAttacks = [];
    this.anvils = this.add.group();
    this.bullets = this.physics.add.group();
    this.enemies = this.add.group();
    this.bosses = this.add.group();
    this.pickups = this.add.group();
    this.effects = this.add.group();
    this.iFrames = 0;
    this.bossSpawned = { 1: false, 2: false, 3: false };
    this.rainOn = false;
    this.rainTimer = 5000; // ~ like alarm 11 path
    this.dirigTimer = 900;

    if (GameState.musicPlay) {
      this.sound.stopAll();
      this.sound.play('game', { loop: true, volume: 0.45 });
    }

    this.scoreText = this.add
      .text(72, 3, '', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '16px',
        color: '#000000',
      })
      .setDepth(1000);
    this.add.rectangle(0, 25, 69, 5, 0x333333).setOrigin(0).setDepth(1000);
    this.healthBar = this.add.rectangle(0, 25, 69, 5, 0x22cc44).setOrigin(0).setDepth(1001);
    this.ammoText = this.add
      .text(420, 8, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '13px',
        color: '#111111',
        backgroundColor: '#ffffff88',
        padding: { x: 4, y: 2 },
      })
      .setDepth(1000);
    this.bossHud = this.add
      .text(200, 40, '', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '14px',
        color: '#aa0000',
        backgroundColor: '#ffffff66',
        padding: { x: 4, y: 2 },
      })
      .setDepth(1000)
      .setVisible(false);
    this.pauseText = this.add
      .text(320, 220, 'Пауза. Enter — продолжить', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setDepth(3000)
      .setVisible(false);

    this.lifeIcons = [];
    this.refreshHud();

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.pausedGame) this.pausedGame = false;
    });

    this.events.on('shutdown', () => {
      this.sound.stopByKey('game');
      this.sound.stopByKey('rain');
      this.sound.stopByKey('boss');
      this.sound.stopByKey('dirigabb_sound');
    });
  }

  update() {
    this.pauseText.setVisible(!!this.pausedGame);
    if (this.pausedGame || this.gameOverStarted) return;

    this.farBg.tilePositionX += 1;
    this.player.step();
    this.updateMeleeAttacks();
    if (this.iFrames > 0) this.iFrames -= 1;

    this.kosari.getChildren().forEach((k) => k.active && k.step());
    this.enemies.getChildren().forEach((e) => e.active && e.step());
    this.bosses.getChildren().forEach((b) => b.active && b.step());

    this.anvils.getChildren().forEach((a) => {
      if (!a.active) return;
      a.y += a.fallSpeed || 7;
      a.body?.reset(a.x, a.y);
      if (a.y > 520) a.destroy();
      else if (this.rectsOverlap(this.player, a)) this.hitAnvil(this.player, a);
    });

    this.pickups.getChildren().forEach((p) => {
      if (!p.active) return;
      p.y += 4;
      p.body?.reset(p.x, p.y);
      if (p.y > 500) p.destroy();
      else if (this.rectsOverlap(this.player, p)) this.collectPickup(p);
    });

    this.kosari.getChildren().forEach((k) => {
      if (!k.active) return;
      if (this.rectsOverlap(this.player, k)) this.collectKosar(this.player, k);
      if (k.y + k.height >= 464) k.destroy();
    });

    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      if (this.iFrames <= 0 && this.rectsOverlap(this.player, e)) this.hurtPlayer();
    });

    this.bosses.getChildren().forEach((b) => {
      if (!b.active) return;
      if (this.iFrames <= 0 && this.rectsOverlap(this.player, b)) this.hurtPlayer();
    });

    this.bullets.getChildren().forEach((b) => {
      if (!b.active) return;
      this.kosari.getChildren().forEach((k) => {
        if (k.active && this.rectsOverlap(b, k)) {
          this.smashKosar(k);
          if (!b.pierce) b.destroy();
        }
      });
      this.enemies.getChildren().forEach((e) => {
        if (e.active && this.rectsOverlap(b, e)) {
          e.hurt(b.damage || 50);
          if (!b.pierce) b.destroy();
        }
      });
      this.bosses.getChildren().forEach((boss) => {
        if (boss.active && this.rectsOverlap(b, boss)) {
          boss.hurt(b.damage || 50);
          if (b.explode) this.spawnExplosion(b.x, b.y);
          if (!b.pierce) b.destroy();
        }
      });
    });

    // Spawner
    if (Phaser.Math.Between(1, 30) === 1) this.spawnKosar(1);
    if (GameState.score >= 50_000 && Phaser.Math.Between(1, 90) === 1) this.spawnKosar(5);
    if (GameState.score >= 1_000_000 && Phaser.Math.Between(1, 70) === 1) this.spawnKosar(5);

    if (GameState.score >= 500_000 && Phaser.Math.Between(1, 100) === 1) this.spawnAnvil();
    else if (GameState.score >= 350_000 && Phaser.Math.Between(1, 120) === 1) this.spawnAnvil();
    else if (GameState.score >= 150_000 && Phaser.Math.Between(1, 150) === 1) this.spawnAnvil();

    if (GameState.deserteagle && Phaser.Math.Between(1, 1300) === 1) this.spawnAmmo();

    const nikitas = this.enemies.getChildren().filter((e) => e.active && e.kind === 'nikita').length;
    const buinies = this.enemies.getChildren().filter((e) => e.active && e.kind === 'buiniy').length;
    if (GameState.score >= 9000 && nikitas < 3 && Phaser.Math.Between(1, 100) === 1) {
      this.spawnEnemy('nikita');
    }
    if (GameState.score >= 49000 && buinies < 3 && Phaser.Math.Between(1, 100) === 1) {
      this.spawnEnemy('buiniy');
    }

    // Boss thresholds (approximate from original progression)
    if (!this.bossSpawned[1] && GameState.score >= 200000 && this.bosses.countActive() === 0) {
      this.spawnBoss(1);
    }
    if (!this.bossSpawned[2] && GameState.score >= 500000 && this.bosses.countActive() === 0) {
      this.spawnBoss(2);
    }
    if (!this.bossSpawned[3] && GameState.score >= 1000000 && this.bosses.countActive() === 0) {
      this.spawnBoss(3);
    }

    // Rain alarms (~5000 / 13000 / 20000 steps) — simplified periodic
    this.rainTimer -= 1;
    if (this.rainTimer <= 0) {
      this.rainTimer = Phaser.Math.Between(4000, 8000);
      this.triggerRain();
    }

    this.dirigTimer -= 1;
    if (this.dirigTimer <= 0 && GameState.score >= 300000) {
      this.dirigTimer = Phaser.Math.Between(1200, 2000);
      this.spawnDirigible();
    }

    this.refreshHud();

    if (GameState.lives <= 0) {
      this.beginGameOver();
    }
  }

  beginGameOver() {
    if (this.gameOverStarted) return;
    this.gameOverStarted = true;
    this.player.active = false;
    this.sound.stopByKey('game');
    this.sound.stopByKey('rain');
    this.sound.stopByKey('boss');
    this.sound.stopByKey('dirigabb_sound');
    GameState.livesDoubler = 0;
    // Original: hulitakmalo plays inside highscore show flow
    this.scene.stop('Menu');
    this.scene.start('Highscore', { mode: 'submit', bg: 'bg_background4' });
  }

  rectsOverlap(a, b) {
    const ab = a.body;
    const bb = b.body;
    if (ab && bb) return Phaser.Geom.Intersects.RectangleToRectangle(ab, bb);
    return Phaser.Geom.Intersects.RectangleToRectangle(a.getBounds(), b.getBounds());
  }

  spawnKosar(pack = 1) {
    const x = Phaser.Math.Between(0, 560);
    this.kosari.add(new Kosar(this, x, -50, pack));
  }

  spawnAnvil() {
    const x = Phaser.Math.Between(20, 520);
    const a = this.physics.add.image(x, -100, 'nakovalna_0');
    a.setOrigin(0.55, 0.45);
    a.body.setAllowGravity(false);
    a.fallSpeed = 7;
    this.anvils.add(a);
  }

  spawnAmmo() {
    const x = Phaser.Math.Between(20, 580);
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
    }
    p.destroy();
  }

  spawnEnemy(kind) {
    const fromLeft = kind === 'buiniy';
    const x = fromLeft ? -80 : 640;
    const y = 464 - 180;
    this.enemies.add(new Enemy(this, x, y, kind));
  }

  spawnBoss(tier) {
    this.bossSpawned[tier] = true;
    this.sound.stopByKey('game');
    if (GameState.musicPlay) this.sound.play('boss', { loop: true, volume: 0.5 });
    const b = new Boss(this, 480, 464 - 200, tier);
    this.bosses.add(b);
    this.bossHud.setVisible(true);
  }

  onBossDefeated() {
    if (this.bosses.countActive() === 0) {
      this.sound.stopByKey('boss');
      if (GameState.musicPlay) this.sound.play('game', { loop: true, volume: 0.45 });
      this.bossHud.setVisible(false);
    }
  }

  spawnBossThrow(boss) {
    const proj = this.physics.add.image(boss.x, boss.y + 40, 'nakovalna_0');
    proj.setOrigin(0.5).setScale(0.7);
    proj.body.setAllowGravity(false);
    proj.fallSpeed = 0;
    const dx = this.player.x - boss.x;
    proj.setVelocity(Math.sign(dx || -1) * 160, 120);
    this.anvils.add(proj);
  }

  triggerRain() {
    if (this.rainOn) return;
    this.rainOn = true;
    if (GameState.musicPlay) this.sound.play('rain', { loop: true, volume: 0.35 });
    if (this.textures.exists('rain_0')) {
      const r = this.add.tileSprite(0, 0, 640, 480, 'rain_0').setOrigin(0).setAlpha(0.55).setDepth(50);
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
      const t = this.add.image(Phaser.Math.Between(0, 500), 0, 'thunder_0').setOrigin(0).setDepth(51);
      this.sound.play('thunder', { volume: 0.5 });
      this.time.delayedCall(400, () => t.destroy());
    }
  }

  spawnDirigible() {
    if (!this.textures.exists('dirig_0')) return;
    const d = this.add.sprite(-100, 40, 'dirig_0').setOrigin(0).setDepth(40);
    if (this.anims.exists('dirig_fly')) d.play('dirig_fly');
    this.sound.play('dirigabb_poyav', { volume: 0.5 });
    if (GameState.musicPlay) this.sound.play('dirigabb_sound', { loop: true, volume: 0.25 });
    this.tweens.add({
      targets: d,
      x: 700,
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
    const bomb = this.physics.add.image(x, y, key);
    bomb.setOrigin(0.5);
    bomb.body.setAllowGravity(false);
    bomb.fallSpeed = 6;
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
    if (GameState.musicPlay) this.sound.play('cash', { volume: 0.55 });
    GameState.score += kosar.value;
    GameState.moneyScore += kosar.value;
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
    GameState.score += bonus;
    GameState.moneyScore += bonus;
    this.sound.play('hit', { volume: 0.4 });
  }

  hitAnvil(_player, anvil) {
    if (!anvil.active) return;
    anvil.destroy();
    this.hurtPlayer();
  }

  hurtPlayer() {
    if (this.iFrames > 0 || this.gameOverStarted) return;
    GameState.lives -= 1;
    this.iFrames = 45;
    this.sound.play('-life', { volume: 0.55 });
    this.sound.play('urodblya', { volume: 0.4 });
    this.cameras.main.shake(120, 0.01);
    this.player.setTint(0xff4444);
    this.time.delayedCall(200, () => this.player.clearTint());
  }

  /**
   * GM melee: body uses udar_* (no limb), overlay is hand1/hand2 (punch) or sprite22/23 (kick).
   * Hitbox stays active for the animation and is checked every frame.
   */
  spawnMeleeAttack(player, facing, kind, limb) {
    const limbKey = `${limb.tex}_0`;
    let overlay = null;
    if (this.textures.exists(limbKey)) {
      overlay = this.add.sprite(player.x, player.y, limbKey).setOrigin(0).setDepth((player.depth || 10) + 2);
      if (this.anims.exists(limb.anim)) overlay.play(limb.anim);
      overlay.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => overlay.destroy());
    }

    // Kick hits lower/forward; punch hits mid torso/forward
    const boxW = kind === 'z' ? 55 : 50;
    const boxH = kind === 'z' ? 70 : 55;
    const ox = facing > 0 ? 70 : 10;
    const oy = kind === 'z' ? 110 : 70;
    const box = this.add.zone(player.x + ox + boxW / 2, player.y + oy + boxH / 2, boxW, boxH);
    this.physics.add.existing(box);
    box.body.setAllowGravity(false);
    this.hitboxes.add(box);

    const attack = {
      player,
      facing,
      kind,
      overlay,
      box,
      ox,
      oy,
      boxW,
      boxH,
      ttl: kind === 'z' ? 14 : 16,
      hit: new Set(),
    };
    this.meleeAttacks.push(attack);
  }

  updateMeleeAttacks() {
    for (let i = this.meleeAttacks.length - 1; i >= 0; i -= 1) {
      const a = this.meleeAttacks[i];
      a.ttl -= 1;
      const p = a.player;
      if (!p?.active) {
        a.overlay?.destroy();
        a.box?.destroy();
        this.meleeAttacks.splice(i, 1);
        continue;
      }
      if (a.overlay?.active) a.overlay.setPosition(p.x, p.y);
      if (a.box?.body) {
        a.box.setPosition(p.x + a.ox + a.boxW / 2, p.y + a.oy + a.boxH / 2);
        a.box.body.updateFromGameObject();
      }

      const tryHit = (target, apply) => {
        if (!target?.active || a.hit.has(target)) return;
        if (a.box && this.rectsOverlap(a.box, target)) {
          a.hit.add(target);
          apply(target);
        }
      };

      this.kosari.getChildren().forEach((k) => tryHit(k, (t) => this.smashKosar(t)));
      this.enemies.getChildren().forEach((e) => tryHit(e, (t) => t.hurt(100)));
      this.bosses.getChildren().forEach((b) => tryHit(b, (t) => t.hurt(a.kind === 'z' ? 55 : 40)));

      if (a.ttl <= 0) {
        a.overlay?.destroy();
        a.box?.destroy();
        this.meleeAttacks.splice(i, 1);
      }
    }
  }

  /** @deprecated kept for any old callers */
  spawnPunchHitbox(player, facing) {
    this.spawnMeleeAttack(player, facing, 'x', {
      tex: facing > 0 ? 'hand1' : 'hand2',
      anim: facing > 0 ? 'hand1' : 'hand2',
    });
  }

  tryFireWeapon(player) {
    const w = GameState.weaponChoose;
    if (w === 0) return;
    const dir = player.dir === 1 ? 1 : -1;
    const muzzleX = player.x + (dir > 0 ? 100 : 10);
    const muzzleY = player.y + 90;

    if (w === 1) {
      if (GameState.deserteaglebullets <= 0) return void this.sound.play('no_bulet');
      GameState.deserteaglebullets -= 1;
      player.fireCooldown = 8;
      this.spawnBullet(muzzleX, muzzleY, dir, 'bullet_deserteagle_r_0', 'bullet_deserteagle_l_0', 560, 50);
      this.sound.play('DE_shoot', { volume: 0.45 });
    } else if (w === 2) {
      if (GameState.shotgunbullets <= 0) return void this.sound.play('no_bulet');
      GameState.shotgunbullets -= 1;
      player.fireCooldown = 18;
      for (let i = -2; i <= 2; i += 1) {
        this.spawnBullet(muzzleX, muzzleY + i * 6, dir, 'spr_wall_0', 'spr_wall_0', 480, 35, { tint: 0xffaa33 });
      }
      this.sound.play('shotgun_shoot', { volume: 0.5 });
    } else if (w === 3) {
      if (GameState.ak47bullets <= 0) return void this.sound.play('no_bulet');
      GameState.ak47bullets -= 1;
      player.fireCooldown = 4;
      this.spawnBullet(muzzleX, muzzleY, dir, 'ak47_bulletR_0', 'ak47_bulletL_0', 620, 35);
      this.sound.play('DE_shoot', { volume: 0.3 });
    } else if (w === 4) {
      if (GameState.rpg7bullets <= 0) return void this.sound.play('no_bulet');
      GameState.rpg7bullets -= 1;
      player.fireCooldown = 30;
      this.spawnBullet(muzzleX, muzzleY, dir, 'ak47_bulletR_0', 'ak47_bulletL_0', 380, 120, {
        explode: true,
        scale: 1.4,
      });
      this.sound.play('rpg_shoot', { volume: 0.55 });
    }
  }

  spawnBullet(x, y, dir, texR, texL, speed, damage, opts = {}) {
    const tex = dir > 0 ? texR : texL;
    const key = this.textures.exists(tex) ? tex : 'spr_wall_0';
    const bullet = this.physics.add.image(x, y, key);
    bullet.setOrigin(0);
    if (opts.tint) bullet.setTint(opts.tint);
    if (opts.scale) bullet.setScale(opts.scale);
    if (key === 'spr_wall_0') bullet.setDisplaySize(14, 4).setTint(opts.tint || 0xffcc33);
    bullet.body.setAllowGravity(false);
    bullet.setVelocityX(dir * speed);
    bullet.damage = damage;
    bullet.explode = !!opts.explode;
    bullet.pierce = !!opts.pierce;
    this.bullets.add(bullet);
    this.time.delayedCall(900, () => bullet.active && bullet.destroy());
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

  refreshHud() {
    this.scoreText.setText(`: ${GameState.score}`);
    this.healthBar.width = Math.max(0, (69 * GameState.health) / 100);
    this.healthBar.fillColor = GameState.health > 40 ? 0x22cc44 : 0xcc3333;

    const w = GameState.weaponChoose;
    const labels = {
      0: '',
      1: `DE:${GameState.deserteaglebullets}`,
      2: `SG:${GameState.shotgunbullets}`,
      3: `AK:${GameState.ak47bullets}`,
      4: `RPG:${GameState.rpg7bullets}`,
    };
    const extra = GameState.grenades ? `  G:${GameState.grenades}` : '';
    this.ammoText.setText((labels[w] || '') + extra);
    this.ammoText.setVisible(!!this.ammoText.text);

    const boss = this.bosses.getChildren().find((b) => b.active);
    if (boss) {
      this.bossHud.setVisible(true);
      this.bossHud.setText(`BOSS HP ${Math.max(0, Math.floor(boss.hp))}/${boss.maxHp}`);
    }

    while (this.lifeIcons.length < GameState.lives) {
      const icon = this.add
        .image(this.lifeIcons.length * 50, 40, 'lives_0')
        .setOrigin(0)
        .setDepth(1000);
      this.lifeIcons.push(icon);
    }
    while (this.lifeIcons.length > GameState.lives) {
      this.lifeIcons.pop().destroy();
    }
  }
}
