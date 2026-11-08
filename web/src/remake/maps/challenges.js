/**
 * Optional challenges, the same three on every story map. Met ones are saved
 * per map (GameState.progress.challenges) and shown as stars in the chapter list.
 * r = { secs, damageTaken, shots }
 */
export function challengesFor(map) {
  const par = map.par || 330;
  const mm = Math.floor(par / 60);
  const ss = String(par % 60).padStart(2, '0');
  return [
    { id: 'tough', text: 'Получить меньше 250 урона', ok: (r) => r.damageTaken < 250 },
    { id: 'fast', text: `Пройти быстрее ${mm}:${ss}`, ok: (r) => r.secs < par },
    { id: 'fists', text: 'Ни одного выстрела', ok: (r) => r.shots === 0 },
  ];
}
