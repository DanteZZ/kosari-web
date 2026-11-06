const cache = new Map();

export function playSfx(name, { volume = 0.55, loop = false } = {}) {
  const url = `assets/sounds/${name}`;
  let audio = cache.get(url);
  if (!audio) {
    audio = new Audio(url);
    cache.set(url, audio);
  }
  const node = audio.cloneNode();
  node.volume = volume;
  node.loop = loop;
  node.play().catch(() => {});
  return node;
}

export function stopAllSfx() {
  // best-effort: cloned nodes aren't tracked; menu music uses dedicated handle
}
