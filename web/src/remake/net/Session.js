/**
 * Connection to the sessions service (server/index.mjs): one WebSocket for the
 * whole page, kept across menu ⇄ game. Holds the current room as the server
 * last described it; anybody can subscribe to messages.
 *
 * The address: VITE_NET_URL at build time, else this site's own /net (the dev
 * server proxies it to localhost:5181, see vite.config.js).
 */
const URL_DEFAULT = () => {
  const env = import.meta.env?.VITE_NET_URL;
  if (env) return env;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/net`;
};

const NAME_KEY = 'kosari_net_name';

export const Session = {
  ws: null,
  /** { code, pass, map, state, you, seats: [{ name, hero, ready, host } | null] } */
  room: null,
  listeners: new Set(),
  status: 'offline',

  get seat() {
    return this.room?.you ?? null;
  },
  get isHost() {
    return this.room?.you === 0;
  },
  get inGame() {
    return this.room?.state === 'game';
  },

  /** Open the socket (resolves once it is up). */
  connect() {
    if (this.ws && this.ws.readyState <= 1) {
      return this.ws.readyState === 1 ? Promise.resolve() : new Promise((r, j) => {
        this.ws.addEventListener('open', () => r(), { once: true });
        this.ws.addEventListener('error', () => j(new Error('offline')), { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(URL_DEFAULT());
      } catch (e) {
        reject(e);
        return;
      }
      this.ws = ws;
      this.status = 'connecting';
      ws.addEventListener('open', () => {
        this.status = 'online';
        resolve();
      });
      ws.addEventListener('error', () => {
        this.status = 'offline';
        reject(new Error('offline'));
      });
      ws.addEventListener('close', () => {
        this.status = 'offline';
        const had = !!this.room;
        this.room = null;
        this.ws = null;
        if (had) this.emit({ t: 'closed', reason: 'connection' });
      });
      ws.addEventListener('message', (e) => {
        let m;
        try {
          m = JSON.parse(e.data);
        } catch (_) {
          return;
        }
        if (m.t === 'room') this.room = m.room;
        if (m.t === 'closed' || m.t === 'kicked') this.room = null;
        this.emit(m);
      });
    });
  },

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  },

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  emit(m) {
    for (const fn of [...this.listeners]) {
      try {
        fn(m);
      } catch (e) {
        console.warn('[net]', e);
      }
    }
  },

  leave() {
    this.send({ t: 'leave' });
    this.room = null;
  },

  get name() {
    try {
      return localStorage.getItem(NAME_KEY) || '';
    } catch (_) {
      return '';
    }
  },
  set name(v) {
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch (_) {
      /* private mode */
    }
  },

  /** The link a friend opens to sit at this table. */
  inviteLink() {
    if (!this.room) return '';
    return `${location.origin}${location.pathname}?join=${this.room.code}`;
  },
};
