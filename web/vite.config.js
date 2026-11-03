import { defineConfig } from 'vite';

// GitHub Pages project site: https://<user>.github.io/<repo>/
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.VITE_BASE || (repo ? `/${repo}/` : '/');

export default defineConfig({
  base,
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
