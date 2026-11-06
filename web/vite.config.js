import { resolve } from 'node:path';
import fs from 'node:fs';
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
/**
 * Dev-only: the bone editor's «Сохранить в проект» posts an enemy rig here and
 * it is written to src/remake/game/enemies/layouts/<id>.json.
 */
function saveLayoutPlugin() {
  const dir = resolve(__dirname, 'src/remake/game/enemies/layouts');
  return {
    name: 'kosari-save-layout',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__kosari/save-layout', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c) => {
          body += c;
          if (body.length > 1e6) req.destroy();
        });
        req.on('end', () => {
          try {
            const { id, layout } = JSON.parse(body);
            if (!/^[a-z0-9_]+$/.test(id) || !layout || typeof layout !== 'object') throw new Error('bad payload');
            const file = resolve(dir, `${id}.json`);
            if (!fs.existsSync(file)) throw new Error(`no layout file for ${id}`);
            fs.writeFileSync(file, `${JSON.stringify(layout, null, 2)}
`);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file: `src/remake/game/enemies/layouts/${id}.json` }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [saveLayoutPlugin()],
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
