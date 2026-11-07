/**
 * Prints { folder: { piece: maxDisplayHeight } } from brawl/world/kits.js so
 * import_kits.py can store every piece at the size the game actually shows it.
 *
 *   node web/scripts/kit_sizes.mjs > sizes.json
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../src/remake/brawl/world/kits.js', import.meta.url)), 'utf8')
  .replace(/^import KIT_INDEX.*$/m, 'const KIT_INDEX = {};');
const mod = await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);

const out = {};
const note = (folder, key, h) => {
  if (!key || key.startsWith('@')) return;
  if (key.includes('/')) [folder, key] = key.split('/');
  out[folder] ??= {};
  out[folder][key] = Math.max(out[folder][key] || 0, h);
};
for (const [theme, k] of Object.entries(mod.KITS)) {
  const f = k.folder || theme;
  for (const l of k.layers) {
    if (l.strip) note(f, l.strip.key, l.strip.h);
    for (const it of l.items || []) note(f, it.key, it.h * 1.08);
  }
  if (k.road) note(f, k.road.key, k.road.h);
  if (k.edge) note(f, k.edge.key, k.edge.h);
  for (const it of [...(k.decals || []), ...(k.fg || [])]) note(f, it.key, it.h * 1.08);
  if (k.fgStrip) note(f, k.fgStrip.key, k.fgStrip.h);
  for (const it of k.bottom || []) note(f, it.key, it.h * 1.15);
}
process.stdout.write(JSON.stringify(out, null, 1));
