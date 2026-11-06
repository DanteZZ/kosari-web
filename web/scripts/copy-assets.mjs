import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const srcSprites = path.join(root, 'kosari_src', 'Sprites');
const srcBg = path.join(root, 'kosari_src', 'Backgrounds');
const srcSnd = path.join(root, 'kosari_src', 'Sounds');
const out = path.join(root, 'web', 'public', 'classic', 'assets');

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copySprite(name) {
  const dest = path.join(out, 'sprites', name);
  ensure(dest);
  let dir = path.join(srcSprites, `${name}.images`);
  if (!fs.existsSync(dir)) {
    const match = fs.readdirSync(srcSprites).find((d) => d.startsWith(name) && d.endsWith('.images'));
    if (!match) return false;
    dir = path.join(srcSprites, match);
  }
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    const m = f.match(/image (\d+)\.png/);
    const outName = m ? `${m[1]}.png` : f;
    fs.copyFileSync(path.join(dir, f), path.join(dest, outName));
  }
  return true;
}

function copyBg(name) {
  const from = path.join(srcBg, `${name}.png`);
  if (!fs.existsSync(from)) return false;
  ensure(path.join(out, 'bg'));
  fs.copyFileSync(from, path.join(out, 'bg', `${name}.png`));
  return true;
}

function copySound(name) {
  ensure(path.join(out, 'sounds'));
  if (!fs.existsSync(srcSnd)) return false;
  const file = fs.readdirSync(srcSnd).find((f) => f === `${name}.wav` || f === `${name}.WAV` || f === `${name}.mp3` || f === `${name}.ogg`);
  // also handle save/load style
  const alt = fs.readdirSync(srcSnd).find((f) => f.startsWith(`${name}.`) && !f.endsWith('.xml'));
  const pick = file || alt;
  if (!pick) return false;
  const ext = path.extname(pick);
  fs.copyFileSync(path.join(srcSnd, pick), path.join(out, 'sounds', `${name}${ext}`));
  return true;
}

const SPRITES = [
  'dance', 'credits', 'pistol_r', 'pistol_l', 'ak47_hand_sprR', 'ak47_hand_sprL',
  'gilza_r', 'gilza_l', 'ak47_bulletR', 'ak47_bulletL', 'oboima', 'blood',
  'blood_pist_r', 'blood_pist_l', 'headshot', 'explosion', 'boss1_stand', 'boss1_go',
  'boss_throw', 'boss_lives0', 'boss_lives1', 'boss_lives2', 'boss_lives3', 'boss_floor',
  'rain', 'thunder', 'dirigable', 'dirig_bomb', 'die_kul', 'die_noge', 'die_fatality',
  'die_super', 'autors', 'autors_ch', 'load', 'save', 'nakovalna', 'kosar', 'kosar_die',
  'sprite_stand', 'sprite_stand2', 'sprite_left', 'sprite_right', 'udar_l', 'udar_r',
  'udar_l2', 'udar_r2', 'lives', 'spr_wall', 'sprite_new_game', 'sprite_new_game_ch',
  'sprite_exit', 'sprite_exit_ch', 'sprite_highscore', 'sprite_highscore_ch',
  'achievements', 'achievements_ch', 'arrow_back', 'arrow_ch', '1up', 'hand1', 'hand2',
  'nikita', 'buiniy', '5 kosarei', '10 kosarei',
];

const BGS = ['menu', 'background4', 'background9', 'shop', 'loading', 'danger', 'highscores', 'authors_bck', 'intro_1'];
const SOUNDS = [
  'game', 'menu1', 'menu2', 'menu3', 'thunder', 'cash', 'punch', 'beep', 'hit', 'udar',
  'warning', 'rain', 'DE_shoot', 'DE_reload', 'no_bulet', 'hulitakmalo', 'credits',
  'shotgun_shoot', 'shotgun_reload', 'explosion', 'explosion2', 'boss', 'urodblya',
  '-life', '+life', 'dirigabb_poyav', 'dirigabb_sound', 'superudar',
];

let ok = 0;
let miss = 0;
for (const s of SPRITES) {
  if (copySprite(s)) { ok += 1; console.log('sprite', s); }
  else { miss += 1; console.warn('MISS sprite', s); }
}
for (const b of BGS) {
  if (copyBg(b)) { ok += 1; console.log('bg', b); }
  else { miss += 1; console.warn('MISS bg', b); }
}
for (const s of SOUNDS) {
  if (copySound(s)) { ok += 1; console.log('snd', s); }
  else { miss += 1; console.warn('MISS snd', s); }
}
console.log(`done ok=${ok} miss=${miss}`);
