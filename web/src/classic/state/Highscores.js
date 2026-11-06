const STORAGE_KEY = 'kosari_highscores_v1';
const MAX = 10;

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX)));
}

export const Highscores = {
  top10() {
    return read()
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX);
  },

  qualifies(score) {
    const list = this.top10();
    return list.length < MAX || score > (list[list.length - 1]?.score ?? 0);
  },

  submit(score, name) {
    const clean = String(name || 'Игрок').trim().slice(0, 16) || 'Игрок';
    const list = read();
    list.push({ name: clean, score: Number(score) || 0, at: Date.now() });
    list.sort((a, b) => b.score - a.score);
    write(list);
    return this.top10();
  },
};
