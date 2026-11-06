/**
 * Tiny GML evaluator: expressions (action arguments) and the few assignment
 * statements the original uses in code actions. Parses once, caches the AST.
 */

const cache = new Map();

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      out.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === '$') {
      let j = i + 1;
      while (j < src.length && /[0-9a-fA-F]/.test(src[j])) j += 1;
      out.push({ t: 'num', v: parseInt(src.slice(i + 1, j), 16) });
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += 1;
      out.push({ t: 'str', v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', ':='].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    out.push({ t: 'op', v: c });
    i += 1;
  }
  return out;
}

const BIN = {
  '||': 1, or: 1, '&&': 2, and: 2,
  '==': 3, '=': 3, '!=': 3, '<': 3, '>': 3, '<=': 3, '>=': 3,
  '+': 4, '-': 4, '*': 5, '/': 5, mod: 5, div: 5,
};

function parseExpr(tokens, pos = { i: 0 }) {
  const peek = () => tokens[pos.i];
  const next = () => tokens[pos.i++];

  function primary() {
    const tk = next();
    if (!tk) return { k: 'num', v: 0 };
    if (tk.t === 'num') return { k: 'num', v: tk.v };
    if (tk.t === 'str') return { k: 'str', v: tk.v };
    if (tk.t === 'op' && tk.v === '(') {
      const e = expr(0);
      next(); // )
      return e;
    }
    if (tk.t === 'op' && (tk.v === '-' || tk.v === '!' || tk.v === '+')) {
      const e = primary();
      return { k: 'un', op: tk.v, e };
    }
    if (tk.t === 'id' && tk.v === 'not') return { k: 'un', op: '!', e: primary() };
    if (tk.t === 'id') {
      let node;
      if (peek()?.t === 'op' && peek().v === '(') {
        next();
        const args = [];
        while (peek() && !(peek().t === 'op' && peek().v === ')')) {
          args.push(expr(0));
          if (peek()?.t === 'op' && peek().v === ',') next();
        }
        next();
        node = { k: 'call', f: tk.v, args };
      } else {
        node = { k: 'id', v: tk.v };
      }
      while (peek()?.t === 'op' && peek().v === '.') {
        next();
        const f = next();
        node = { k: 'dot', o: node, f: f.v };
      }
      while (peek()?.t === 'op' && peek().v === '[') {
        next();
        const idx = expr(0);
        next();
        node = { k: 'idx', o: node, i: idx };
      }
      return node;
    }
    return { k: 'num', v: 0 };
  }

  function expr(minP) {
    let left = primary();
    for (;;) {
      const tk = peek();
      if (!tk) break;
      const op = tk.v;
      const p = (tk.t === 'op' || tk.t === 'id') && BIN[op];
      if (!p || p <= minP) break;
      next();
      const right = expr(p);
      left = { k: 'bin', op, l: left, r: right };
    }
    return left;
  }
  return expr(0);
}

export function compileExpr(src) {
  const key = `e:${src}`;
  if (!cache.has(key)) cache.set(key, parseExpr(tokenize(String(src))));
  return cache.get(key);
}

/** Statements: `a = expr`, `a += expr`, `obj.a = expr`, separated by newlines / ;. */
export function compileCode(src) {
  const key = `c:${src}`;
  if (cache.has(key)) return cache.get(key);
  const stmts = [];
  for (const raw of String(src).split(/[\n;]/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*(\+=|-=|\*=|\/=|:=|=)\s*(.+)$/);
    if (m) stmts.push({ target: m[1], op: m[2], e: compileExpr(m[3]) });
    else stmts.push({ e: compileExpr(line) });
  }
  cache.set(key, stmts);
  return stmts;
}

const truthy = (v) => (typeof v === 'string' ? v.length > 0 : v > 0.5);

/**
 * @param {object} node
 * @param {{ rt, self, other }} ctx — rt resolves names (rt.getVar / rt.callFn)
 */
export function evaluate(node, ctx) {
  switch (node.k) {
    case 'num':
    case 'str':
      return node.v;
    case 'un': {
      const v = evaluate(node.e, ctx);
      if (node.op === '-') return -v;
      if (node.op === '!') return truthy(v) ? 0 : 1;
      return v;
    }
    case 'bin': {
      const a = evaluate(node.l, ctx);
      if (node.op === '&&' || node.op === 'and') return truthy(a) && truthy(evaluate(node.r, ctx)) ? 1 : 0;
      if (node.op === '||' || node.op === 'or') return truthy(a) || truthy(evaluate(node.r, ctx)) ? 1 : 0;
      const b = evaluate(node.r, ctx);
      switch (node.op) {
        case '+':
          return typeof a === 'string' || typeof b === 'string' ? `${a}${b}` : a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? 0 : a / b;
        case 'mod': return a % b;
        case 'div': return Math.trunc(a / b);
        case '==':
        case '=': return a === b || (typeof a !== 'string' && typeof b !== 'string' && a == b) ? 1 : 0; // eslint-disable-line eqeqeq
        case '!=': return a === b ? 0 : 1;
        case '<': return a < b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        default: return 0;
      }
    }
    case 'id':
      return ctx.rt.getName(node.v, ctx);
    case 'dot':
      return ctx.rt.getMember(node.o, node.f, ctx);
    case 'idx':
      return ctx.rt.getIndexed(node.o, evaluate(node.i, ctx), ctx);
    case 'call':
      return ctx.rt.callFn(node.f, node.args.map((a) => evaluate(a, ctx)), ctx);
    default:
      return 0;
  }
}

export function runCode(src, ctx) {
  for (const s of compileCode(src)) {
    const v = evaluate(s.e, ctx);
    if (!s.target) continue;
    let val = v;
    if (s.op !== '=' && s.op !== ':=') {
      const cur = ctx.rt.getPath(s.target, ctx);
      val = s.op === '+=' ? cur + v : s.op === '-=' ? cur - v : s.op === '*=' ? cur * v : cur / v;
    }
    ctx.rt.setPath(s.target, val, ctx);
  }
}

export { truthy };
