import { GMRuntime, safeName } from './gm/runtime.js';
import './gm/dialogs.css';

/**
 * Kosari Classic — the original GameMaker 8 game (2011) running on a small
 * GM runtime. Data comes from public/classic/gm (see scripts/export_gm.py).
 */
const BASE = `${import.meta.env.BASE_URL}classic/gm/`;

const root = document.getElementById('game');
const canvas = document.createElement('canvas');
canvas.width = 640;
canvas.height = 480;
canvas.className = 'gm-canvas';
const ui = document.createElement('div');
ui.className = 'gm-ui';
const stage = document.createElement('div');
stage.className = 'gm-stage';
stage.append(canvas, ui);
root.appendChild(stage);

function fit() {
  const k = Math.min(window.innerWidth / 640, window.innerHeight / 480);
  const s = k >= 1 ? Math.floor(k * 4) / 4 : k;
  stage.style.width = `${640 * s}px`;
  stage.style.height = `${480 * s}px`;
  stage.style.setProperty('--k', s);
}
window.addEventListener('resize', fit);
fit();

const ctx = canvas.getContext('2d');
function progress(done, total, text = 'Загрузка') {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 320, 220);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(170.5, 240.5, 300, 14);
  ctx.fillRect(173, 243, 295 * (total ? done / total : 0), 9);
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function boot() {
  progress(0, 1);
  const game = await (await fetch(`${BASE}game.json`)).json();
  const jobs = [];
  for (const [name, s] of Object.entries(game.sprites)) {
    for (let i = 0; i < s.n; i += 1) jobs.push([`spr:${name}:${i}`, `${BASE}spr/${safeName(name)}/${i}.png`]);
  }
  for (const [name, b] of Object.entries(game.backgrounds)) {
    if (b.w) jobs.push([`bg:${name}`, `${BASE}bg/${safeName(name)}.png`]);
  }
  const images = new Map();
  let done = 0;
  const queue = jobs.slice();
  const worker = async () => {
    while (queue.length) {
      const [key, url] = queue.shift();
      const img = await loadImage(url);
      if (img) images.set(key, img);
      done += 1;
      if (done % 20 === 0) progress(done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  try {
    await document.fonts.load('16px "Russo One"');
  } catch (_) {
    /* ignore */
  }

  // Browsers only allow sound after a user gesture: wait for one click/key
  progress(1, 1, 'Нажмите любую клавишу или кликните');
  await new Promise((resolve) => {
    const go = (e) => {
      e.preventDefault?.();
      window.removeEventListener('keydown', go, true);
      canvas.removeEventListener('pointerdown', go);
      resolve();
    };
    window.addEventListener('keydown', go, true);
    canvas.addEventListener('pointerdown', go);
  });

  const rt = new GMRuntime(game, canvas, {
    images,
    base: BASE,
    ui,
    onEnd: () => {
      window.location.href = import.meta.env.BASE_URL;
    },
  });
  window.__gm = rt;
  rt.start();
}

boot();
