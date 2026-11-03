import Phaser from 'phaser';
import { GameState } from '../state/GameState.js';

/** GM player `q` — step-based movement + weapons. */
export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'sprite_stand2_0');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0, 0);
    this.body.setSize(56, 183);
    this.body.setOffset(37, 10);
    this.body.setCollideWorldBounds(true);
    this.body.setAllowGravity(false);

    this.dir = 1;
    this.run = 0;
    this.djump = 1;
    this.punching = false;
    this.vy = 0;
    this.groundY = 464;
    this.fireCooldown = 0;

    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keyZ = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyM = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyP = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.keyEsc = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.key0 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO);
    this.key1 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.key4 = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);

    this.weaponSprite = scene.add.image(x, y, 'pistol_r_0').setOrigin(0).setVisible(false).setDepth(5);
  }

  feetY() {
    return this.y + 193;
  }

  isOnFloor() {
    return this.feetY() >= this.groundY - 1 || this.body.blocked.down || this.body.touching.down;
  }

  beginPunch(kind) {
    if (this.punching || GameState.weaponChoose !== 0) return;
    this.punching = true;
    const facingLeft = this.dir === 0;
    // Body pose without limb — limb is a separate overlay (GM hand1/hand2 / sprite22/23)
    let bodyAnim = facingLeft ? 'punch_l' : 'punch_r';
    if (kind === 'x') bodyAnim = facingLeft ? 'punch_l2' : 'punch_r2';
    this.anims.play(bodyAnim, true);
    this.scene.sound.play(kind === 'z' ? 'udar' : 'punch', { volume: 0.5 });

    const facing = facingLeft ? -1 : 1;
    const limb =
      kind === 'z'
        ? facingLeft
          ? { tex: 'sprite23', anim: 'kick_l' }
          : { tex: 'sprite22', anim: 'kick_r' }
        : facingLeft
          ? { tex: 'hand2', anim: 'hand2' }
          : { tex: 'hand1', anim: 'hand1' };

    this.scene.spawnMeleeAttack(this, facing, kind, limb);

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.punching = false;
      this.setTexture(this.dir === 0 ? 'sprite_stand_0' : 'sprite_stand2_0');
    });
  }

  selectWeapon(id) {
    if (id === 0) {
      GameState.weaponChoose = 0;
      return;
    }
    if (id === 1 && GameState.deserteagle) {
      GameState.weaponChoose = 1;
      this.scene.sound.play('DE_reload', { volume: 0.5 });
    } else if (id === 2 && GameState.shotgunbought) {
      GameState.weaponChoose = 2;
      this.scene.sound.play('shotgun_reload', { volume: 0.5 });
    } else if (id === 3 && GameState.ak47bought) {
      GameState.weaponChoose = 3;
      this.scene.sound.play('DE_reload', { volume: 0.5 });
    } else if (id === 4 && GameState.rpg7bought) {
      GameState.weaponChoose = 4;
      this.scene.sound.play('shotgun_reload', { volume: 0.5 });
    } else {
      this.scene.sound.play('beep', { volume: 0.25 });
    }
  }

  updateWeaponGfx() {
    const w = GameState.weaponChoose;
    if (w === 0) {
      this.weaponSprite.setVisible(false);
      return;
    }
    const left = this.dir === 0;
    let key = left ? 'pistol_l_0' : 'pistol_r_0';
    if (w === 2) key = left ? 'shotgun_spr_l_0' : 'shotgun_spr_r_0';
    if (w === 3) key = left ? 'ak47_hand_sprL_0' : 'ak47_hand_sprR_0';
    if (w === 4) {
      key = left ? 'rpg7_spr_handL_0' : 'rpg7_spr_handR_0';
      if (!this.scene.textures.exists(key)) key = left ? 'ak47_hand_sprL_0' : 'ak47_hand_sprR_0';
    }
    if (!this.scene.textures.exists(key)) {
      this.weaponSprite.setVisible(false);
      return;
    }
    this.weaponSprite.setTexture(key).setPosition(this.x, this.y).setVisible(true);
  }

  step() {
    if (!this.active) return;
    if (this.fireCooldown > 0) this.fireCooldown -= 1;

    if (!this.isOnFloor()) {
      this.vy = Math.min(12, this.vy + 0.5);
    } else {
      if (this.vy > 0) this.vy = 0;
      this.djump = 1;
      this.y = this.groundY - 193;
    }

    let dx = 0;
    if (!this.punching) {
      if (this.cursors.left.isDown) {
        dx = -6.5;
        this.dir = 0;
        this.run = 1;
        this.anims.play('walk_left', true);
      } else if (this.cursors.right.isDown) {
        dx = 6.5;
        this.dir = 1;
        this.run = 1;
        this.anims.play('walk_right', true);
      } else {
        this.run = 0;
        const punchingAnim = String(this.anims.currentAnim?.key || '').startsWith('punch');
        if (!punchingAnim) {
          this.anims.stop();
          this.setTexture(this.dir === 0 ? 'sprite_stand_0' : 'sprite_stand2_0');
        }
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      if (this.isOnFloor()) this.vy = this.run ? -10 : -8;
      else if (this.djump) {
        this.vy = -6;
        this.djump = 0;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyZ)) this.beginPunch('z');
    if (Phaser.Input.Keyboard.JustDown(this.keyX)) this.beginPunch('x');

    if (Phaser.Input.Keyboard.JustDown(this.key0)) this.selectWeapon(0);
    if (Phaser.Input.Keyboard.JustDown(this.key1)) this.selectWeapon(1);
    if (Phaser.Input.Keyboard.JustDown(this.key2)) this.selectWeapon(2);
    if (Phaser.Input.Keyboard.JustDown(this.key3)) this.selectWeapon(3);
    if (Phaser.Input.Keyboard.JustDown(this.key4)) this.selectWeapon(4);

    if (Phaser.Input.Keyboard.JustDown(this.keyA) && this.fireCooldown <= 0) {
      this.scene.tryFireWeapon(this);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyS)) {
      this.scene.tryThrowGrenade(this);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyM)) {
      GameState.musicPlay = !GameState.musicPlay;
      if (!GameState.musicPlay) this.scene.sound.stopByKey('game');
      else this.scene.sound.play('game', { loop: true, volume: 0.45 });
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyP)) {
      this.scene.pausedGame = !this.scene.pausedGame;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
      this.scene.sound.stopAll();
      this.scene.scene.start('Menu');
    }

    this.x = Phaser.Math.Clamp(this.x + dx, -20, 640 - 100);
    this.y += this.vy;
    if (this.feetY() > this.groundY) {
      this.y = this.groundY - 193;
      this.vy = 0;
    }
    this.body.reset(this.x, this.y);
    this.updateWeaponGfx();
  }

  destroy(fromScene) {
    this.weaponSprite?.destroy();
    super.destroy(fromScene);
  }
}
