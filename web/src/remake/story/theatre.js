/**
 * «Театр» (?theatre in the URL): every story scene in story order, with no
 * fights in between — the chapter opening, each meeting, the boss's last words,
 * the special scenes. The player still picks the answers. Nothing is saved.
 *
 * Steps: { intro } | { meet: kind } | { defeat: kind } | { special: id, cast: kind } | { friends }
 */
export const THEATRE = [
  { map: 'forest', steps: [{ intro: true }, { meet: 'borsch' }, { defeat: 'borsch' }] },
  { map: 'opushka', steps: [{ intro: true }, { meet: 'povar' }, { defeat: 'povar' }] },
  { map: 'village', steps: [{ intro: true }, { meet: 'ded' }, { special: 'penalty_ded', cast: 'ded' }] },
  { map: 'dacha', steps: [{ intro: true }, { meet: 'pahom' }, { defeat: 'pahom' }] },
  { map: 'panelki', steps: [{ intro: true }, { meet: 'mongol' }] },
  { map: 'pc_club', steps: [{ intro: true }, { meet: 'glad' }] },
  { map: 'gym', steps: [{ intro: true }, { meet: 'vertuha' }, { meet: 'ruki' }, { special: 'ruki_concede', cast: 'ruki', if: 'flag:ruki_respect' }] },
  { map: 'museum', steps: [{ intro: true }, { meet: 'ponasenkov' }, { defeat: 'ponasenkov' }] },
  { map: 'river', steps: [{ intro: true }, { meet: 'reka' }] },
  { map: 'sigma_gym', steps: [{ intro: true }, { meet: 'gigachad' }, { defeat: 'gigachad' }] },
  { map: 'stream_house', steps: [{ intro: true }, { meet: 'zubarev' }, { meet: 'papich' }, { defeat: 'papich' }] },
  { map: 'office', steps: [{ intro: true }, { meet: 'gitelman' }] },
  { map: 'concert', steps: [{ intro: true }, { friends: true }, { meet: 'klas' }, { defeat: 'klas' }] },
];

/** What a scene's outcome was, for the card after it. */
export const OUTCOME_TITLE = {
  fight: ['ДРАКА', false],
  angry: ['ДРАКА · ОН В ЯРОСТИ', false],
  weak: ['ДРАКА · ОН РАССЛАБИЛСЯ', true],
  peace: ['ДОГОВОРИЛИСЬ', true],
  ally: ['НА ТВОЕЙ СТОРОНЕ', true],
  spare: ['ПОЩАДИЛ', true],
  take: ['ЗАБРАЛ КАССУ', true],
  fame: ['ФИНАЛ · СЛАВА', true],
  free: ['ФИНАЛ · СВОБОДА', true],
  share: ['ФИНАЛ · МИЛОСЕРДИЕ', true],
};
