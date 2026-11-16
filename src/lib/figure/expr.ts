/**
 * Қауіпсіз математикалық өрнек талдағышы (eval жоқ). Функция графигін салу үшін.
 * Қолдау: сандар, x, pi/π, e; + - * / ^; жақша; жасырын көбейту (2x, 2sin(x), 3(x+1), 2pi);
 * функциялар: sin cos tan tg cot ctg sqrt abs ln log exp.
 */
export type Compiled = (x: number) => number;

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan,
  cot: (v) => 1 / Math.tan(v), ctg: (v) => 1 / Math.tan(v),
  sqrt: (v) => Math.sqrt(v < 0 && v > -1e-9 ? 0 : v), abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp,
};
const CONSTS: Record<string, number> = { pi: Math.PI, 'π': Math.PI, e: Math.E };

function tokenize(src: string): Tok[] {
  const s = src.replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/·|×/g, '*').replace(/\\pi/g, 'pi').replace(/\\/g, '');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const v = Number(s.slice(i, j));
      if (!Number.isFinite(v)) throw new Error(`сан қате: ${s.slice(i, j)}`);
      out.push({ t: 'num', v });
      i = j;
    } else if (/[a-zπ]/i.test(c)) {
      let j = i;
      while (j < s.length && /[a-zπ]/i.test(s[j])) j++;
      // «2xsin» сияқты тізбекті бөлшектеу: белгілі атаулар мен x-ке ажырату
      let word = s.slice(i, j).toLowerCase();
      while (word.length) {
        const name = [...Object.keys(FUNCS), ...Object.keys(CONSTS), 'x'].sort((a, b) => b.length - a.length).find((n) => word.startsWith(n));
        if (!name) throw new Error(`белгісіз атау: ${word}`);
        out.push({ t: 'id', v: name });
        word = word.slice(name.length);
      }
      i = j;
    } else if ('+-*/^()'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else {
      throw new Error(`рұқсат етілмеген таңба: ${c}`);
    }
  }
  return out;
}

type Node = (x: number) => number;

export function compile(src: string): Compiled {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const startsPrimary = () => {
    const k = peek();
    return !!k && (k.t === 'num' || k.t === 'id' || (k.t === 'op' && k.v === '('));
  };

  function expr(): Node {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v;
      const l = left, r = term();
      left = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return left;
  }
  function term(): Node {
    let left = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = toks[p++].v;
        const l = left, r = unary();
        left = op === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
      } else if (startsPrimary()) {
        const l = left, r = power(); // жасырын көбейту
        left = (x) => l(x) * r(x);
      } else break;
    }
    return left;
  }
  function unary(): Node {
    if (isOp('-')) { p++; const u = unary(); return (x) => -u(x); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power(): Node {
    const base = primary();
    if (isOp('^')) {
      p++;
      const ex = unary(); // оң ассоциативті: 2^-1, x^2^3
      return (x) => Math.pow(base(x), ex(x));
    }
    return base;
  }
  function primary(): Node {
    const k = toks[p++];
    if (!k) throw new Error('өрнек толық емес');
    if (k.t === 'num') { const v = k.v; return () => v; }
    if (k.t === 'op' && k.v === '(') {
      const e = expr();
      if (!isOp(')')) throw new Error('жабылмаған жақша');
      p++;
      return e;
    }
    if (k.t === 'id') {
      if (k.v === 'x') return (x) => x;
      if (k.v in CONSTS) { const v = CONSTS[k.v]; return () => v; }
      const f = FUNCS[k.v];
      // sin^2(x) түрі
      let pw: Node | null = null;
      if (isOp('^')) { p++; pw = primary(); }
      const arg = isOp('(') ? primary() : power(); // sin x да рұқсат
      return pw ? (x) => Math.pow(f(arg(x)), pw!(x)) : (x) => f(arg(x));
    }
    throw new Error(`күтпеген белгі: ${k.v}`);
  }

  const root = expr();
  if (p !== toks.length) throw new Error('өрнектің соңы түсініксіз');
  return root;
}

/** Қате болса null қайтарады (бет құламасын). */
export function tryCompile(src: string): Compiled | null {
  try { return compile(src); } catch { return null; }
}
