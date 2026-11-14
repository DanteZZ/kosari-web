/**
 * Kosari Remake — online sessions (rooms) service.
 *
 *   node server/index.mjs            (PORT=5181 by default, WebSocket at /net)
 *
 * A session is a room with a short code (the invite link carries it), an
 * optional password and four seats. Seat 0 is the host: his browser runs the
 * fight; this service keeps the rooms and passes messages between the seats —
 * the guests' button presses go to the host, the host's world snapshots go to
 * the guests. Nothing about the game itself lives here.
 *
 * Protocol (JSON text frames), client → server:
 *   create { name, hero, pass? }          join { code, name, hero, pass? }
 *   hero { hero }  name { name }  ready { on }  map { map }   (map: host only)
 *   pass { pass }                          host: set / clear the password
 *   kick { seat }                          host: show a guest the door
 *   start                                  host: everybody into the game
 *   in { bits }                            guest → host (the server adds the seat)
 *   snap { ... } | ctl { ... }             host → every guest, as is
 *   lobby                                  host: the game is over, back to the lobby
 *   leave
 * server → client:
 *   room { room }   err { code, msg }   in { seat, bits }   gone { seat }   closed   kicked
 *   + the host's snap / ctl frames
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 5181;
const SEATS = 4;
const HEROES = new Set(['pocik', 'svidetel', 'pistoletov', 'kama']);
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** code → room */
const rooms = new Map();

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i += 1) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

/** What every member sees of the room. */
function view(room, seat) {
  return {
    code: room.code,
    pass: !!room.pass,
    map: room.map,
    state: room.state,
    you: seat,
    seats: room.seats.map((s) => (s ? { name: s.name, hero: s.hero, ready: s.ready, host: s.seat === 0 } : null)),
  };
}

function broadcastRoom(room) {
  room.seats.forEach((s) => s && send(s.ws, { t: 'room', room: view(room, s.seat) }));
}

function leave(ws) {
  const me = ws.me;
  if (!me) return;
  ws.me = null;
  const room = rooms.get(me.code);
  if (!room) return;
  room.seats[me.seat] = null;
  if (me.seat === 0) {
    // The host is gone: the session ends for everybody
    room.seats.forEach((s) => {
      if (!s) return;
      s.ws.me = null;
      send(s.ws, { t: 'closed' });
    });
    rooms.delete(room.code);
    return;
  }
  send(room.seats[0]?.ws, { t: 'gone', seat: me.seat });
  broadcastRoom(room);
}

function seatIn(room, ws, { name, hero }) {
  const seat = room.seats.findIndex((s) => !s);
  if (seat < 0) return null;
  const me = { ws, seat, code: room.code, name: clean(name, 18) || `Игрок ${seat + 1}`, hero: HEROES.has(hero) ? hero : 'pocik', ready: seat === 0 };
  room.seats[seat] = me;
  ws.me = me;
  return me;
}

function onMessage(ws, raw) {
  let m;
  try {
    m = JSON.parse(raw);
  } catch (_) {
    return;
  }
  const me = ws.me;
  const room = me && rooms.get(me.code);

  switch (m.t) {
    case 'create': {
      leave(ws);
      const r = { code: newCode(), pass: clean(m.pass, 32) || null, map: 'forest', state: 'lobby', seats: Array(SEATS).fill(null), created: Date.now() };
      rooms.set(r.code, r);
      seatIn(r, ws, m);
      broadcastRoom(r);
      return;
    }
    case 'join': {
      leave(ws);
      const r = rooms.get(clean(m.code, 8).toUpperCase());
      if (!r) return send(ws, { t: 'err', code: 'nocode', msg: 'Сессия не найдена' });
      if (r.pass && clean(m.pass, 32) !== r.pass) return send(ws, { t: 'err', code: 'pass', msg: m.pass ? 'Неверный пароль' : 'Нужен пароль' });
      if (r.state !== 'lobby') return send(ws, { t: 'err', code: 'started', msg: 'Игра уже идёт' });
      if (!seatIn(r, ws, m)) return send(ws, { t: 'err', code: 'full', msg: 'Все четыре места заняты' });
      broadcastRoom(r);
      return;
    }
    case 'leave':
      leave(ws);
      return;
    default:
      break;
  }
  if (!room) return;

  switch (m.t) {
    case 'hero':
      if (HEROES.has(m.hero)) me.hero = m.hero;
      broadcastRoom(room);
      break;
    case 'name':
      me.name = clean(m.name, 18) || me.name;
      broadcastRoom(room);
      break;
    case 'ready':
      if (me.seat !== 0) me.ready = !!m.on;
      broadcastRoom(room);
      break;
    case 'map':
      if (me.seat === 0 && room.state === 'lobby') room.map = clean(m.map, 24);
      broadcastRoom(room);
      break;
    case 'pass':
      if (me.seat === 0) room.pass = clean(m.pass, 32) || null;
      broadcastRoom(room);
      break;
    case 'kick': {
      const s = room.seats[m.seat | 0];
      if (me.seat !== 0 || !s || s.seat === 0) break;
      room.seats[s.seat] = null;
      s.ws.me = null;
      send(s.ws, { t: 'kicked' });
      send(room.seats[0]?.ws, { t: 'gone', seat: s.seat });
      broadcastRoom(room);
      break;
    }
    case 'start':
      if (me.seat !== 0 || room.state !== 'lobby') break;
      room.state = 'game';
      broadcastRoom(room);
      break;
    case 'lobby':
      if (me.seat !== 0) break;
      room.state = 'lobby';
      room.seats.forEach((s) => s && s.seat !== 0 && (s.ready = false));
      broadcastRoom(room);
      break;
    case 'in':
      // A guest's buttons → the host
      if (me.seat !== 0) send(room.seats[0]?.ws, { t: 'in', seat: me.seat, bits: m.bits | 0 });
      break;
    case 'snap':
    case 'ctl':
      // The host's world → every guest, untouched
      if (me.seat === 0) room.seats.forEach((s) => s && s.seat !== 0 && send(s.ws, raw));
      break;
    case 'sync':
      // A guest (re)entered the game: ask the host for a full picture
      if (me.seat !== 0) send(room.seats[0]?.ws, { t: 'sync', seat: me.seat });
      break;
    default:
      break;
  }
}

const server = http.createServer((req, res) => {
  // Health check / tiny status page
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
});
const wss = new WebSocketServer({ server, path: '/net', maxPayload: 2 * 1024 * 1024 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (data) => onMessage(ws, data.toString()));
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

// Drop dead connections; forget rooms nobody sits in
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  for (const [code, r] of rooms) if (r.seats.every((s) => !s)) rooms.delete(code);
}, 15000);

server.listen(PORT, () => console.log(`kosari-net: ws://localhost:${PORT}/net`));
