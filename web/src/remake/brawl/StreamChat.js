import { VIEW_W } from '../game/constants.js';
import { getHero } from '../game/heroes.js';
import { optionTitle } from './ModesView.js';

/**
 * The stream's live chat (Papich's stream house, «Суперстрим» online): a
 * Twitch-like panel on the left — LIVE and the viewer count, the streamers
 * (online: every player with his health), and viewers' messages reacting to
 * what happens: hits, knockouts, a friend down, donations, the polls, Папич.
 *
 * Pure view: it listens to the sim's events (online the guests get the same
 * events, the wording is picked on each screen).
 */
const W = 340;
const LINES = 10;
const VIEWERS = [
  ['kot_v_sapogah', '#ff7ab0'], ['nikita2009', '#7dc8ff'], ['papich_fan', '#ffd23f'], ['donat_king', '#ff9a3a'],
  ['shaurma_lover', '#7dff7a'], ['frjazino_boy', '#c6a0ff'], ['ded_mjachik', '#ff5a5a'], ['glad_tv', '#2bf3ff'],
  ['sigma1987', '#e8e8e8'], ['pahom_fan', '#8fd18f'], ['kosar_hunter', '#ffb0c8'], ['vertuha_pro', '#ffd27a'],
  ['bot_ivan', '#9aa6ff'], ['mama_ya_v_tv', '#ff8ad8'], ['lagi_lagi', '#7af0c8'], ['zritel_007', '#d8ff6a'],
];

const SAY = {
  idle: ['KEKW', 'ну и где экшен', 'сколько косарей уже?', 'чат, это лучший стрим', '{name} топ', 'привет из Фрязино', 'лол', 'Pog', 'кто тут с 2011-го?', 'стрим без лагов, чудо', 'донатьте на аптечку', 'ЖИЗА', '+rep {name}', 'а можно с вертухи?', 'это ремейк Косарей?', 'го дуэль', 'ахахах', 'мама, я в чате'],
  combo: ['КОМБО!', '{name} разносит', 'вот это вертуха', 'ЖЁСТКО', '{name} не остановить', 'Pog Pog Pog', 'клипнул', 'это было красиво'],
  kill: ['уложил', 'минус один', 'GG', 'в нокаут!', 'отдыхай', 'ещё один зритель отлетел'],
  hurt: ['ауч', '{name} ловит урон', 'лечись!', 'KEKW отлетел', 'не стой под ударом', 'больно смотреть'],
  down: ['{name} упал F', 'F', 'поднимите {name}!', 'RIP {name}', 'ПОДНИМАЙТЕ', 'F F F'],
  revive: ['{name} снова в деле!', 'камбэк!', 'живой!', 'воскрес Pog'],
  vote: ['1', '2', '3', '1111', 'ТРИ!', 'голосуем', 'чат, решаем', '2 2 2'],
  voteGood: ['{name} заслужил', 'держи, {name}', 'чат добрый сегодня', 'ну всё, сейчас разнесёт'],
  voteBad: ['хахаха {name}', 'ноги ватные KEKW', 'так ему', 'чат жесток', 'страдай, {name}'],
  voteAll: ['ЧАТ РЕШИЛ!', 'вот это поворот', 'ахахах что началось'],
  papich: ['ПАПИЧ В ЭФИРЕ', 'ГЕНИЙ ПРИШЁЛ', 'ну всё, сейчас начнётся', 'чат, встаём', 'папич, привет из Фрязино'],
  papichDown: ['ПАПИЧ ВСЁ', 'лаги, это лаги', 'это не он проиграл', 'GG WP', 'чат в шоке'],
  rank: ['СТИЛЬ {rank}!', 'вот это стиль', 'клипаем', 'это в нарезку'],
  wave: ['опять лезут', 'это мои подписчики', 'рейд!', 'зрители пошли в атаку'],
  win: ['GG', 'ПОБЕДА', 'лучший стрим года', 'подписка оформлена'],
};
const DONATIONS = ['на шаурму', 'за вертуху', 'Папич, ты гений', 'это всё за косари', 'на протеин {name}', 'передай привет маме', 'лучший стрим!'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class StreamChat {
  constructor(scene) {
    this.scene = scene;
    this.msgs = [];
    this.queue = [];
    this.nextT = 0;
    this.idleT = 1500;
    this.hits = 0;
    const s = scene;
    // Under the shop (5200): the shop opens over the same corner
    const c = s.add.container(14, 112).setDepth(5100);
    c.g = s.add.graphics();
    c.head = s.add.text(12, 8, '', { fontFamily: 'Arial Black, Arial', fontSize: '16px', color: '#ff4a5a' });
    c.streamers = s.add.text(12, 32, '', { fontFamily: 'Arial', fontSize: '13px', color: '#ffffff', lineSpacing: 2 });
    c.rows = Array.from({ length: LINES }, () => [
      s.add.text(12, 0, '', { fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold', color: '#fff' }),
      s.add.text(12, 0, '', { fontFamily: 'Arial', fontSize: '14px', color: '#f0eef7' }),
    ]);
    c.add([c.g, c.head, c.streamers, ...c.rows.flat()]);
    s.tagUi(c.setScrollFactor(0));
    for (const o of c.list) s.tagUi(o.setScrollFactor(0));
    this.c = c;
  }

  /** Who a message is about: the player of the event, or anybody alive. */
  nameOf(id) {
    const w = this.scene.world;
    let f = id != null ? w.fighters.find((x) => x.id === id && x.kind === 'player') : null;
    if (!f) {
      const ps = w.fighters.filter((x) => x.kind === 'player' && !x.dead);
      f = ps[Math.floor(Math.random() * ps.length)] || this.scene.player;
    }
    return f ? f.netName || getHero(f.hero).label : 'стример';
  }

  post(kind, vars = {}, opts = {}) {
    const pool = Array.isArray(kind) ? kind : SAY[kind];
    if (!pool) return;
    if (this.queue.length > 6 && !opts.force) return;
    let text = pick(pool);
    text = text.replace('{name}', vars.name || this.nameOf(vars.id)).replace('{rank}', vars.rank || '');
    this.queue.push({ who: opts.who || pick(VIEWERS), text, donate: opts.donate });
  }

  onEvent(ev) {
    const w = this.scene.world;
    switch (ev.type) {
      case 'hit': {
        const att = w.fighters.find((f) => f.id === ev.attacker);
        const tgt = w.fighters.find((f) => f.id === ev.target);
        if (att?.kind === 'player' && ev.targetTeam === 'enemy') {
          this.hits += 1;
          if (tgt?.dead && Math.random() < 0.45) this.post('kill', { id: att.id });
          else if (this.hits % 7 === 0) this.post('combo', { id: att.id });
        } else if (tgt?.kind === 'player' && !w.pvp) {
          if (tgt.dead) this.post('down', { id: tgt.id }, { force: true });
          else if ((ev.dmg || 0) >= 14 && Math.random() < 0.35) this.post('hurt', { id: tgt.id });
        } else if (tgt?.kind === 'player' && w.pvp && tgt.dead) this.post('kill', { id: att?.id });
        break;
      }
      case 'revive':
        if (!w.pvp) this.post('revive', { id: ev.id }, { force: true });
        break;
      case 'donate': {
        const v = pick(VIEWERS);
        const sum = (ev.amount || 1) * 50;
        this.queue.push({ who: v, text: `задонатил ${sum} ₽: «${pick(DONATIONS).replace('{name}', this.nameOf())}»`, donate: true });
        break;
      }
      case 'voteStart':
        for (let i = 0; i < 3; i += 1) this.post('vote');
        if (ev.options?.length) this.queue.push({ who: pick(VIEWERS), text: `голосую за «${optionTitle(w, ev.options[Math.floor(Math.random() * ev.options.length)])}»` });
        break;
      case 'voteWin':
        if (ev.target != null) this.post(ev.good ? 'voteGood' : 'voteBad', { id: ev.target }, { force: true });
        else this.post('voteAll', {}, { force: true });
        break;
      case 'spawn':
        if (ev.kind === 'papich') {
          this.post('papich', {}, { force: true });
          this.post('papich', {}, { force: true });
        } else if (ev.from === 'drop' && Math.random() < 0.15) this.post('wave');
        break;
      case 'bossDown': {
        const f = w.fighters.find((x) => x.id === ev.id);
        if (f?.kind === 'papich') {
          this.post('papichDown', {}, { force: true });
          this.post('papichDown', {}, { force: true });
        }
        break;
      }
      case 'styleRank':
        if (ev.up && 'ASSS'.includes(ev.rank)) this.post('rank', { rank: ev.rank });
        break;
      case 'mapComplete':
        this.post('win', {}, { force: true });
        this.post('win', {}, { force: true });
        break;
      default:
    }
  }

  update(dt) {
    const s = this.scene;
    const w = s.world;
    // Idle chatter; more viewers — chattier chat
    this.idleT -= dt * 1000;
    if (this.idleT <= 0) {
      const v = w.style?.viewers || 300;
      this.idleT = Math.max(500, 2600 - v * 0.25) * (0.6 + Math.random() * 0.8);
      if (!s.cine?.active || Math.random() < 0.3) this.post('idle');
    }
    this.nextT -= dt * 1000;
    if (this.queue.length && this.nextT <= 0) {
      this.nextT = 260 + Math.random() * 380;
      this.msgs.push(this.queue.shift());
      if (this.msgs.length > LINES) this.msgs.shift();
      this.dirty = true;
    }
    this.draw();
  }

  draw() {
    const c = this.c;
    const w = this.scene.world;
    const players = w.fighters.filter((f) => f.kind === 'player' && !f.removed);
    // Streamers: name, hero, health (online all of them)
    const list = players.map((f) => {
      const n = f.netName || getHero(f.hero).label;
      const hp = f.dead ? '💀 упал' : `${'█'.repeat(Math.max(0, Math.round((f.hp / f.maxHp) * 8)))}${'░'.repeat(8 - Math.max(0, Math.round((f.hp / f.maxHp) * 8)))}`;
      return `${n.slice(0, 16).padEnd(16, ' ')} ${hp}`;
    });
    c.head.setText(`● LIVE · ${Math.round(w.style?.viewers || 120).toLocaleString('ru-RU')} зрителей`);
    c.streamers.setText(list.join('\n'));
    const top = 40 + list.length * 18;
    const rowH = 21;
    const H = top + LINES * rowH + 10;
    if (this.dirty || this._h !== H) {
      this._h = H;
      this.dirty = false;
      c.g.clear().fillStyle(0x0e0b16, 0.78).fillRoundedRect(0, 0, W, H, 10).lineStyle(2, 0x9147ff, 0.9).strokeRoundedRect(0, 0, W, H, 10);
      c.g.lineStyle(1, 0xffffff, 0.12).lineBetween(10, top - 6, W - 10, top - 6);
      const start = LINES - this.msgs.length;
      c.rows.forEach(([nick, msg], i) => {
        const m = this.msgs[i - start];
        const y = top + i * rowH;
        if (!m) {
          nick.setText('');
          msg.setText('');
          return;
        }
        nick.setText(`${m.who[0]}:`).setColor(m.who[1]).setPosition(12, y);
        msg.setText(m.text).setPosition(12 + nick.width + 6, y).setColor(m.donate ? '#ffd23f' : '#f0eef7');
        const room = W - 20 - nick.width - 6;
        msg.setScale(msg.width > room ? Math.max(0.55, room / msg.width) : 1, 1);
        if (m.donate) c.g.fillStyle(0xffd23f, 0.12).fillRect(6, y - 2, W - 12, rowH);
      });
    }
    // Hidden while the shop is open (same corner of the screen)
    c.setPosition(14, 112).setVisible(!this.scene.shopOpen);
    void VIEW_W;
  }

  destroy() {
    this.c.destroy();
  }
}
