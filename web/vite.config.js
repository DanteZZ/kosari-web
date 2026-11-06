import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// GitHub Pages project site: https://<user>.github.io/<repo>/
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.VITE_BASE || (repo ? `/${repo}/` : '/');

/**
 * Multi-page site:
 *   /          — launcher (pick a game)
 *   /classic/  — Kosari Classic (faithful GM8 port), code in src/classic, assets in public/classic
 *   /remake/   — Kosari Remake (new beat'em up),    code in src/remake,  assets in public/remake
 * Game code loads assets via relative "assets/..." URLs, so each page resolves
 * them under its own folder (/classic/assets, /remake/assets).
 */
export default defineConfig({
  base,
  appType: 'mpa',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: '_build',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        classic: resolve(__dirname, 'classic/index.html'),
        remake: resolve(__dirname, 'remake/index.html'),
      },
    },
  },
});
