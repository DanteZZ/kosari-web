import Phaser from 'phaser';

const SPRITES = {
  sprite_stand: 1,
  sprite_stand2: 1,
  sprite_left: 12,
  sprite_right: 12,
  udar_l: 10,
  udar_r: 10,
  udar_l2: 10,
  udar_r2: 10,
  kosar: 1,
  kosar_die: 25,
  '5 kosarei': 1,
  '10 kosarei': 1,
  lives: 1,
  spr_wall: 1,
  sprite_new_game: 1,
  sprite_new_game_ch: 1,
  sprite_exit: 1,
  sprite_exit_ch: 1,
  sprite_highscore: 1,
  sprite_highscore_ch: 1,
  achievements: 1,
  achievements_ch: 1,
  arrow_back: 1,
  arrow_ch: 1,
  nakovalna: 1,
  '1up': 1,
  hand1: 8,
  hand2: 8,
  sprite22: 7,
  sprite23: 8,
  nikita: 10,
  buiniy: 12,
  dance: 66,
  credits: 1,
  pistol_r: 1,
  pistol_l: 1,
  shotgun_spr_r: 1,
  shotgun_spr_l: 1,
  ak47_hand_sprR: 1,
  ak47_hand_sprL: 1,
  bullet_deserteagle_r: 1,
  bullet_deserteagle_l: 1,
  ak47_bulletR: 1,
  ak47_bulletL: 1,
  gilza_r: 10,
  gilza_l: 10,
  grenade_spr_throw_r: 20,
  grenade_spr_throw_l: 20,
  oboima: 1,
  blood: 10,
  blood_pist_r: 20,
  blood_pist_l: 20,
  headshot: 1,
  explosion: 17,
  boss1_stand: 1,
  boss1_go: 1,
  boss_throw: 3,
  boss_lives0: 1,
  boss_lives1: 1,
  boss_lives2: 1,
  boss_lives3: 1,
  boss_floor: 1,
  rain: 1,
  thunder: 5,
  dirig: 50,
  dirig_bomb: 52,
  rpg7_spr_handR: 1,
  rpg7_spr_handL: 1,
  shotgun_bullet: 1,
  die_super: 1,
  die_s: 1,
  die_kul_s: 15,
  die_noge_s: 15,
  autors: 1,
  autors_ch: 1,
  load: 1,
  save: 1,
  load_ch: 1,
  save_ch: 1,
};

const BACKGROUNDS = [
  'menu',
  'background4',
  'background9',
  'shop',
  'loading',
  'danger',
  'highscores',
  'authors_bck',
  'intro_1',
];

const SOUNDS = {
  game: 'mp3',
  menu1: 'mp3',
  menu2: 'mp3',
  menu3: 'mp3',
  thunder: 'mp3',
  cash: 'wav',
  punch: 'WAV',
  beep: 'wav',
  hit: 'wav',
  udar: 'WAV',
  warning: 'wav',
  rain: 'wav',
  DE_shoot: 'wav',
  DE_reload: 'wav',
  no_bulet: 'wav',
  hulitakmalo: 'wav',
  credits: 'mp3',
  shotgun_shoot: 'wav',
  shotgun_reload: 'wav',
  rpg_shoot: 'wav',
  explosion: 'wav',
  explosion2: 'wav',
  boss: 'mp3',
  urodblya: 'wav',
  '-life': 'wav',
  '+life': 'wav',
  dirigabb_poyav: 'wav',
  dirigabb_sound: 'wav',
  superudar: 'WAV',
  save_load: 'wav',
};

function spriteUrl(name, i) {
  return `assets/sprites/${name.split('/').map(encodeURIComponent).join('/')}/${i}.png`;
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2 - 36, 'КОСАРИ v3.0', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '28px',
        color: '#f2f2f2',
      })
      .setOrigin(0.5);
    const bar = this.add.rectangle(width / 2 - 158, height / 2, 4, 12, 0xc8ff4a).setOrigin(0, 0.5);
    this.add.rectangle(width / 2, height / 2, 320, 18, 0x222222);
    this.load.on('progress', (value) => {
      bar.width = 4 + 312 * value;
    });

    this.load.on('loaderror', (file) => {
      console.warn('Missing asset', file?.key, file?.url);
    });

    for (const [name, frames] of Object.entries(SPRITES)) {
      for (let i = 0; i < frames; i += 1) {
        this.load.image(`${name}_${i}`, spriteUrl(name, i));
      }
    }
    for (const bg of BACKGROUNDS) {
      this.load.image(`bg_${bg}`, `assets/bg/${bg}.png`);
    }
    for (const [name, ext] of Object.entries(SOUNDS)) {
      this.load.audio(name, `assets/sounds/${name}.${ext}`);
    }
  }

  create() {
    this.createAnimations();
    this.scene.start('Menu');
  }

  createAnimations() {
    const mk = (key, sprite, frameCount, frameRate, repeat = -1) => {
      if (this.anims.exists(key)) return;
      const frames = [];
      for (let i = 0; i < frameCount; i += 1) {
        if (this.textures.exists(`${sprite}_${i}`)) frames.push({ key: `${sprite}_${i}` });
      }
      if (!frames.length) return;
      this.anims.create({ key, frames, frameRate, repeat });
    };

    mk('walk_left', 'sprite_left', 12, 12);
    mk('walk_right', 'sprite_right', 12, 12);
    mk('punch_l', 'udar_l', 10, 20, 0);
    mk('punch_r', 'udar_r', 10, 20, 0);
    mk('punch_l2', 'udar_l2', 10, 20, 0);
    mk('punch_r2', 'udar_r2', 10, 20, 0);
    mk('kosar_die', 'kosar_die', 25, 18, 0);
    mk('hand1', 'hand1', 8, 16, 0);
    mk('hand2', 'hand2', 8, 16, 0);
    mk('kick_r', 'sprite22', 7, 16, 0);
    mk('kick_l', 'sprite23', 8, 16, 0);
    mk('nikita_walk', 'nikita', 10, 10);
    mk('buiniy_walk', 'buiniy', 12, 10);
    mk('dance', 'dance', 66, 10); // credits room speed 10
    mk('dirig_fly', 'dirig', 50, 12);
    mk('dirig_bomb_fall', 'dirig_bomb', 52, 12);
    mk('blood_anim', 'blood', 10, 14, 0);
    mk('blood_pist_r', 'blood_pist_r', 20, 16, 0);
    mk('blood_pist_l', 'blood_pist_l', 20, 16, 0);
    mk('grenade_r', 'grenade_spr_throw_r', 20, 14, 0);
    mk('grenade_l', 'grenade_spr_throw_l', 20, 14, 0);
    mk('explosion_anim', 'explosion', 17, 16, 0);
    mk('thunder_flash', 'thunder', 5, 12, 0);
  }
}
