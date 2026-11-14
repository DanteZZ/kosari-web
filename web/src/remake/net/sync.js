/**
 * World snapshots for online play: the host captures plain data out of the
 * sim (World, MapDirector), sends only what changed since the last frame
 * (a diff), and the guests patch their copy in place — fighters keep their
 * object identity, so the views and `scene.player` stay valid.
 *
 * A diff is { f: value } (replace), { o: { key: diff }, x: [deleted keys] }
 * (object patch), or { a: [ids in order], o: { id: diff } } (an array of
 * objects with ids: fighters, projectiles, pickups...).
 */

/** Never sent: functions, Maps / Sets, back-references, per-frame queues. */
const SKIP = new Set(['rng', 'inputs', 'events', 'world', 'map', 'met', 'scene']);

const round = (n) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);

/** Plain JSON-able copy of the sim data (cycles cut, floats rounded). */
export function capture(v, depth = 0, seen = new WeakSet()) {
  if (v == null) return v;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? round(v) : null;
  if (t === 'string' || t === 'boolean') return v;
  if (t !== 'object' || depth > 7) return undefined;
  if (v instanceof Map || v instanceof Set || seen.has(v)) return undefined;
  seen.add(v);
  let out;
  if (Array.isArray(v)) {
    out = v.map((x) => {
      const c = capture(x, depth + 1, seen);
      return c === undefined ? null : c;
    });
  } else {
    out = {};
    for (const k of Object.keys(v)) {
      if (SKIP.has(k)) continue;
      const c = capture(v[k], depth + 1, seen);
      if (c !== undefined) out[k] = c;
    }
  }
  seen.delete(v);
  return out;
}

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const keyed = (a) => Array.isArray(a) && a.length > 0 && a.every((e) => isObj(e) && e.id != null);

/** What changed from `a` to `b` (undefined: nothing). */
export function diff(a, b) {
  if (a === b) return undefined;
  if (isObj(a) && isObj(b)) {
    const o = {};
    let any = false;
    for (const k of Object.keys(b)) {
      const d = diff(a[k], b[k]);
      if (d !== undefined) {
        o[k] = d;
        any = true;
      }
    }
    const x = Object.keys(a).filter((k) => !(k in b));
    if (!any && !x.length) return undefined;
    return x.length ? { o, x } : { o };
  }
  if (Array.isArray(a) && Array.isArray(b) && (keyed(b) || (b.length === 0 && keyed(a)))) {
    const old = new Map(a.filter(isObj).map((e) => [e.id, e]));
    const ids = b.map((e) => e.id);
    const o = {};
    for (const e of b) {
      const prev = old.get(e.id);
      if (!prev) o[e.id] = { f: e };
      else {
        const d = diff(prev, e);
        if (d !== undefined) o[e.id] = d;
      }
    }
    const same = a.length === b.length && a.every((e, i) => e?.id === ids[i]);
    if (same && !Object.keys(o).length) return undefined;
    return { a: ids, o };
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && JSON.stringify(a) === JSON.stringify(b)) return undefined;
  return { f: b };
}

const clone = (v) => (v == null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));

/** Apply a diff to `target` (in place where it can). Returns the new value. */
export function patch(target, d) {
  if (!d) return target;
  if ('f' in d) return clone(d.f);
  if (d.a) {
    const arr = Array.isArray(target) ? target : [];
    const byId = new Map(arr.filter(isObj).map((e) => [e.id, e]));
    const next = d.a.map((id) => {
      const cur = byId.get(id);
      const dd = d.o?.[id];
      return dd ? patch(cur, dd) : cur;
    });
    arr.length = 0;
    for (const e of next) arr.push(e);
    return arr;
  }
  const obj = isObj(target) ? target : {};
  for (const [k, dd] of Object.entries(d.o || {})) obj[k] = patch(obj[k], dd);
  for (const k of d.x || []) delete obj[k];
  return obj;
}
