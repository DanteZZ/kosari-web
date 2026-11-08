import { BTN } from './input.js';

/**
 * Office: Гительман's «инвестиции» (arena `mini: { type: 'trading', ticks }`).
 * A chart crawls across the screen. J — buy (all your косари go in), K — sell.
 * Watch for the pump before a crash. Whatever you hold at the end is sold.
 * Profit or loss lands in your pocket; then the trader crowd attacks.
 */

export function startTrading(world, b, cfg) {
  const p = world.players()[0];
  // Broke? Гительман lends you a starting stake
  if (p && (p.money || 0) < 10) p.money = 10;
  world.mini = {
    type: 'trading',
    t: 0,
    total: cfg.ticks || 1500,
    price: 100,
    hist: [100],
    trend: 0,
    held: 0,
    cash: p ? p.money || 0 : 0,
    start: p ? p.money || 0 : 0,
    crashT: 0,
    done: false,
  };
  if (p) p.mini = true;
  world.events.push({ type: 'tradeStart' });
}

export function preTrading(world) {
  const m = world.mini;
  const p = world.players()[0];
  if (!m || m.done || !p) return;
  m.pressed = p.cmd & ~(m.prevCmd || 0);
  m.prevCmd = p.cmd;
  p.cmd = 0;
  p.buf = { btn: 0, t: 0 };
}

export function stepTrading(world) {
  const m = world.mini;
  if (!m || m.type !== 'trading' || m.done) return;
  const p = world.players()[0];
  if (!p) return;
  m.t += 1;
  // Price: a drifting random walk with pumps and crashes
  if (m.t % 6 === 0) {
    if (m.crashT > 0) {
      m.crashT -= 1;
      m.price *= 0.93;
    } else {
      if (world.rng.chance(0.06)) m.trend = world.rng.range(-0.025, 0.035);
      if (world.rng.chance(0.012) && m.price > 120) {
        m.crashT = 8;
        world.events.push({ type: 'tradeCrash' });
      }
      m.price *= 1 + m.trend + world.rng.range(-0.03, 0.03);
    }
    m.price = Math.max(20, Math.min(600, m.price));
    m.hist.push(m.price);
    if (m.hist.length > 120) m.hist.shift();
  }
  const pr = m.pressed || 0;
  m.pressed = 0;
  if (pr & BTN.LIGHT && m.cash > 0 && !m.held) {
    m.held = m.cash / m.price;
    m.buyAt = m.price;
    m.cash = 0;
    world.events.push({ type: 'tradeBuy', price: m.price });
  }
  if (pr & BTN.HEAVY && m.held) {
    m.cash = Math.floor(m.held * m.price);
    m.held = 0;
    world.events.push({ type: 'tradeSell', price: m.price, cash: m.cash });
  }
  p.money = Math.floor(m.cash + m.held * m.price);
  if (m.t >= m.total) {
    if (m.held) m.cash = Math.floor(m.held * m.price);
    m.held = 0;
    p.money = m.cash;
    m.done = true;
    p.mini = false;
    world.events.push({ type: 'tradeEnd', profit: m.cash - m.start });
  }
}

export function tradingText(m) {
  const s = Math.max(0, Math.ceil((m.total - m.t) / 60));
  const worth = Math.floor(m.cash + m.held * m.price);
  return `Инвестиции Гительмана · ${worth} К (${worth - m.start >= 0 ? '+' : ''}${worth - m.start}) · J — купить, K — продать · ${s}с`;
}
