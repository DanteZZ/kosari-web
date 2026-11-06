import { PART_FILES } from './player/parts.js';
import { WEAPON_DEFS } from './player/weapons.js';
import { listEnemyPartLoads } from './enemies/parts.js';

export const SPRITES = {
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
  nakovalna: 1,
  '1up': 1,
  hand1: 8,
  hand2: 8,
  sprite22: 7,
  sprite23: 8,
  nikita: 10,
  buiniy: 12,
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
  povar: 1,
  povar_rev: 1,
  povar_vilka: 46,
  povar_skorovodka: 5,
  kastrule: 20,
  borsch: 20,
  little_nakovalnya: 10,
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
};

export const SOUNDS = {
  game: 'mp3',
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
  thunder: 'mp3',
  credits: 'mp3',
  eto_vlad_borsh: 'wav',
  'BLYA!!!': 'wav',
  blya: 'wav',
  poreshau: 'wav',
  haa: 'wav',
  haha2: 'wav',
  mmm: 'wav',
  pidarblya: 'wav',
  poovar: 'wav',
  professiya_: 'wav',
};

function spriteUrl(name, i) {
  return `assets/sprites/${name.split('/').map(encodeURIComponent).join('/')}/${i}.png`;
}

/** Painted world pieces in assets/world/sprites (see brawl/world/ForestWorld.js). */
export const WORLD_PARTS = [
  'birch_1', 'birch_2', 'birch_3', 'birch_far', 'bush_1', 'bush_2', 'cloud_1', 'cloud_2',
  'flowers', 'fog', 'ground', 'hill', 'path', 'pine_1', 'pine_2', 'road', 'road_edge',
  'rock_1', 'stump',
];

export function preloadGameAssets(scene) {
  for (const [name, frames] of Object.entries(SPRITES)) {
    for (let i = 0; i < frames; i += 1) {
      scene.load.image(`${name}_${i}`, spriteUrl(name, i));
    }
  }
  for (const [name, ext] of Object.entries(SOUNDS)) {
    scene.load.audio(name, `assets/sounds/${name}.${ext}`);
  }
  scene.load.image('svg_sky', 'assets/svg/sky.svg');
  scene.load.image('svg_hills', 'assets/svg/hills.svg');
  scene.load.image('svg_grass', 'assets/svg/grass.svg');

  // Multi-layer world from sprites/ (cache-bust when art changes)
  const WV = 'hills5';
  scene.load.image('layer_clouds', `assets/world/layers/clouds/clouds.png?v=${WV}`);
  scene.load.image('layer_far', `assets/world/layers/far.png?v=${WV}`);
  scene.load.image('layer_mid', `assets/world/layers/mid.png?v=${WV}`);
  scene.load.image('layer_fog', `assets/world/layers/fog.png?v=${WV}`);
  scene.load.image('layer_world', `assets/world/layers/world.png?v=${WV}`);
  scene.load.image('layer_grass', `assets/world/layers/grass.png?v=${WV}`);

  // Loose painted world parts — the brawl core assembles the forest at runtime
  const WP = 'wp1';
  for (const name of WORLD_PARTS) {
    scene.load.image(`w_${name}`, `assets/world/sprites/${name}.png?v=${WP}`);
  }

  // Side-view gun sprites for bone attach (cache-bust on art tweaks)
  const WPN_V = 'wpn8';
  for (const def of Object.values(WEAPON_DEFS)) {
    scene.load.image(def.key, `assets/weapons/${def.file}?v=${WPN_V}`);
  }

  // Projectiles (cache-bust)
  const PROJ_V = 'proj1';
  scene.load.image('proj_de', `assets/weapons/projectiles/bullet_de.png?v=${PROJ_V}`);
  scene.load.image('proj_pellet', `assets/weapons/projectiles/bullet_pellet.png?v=${PROJ_V}`);
  scene.load.image('proj_ak', `assets/weapons/projectiles/bullet_ak.png?v=${PROJ_V}`);
  scene.load.image('proj_rpg', `assets/weapons/projectiles/rocket_rpg.png?v=${PROJ_V}`);

  for (const [key, file] of Object.entries(PART_FILES)) {
    scene.load.image(`player_${key}`, `assets/player/parts/${file}`);
  }

  // Enemy / boss bone-puppet limbs (cache-bust when cuts change)
  const EV = 'parts5';
  for (const { key, url } of listEnemyPartLoads()) {
    scene.load.image(key, `${url}?v=${EV}`);
  }
}

export function createGameAnimations(scene) {
  const mk = (key, sprite, frameCount, frameRate, repeat = -1) => {
    if (scene.anims.exists(key)) return;
    const frames = [];
    for (let i = 0; i < frameCount; i += 1) {
      if (scene.textures.exists(`${sprite}_${i}`)) frames.push({ key: `${sprite}_${i}` });
    }
    if (!frames.length) return;
    scene.anims.create({ key, frames, frameRate, repeat });
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
  mk('dirig_fly', 'dirig', 50, 12);
  mk('dirig_bomb_fall', 'dirig_bomb', 52, 12);
  mk('blood_anim', 'blood', 10, 14, 0);
  mk('blood_pist_r', 'blood_pist_r', 20, 16, 0);
  mk('blood_pist_l', 'blood_pist_l', 20, 16, 0);
  mk('grenade_r', 'grenade_spr_throw_r', 20, 14, 0);
  mk('grenade_l', 'grenade_spr_throw_l', 20, 14, 0);
  mk('explosion_anim', 'explosion', 17, 16, 0);
  mk('kastrule_spin', 'kastrule', 20, 24);
  mk('skovorodka_spin', 'povar_skorovodka', 5, 16);
  mk('borsch_spin', 'borsch', 20, 20);
  mk('bomb_fuse', 'boss_throw', 3, 12);
  mk('thunder_flash', 'thunder', 5, 12, 0);
}
