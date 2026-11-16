/**
 * Калькулятордағы шешім жолдарын ЖИ-сіз тексеру (ТЗ М0.4).
 * Әр жол алдыңғы жолдармен салыстырылады: теңдеудің түбірлері сақталды ма, есептеу дұрыс па,
 * түрлендіру тепе-тең бе, табылған мән теңдеуді қанағаттандыра ма, дискриминант дұрыс па.
 * Сенімді тексеру мүмкін болмаса — status 'unknown' (мұғалімге қалады).
 */
import { splitRel } from './latexnum.ts';

export type StepStatus = 'ok' | 'error' | 'warn' | 'unknown';
export interface StepCheck { status: StepStatus; reason?: string }

type Env = Record<string, number>;
type Fn = (env: Env) => number;

// ---------------- өрнекті компиляциялау (айнымалылармен) ----------------
const GREEK: Record<string, string> = { alpha: 'α', beta: 'β', varphi: 'φ', phi: 'φ', gamma: 'γ' };
const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan, cot: (v) => 1 / Math.tan(v), ctg: (v) => 1 / Math.tan(v),
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, arctg: Math.atan, ln: Math.log,
};

function normalize(src: string): { s: string; deg: boolean } {
  const deg = /\^\{?\\circ\}?|°/.test(src);
  const s = src
    .replace(/\\text\{[^}]*\}/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\[,;:! ]|\\quad|\\qquad|~/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\\operatorname\{([a-z]+)\}/g, '\\$1')
    .replace(/\\mathrm\{([a-z]+)\}/g, '\\$1')
    .replace(/\{,\}/g, '.')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/−/g, '-')
    .replace(/\\cdot|\\times|·|×/g, '*')
    .replace(/\\div|÷/g, '/')
    .replace(/\\dfrac|\\tfrac/g, '\\frac')
    .replace(/\^\{?\\circ\}?|°/g, '')
    .replace(/\s+/g, '');
  return { s, deg };
}

class Compiler {
  i = 0;
  s: string;
  deg: boolean;
  vars = new Set<string>();
  constructor(s: string, deg: boolean) { this.s = s; this.deg = deg; }
  peek() { return this.s[this.i]; }
  eat(t: string) { if (this.s.startsWith(t, this.i)) { this.i += t.length; return true; } return false; }
  expr(): Fn {
    let f = this.term();
    for (;;) {
      if (this.eat('+')) { const a = f, b = this.term(); f = (e) => a(e) + b(e); }
      else if (this.eat('-')) { const a = f, b = this.term(); f = (e) => a(e) - b(e); }
      else return f;
    }
  }
  term(): Fn {
    let f = this.unary();
    for (;;) {
      if (this.eat('*')) { const a = f, b = this.unary(); f = (e) => a(e) * b(e); }
      else if (this.eat('/')) { const a = f, b = this.unary(); f = (e) => a(e) / b(e); }
      else if (this.startsFactor()) {
        // аралас сан: 2\frac{1}{9}
        if (this.lastInt !== null && this.s.startsWith('\\frac', this.i)) {
          const save = this.i, n = this.lastInt;
          const g = this.power();
          if (this.mixed) { const a = f; f = (e) => { const v = a(e); return v < 0 ? v - g(e) : v + g(e); }; void n; continue; }
          this.i = save;
        }
        const a = f, b = this.unary(); f = (e) => a(e) * b(e);
      } else return f;
    }
  }
  lastInt: number | null = null;
  mixed = false;
  startsFactor() {
    const ch = this.peek();
    return !!ch && /[\d.(\\{a-zA-Zα-ω|]/.test(ch) && !this.s.startsWith('\\right', this.i);
  }
  unary(): Fn {
    if (this.eat('-')) { const a = this.unary(); return (e) => -a(e); }
    if (this.eat('+')) return this.unary();
    return this.power();
  }
  power(): Fn {
    let f = this.atom();
    while (this.eat('^')) {
      const g = this.peek() === '{' ? this.group() : this.single();
      const a = f; f = (e) => Math.pow(a(e), g(e));
    }
    return f;
  }
  single(): Fn {
    const ch = this.peek();
    if (ch && /\d/.test(ch)) { this.i++; const v = Number(ch); return () => v; }
    return this.atom();
  }
  group(): Fn {
    if (this.eat('{')) { const f = this.expr(); if (!this.eat('}')) throw new Error('}'); return f; }
    return this.single();
  }
  ident(name: string): Fn {
    this.vars.add(name);
    return (e) => { const v = e[name]; if (v === undefined) throw new Error('var ' + name); return v; };
  }
  atom(): Fn {
    this.mixed = false;
    const rest = this.s.slice(this.i);
    const num = /^\d+(?:\.\d+)?|^\.\d+/.exec(rest);
    if (num) { this.i += num[0].length; const v = Number(num[0]); this.lastInt = num[0].includes('.') ? null : v; return () => v; }
    this.lastInt = null;
    if (this.eat('(')) { const f = this.expr(); if (!this.eat(')')) throw new Error(')'); return f; }
    if (this.eat('{')) { const f = this.expr(); if (!this.eat('}')) throw new Error('}'); return f; }
    if (this.eat('|')) { const f = this.expr(); if (!this.eat('|')) throw new Error('|'); return (e) => Math.abs(f(e)); }
    if (this.eat('\\frac')) {
      const a0 = this.i; const a = this.group(); const ni = /^\{?\d+\}?$/.test(this.s.slice(a0, this.i));
      const b0 = this.i; const b = this.group(); const di = /^\{?\d+\}?$/.test(this.s.slice(b0, this.i));
      this.mixed = ni && di;
      return (e) => a(e) / b(e);
    }
    if (this.eat('\\sqrt')) {
      let n: Fn = () => 2;
      if (this.eat('[')) { n = this.expr(); if (!this.eat(']')) throw new Error(']'); }
      const v = this.group();
      return (e) => { const k = n(e), x = v(e); return k === 2 ? Math.sqrt(x) : (x < 0 && k % 2 === 1 ? -Math.pow(-x, 1 / k) : Math.pow(x, 1 / k)); };
    }
    if (this.eat('\\pi') || this.eat('π')) return () => Math.PI;
    const fn = /^\\(arcsin|arccos|arctan|arctg|sin|cos|tan|tg|cot|ctg|ln)(?![a-z])/.exec(rest);
    if (fn) {
      this.i += fn[0].length;
      let pw: Fn | null = null;
      if (this.eat('^')) pw = this.peek() === '{' ? this.group() : this.single();
      const arg = this.unaryArg();
      const F = FUNCS[fn[1]], deg = this.deg && !fn[1].startsWith('arc');
      return (e) => { const v = F(deg ? arg(e) * Math.PI / 180 : arg(e)); return pw ? Math.pow(v, pw(e)) : v; };
    }
    const gr = /^\\(alpha|beta|varphi|phi|gamma)(?![a-z])/.exec(rest);
    if (gr) { this.i += gr[0].length; return this.ident(GREEK[gr[1]]); }
    const id = /^([a-zA-Z])(?:_\{?([0-9a-z,]+)\}?)?/.exec(rest);
    if (id) { this.i += id[0].length; return this.ident(id[2] ? `${id[1]}_${id[2]}` : id[1]); }
    throw new Error('таңба');
  }
  /** sin x, sin 2x, sin(x+1), sin{…} */
  unaryArg(): Fn {
    if (this.peek() === '(' || this.peek() === '{') return this.atom();
    // жақшасыз аргумент: көбейтінді (2x, xy) — келесі +/− дейін
    let f = this.power();
    while (this.startsFactor() && !this.s.startsWith('\\sin', this.i) && !this.s.startsWith('\\cos', this.i)) { const a = f, b = this.power(); f = (e) => a(e) * b(e); }
    return f;
  }
}

export interface Compiled { f: Fn; vars: string[] }
export function compile(latex: string): Compiled | null {
  const { s, deg } = normalize(latex);
  if (!s) return null;
  try {
    const c = new Compiler(s, deg);
    const f = c.expr();
    if (c.i !== s.length) return null;
    return { f, vars: [...c.vars] };
  } catch {
    return null;
  }
}

// ---------------- сандық құралдар ----------------
const EPS = 1e-6;
function safe(f: Fn, env: Env): number { try { const v = f(env); return Number.isFinite(v) ? v : NaN; } catch { return NaN; } }

/** f(v)=0 түбірлері [-60; 60] аралығында (таңба ауысуы + жанасу). >24 болса — шексіз деп есептеледі (null). */
export function rootsOf(f: Fn, v: string): number[] | null {
  const out: number[] = [];
  const lo = -60, hi = 60, step = 0.005;
  let px = lo, pv = safe(f, { [v]: lo });
  let ppv = NaN;
  const push = (r: number) => { const rr = Math.abs(r) < 1e-9 ? 0 : r; if (!out.some((o) => Math.abs(o - rr) < 1e-4)) out.push(rr); };
  for (let x = lo + step; x <= hi + 1e-9; x += step) {
    const cv = safe(f, { [v]: x });
    if (Number.isFinite(pv) && Number.isFinite(cv)) {
      if (pv === 0) push(px);
      else if (pv * cv < 0) {
        let a = px, b = x, fa = pv;
        for (let k = 0; k < 60; k++) { const m = (a + b) / 2, fm = safe(f, { [v]: m }); if (!Number.isFinite(fm)) break; if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
        const r = (a + b) / 2;
        if (Math.abs(safe(f, { [v]: r })) < 1e-5) push(r);   // полюс емес
      } else if (Number.isFinite(ppv) && Math.abs(pv) < Math.abs(ppv) && Math.abs(pv) <= Math.abs(cv) && Math.abs(pv) < 1e-3) {
        // жанасу (екі еселі түбір): |f| минимумын нақтылау
        let a = px - step, b = x;
        for (let k = 0; k < 80; k++) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (Math.abs(safe(f, { [v]: m1 })) < Math.abs(safe(f, { [v]: m2 }))) b = m2; else a = m1; }
        const r = (a + b) / 2;
        if (Math.abs(safe(f, { [v]: r })) < 1e-8) push(r);
      }
    }
    ppv = pv; px = x; pv = cv;
    if (out.length > 24) return null;
  }
  return out.sort((a, b) => a - b);
}

function identical(a: Fn, b: Fn, vars: string[]): boolean | null {
  let tested = 0;
  const pts = [0.37, 1.73, -2.21, 3.14, -0.58, 4.9, 0.91, -3.7, 2.6, 7.3];
  for (let k = 0; k < pts.length; k++) {
    const env: Env = {};
    vars.forEach((v, j) => { env[v] = pts[(k + j * 3) % pts.length] + j * 0.11; });
    const x = safe(a, env), y = safe(b, env);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    tested++;
    if (Math.abs(x - y) > 1e-7 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
  }
  return tested >= 3 ? true : null;
}

/** f — квадраттық көпмүше болса (a,b,c), әйтпесе null */
function quadCoeffs(f: Fn, v: string): [number, number, number] | null {
  const y0 = safe(f, { [v]: 0 }), y1 = safe(f, { [v]: 1 }), ym = safe(f, { [v]: -1 });
  if (![y0, y1, ym].every(Number.isFinite)) return null;
  const a = (y1 + ym) / 2 - y0, b = (y1 - ym) / 2, c = y0;
  for (const x of [2, -3, 0.5, 5]) if (Math.abs(safe(f, { [v]: x }) - (a * x * x + b * x + c)) > 1e-7 * Math.max(1, Math.abs(a * x * x))) return null;
  return Math.abs(a) > 1e-12 ? [a, b, c] : null;
}

const fmt = (r: number) => (Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : String(Math.round(r * 100) / 100).replace('.', ','));
const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.some((y) => Math.abs(x - y) < 1e-4));
const missing = (from: number[], inn: number[]) => from.filter((x) => !inn.some((y) => Math.abs(x - y) < 1e-4));

// ---------------- жолдарды тексеру ----------------
interface Eq { v: string; f: Fn; roots: number[] | null; quad: [number, number, number] | null }

/** Жолды барлық (жақшадан тыс) «=» белгілері бойынша бөлу */
function splitAllEq(line: string): string[] {
  const out: string[] = []; let rest = line;
  for (;;) { const [l, rel, r] = splitRel(rest); if (rel !== '=' || !l) { out.push(rest); return out; } out.push(l); rest = r; }
}

/** Бір жолдағы бірнеше түбірді бөлу: x=2; x=-3 · x_1=2, x_2=-3 · x=2 немесе x=-3 */
function splitClaims(line: string): string[] {
  return line.split(/;|\\text\{немесе\}|\\text\{ немесе \}|,(?=\s*[a-zA-Z](?:_\{?\d)?\s*=)/).map((x) => x.trim()).filter(Boolean);
}

export function checkLines(lines: string[]): StepCheck[] {
  const out = checkLinesRaw(lines);
  // оқушы өзі «жарамсыз / бөгде» деп белгілесе — ескерту орындалған
  return out.map((c, i) => (c.status === 'warn' && /жарамсыз|бөгде/.test(lines[i] ?? '') ? { status: 'ok' } : c));
}

function checkLinesRaw(lines: string[]): StepCheck[] {
  const res: StepCheck[] = [];
  let lastEq: Eq | null = null;          // соңғы бір айнымалылы теңдеу
  const eqByVar: Record<string, Eq> = {};
  let subst: { v: string; from: string; f: Fn } | null = null;   // t = √(x−2)
  let prevExpr: Compiled | null = null;  // тізбек үшін соңғы оң жақ

  for (const raw of lines) {
    const line = raw.replace(/\\text\{\s*немесе\s*\}/g, ';').replace(/\\text\{[^}]*\}/g, '').replace(/\\[ ,;:!]|\\quad/g, ' ').replace(/\(\s*\)/g, '').trim();
    if (!line) { res.push({ status: 'unknown' }); continue; }
    const [L, rel, R] = splitRel(line);

    // тізбек жолы: «= …»
    if (rel === '=' && !L) {
      const cr = compile(R);
      if (prevExpr && cr) {
        const vars = [...new Set([...prevExpr.vars, ...cr.vars])];
        const same = identical(prevExpr.f, cr.f, vars);
        res.push(same === null ? { status: 'unknown' } : same ? { status: 'ok' } : { status: 'error', reason: 'Түрлендіру қате: алдыңғы өрнекке тең емес' });
        prevExpr = cr;
      } else res.push({ status: 'unknown' });
      continue;
    }
    if (!rel) {
      const c = compile(line);
      prevExpr = c;
      res.push({ status: 'unknown' });
      continue;
    }
    if (rel !== '=') { res.push({ status: 'unknown' }); continue; }   // теңсіздік/⇒ — кейін

    // бір жолда бірнеше теңдік: D = 25 − 24 = 1, x₁ = (3+11)/4 = 3,5
    const chain = splitAllEq(line);
    if (chain.length > 2 && splitClaims(line).length === 1) {
      const tail = chain.slice(1).map(compile);
      if (tail.every((c) => c && c.vars.length === 0)) {
        const vals = tail.map((c) => safe(c!.f, {}));
        const badCalc = vals.some((x, k) => k > 0 && Math.abs(x - vals[k - 1]) > 1e-6 * Math.max(1, Math.abs(x)));
        if (badCalc) { res.push({ status: 'error', reason: 'Есептеу қатесі' }); continue; }
        res.push(checkClaim(`${chain[0]}=${chain[chain.length - 1]}`, eqByVar, subst, lastEq));
        continue;
      }
      if (chain.length > 2) {
        const cs = chain.map(compile);
        if (cs.every(Boolean)) {
          const vars = [...new Set(cs.flatMap((c) => c!.vars))];
          const ok = cs.slice(1).every((c, k) => identical(cs[k]!.f, c!.f, vars) !== false);
          res.push(ok ? { status: 'ok' } : { status: 'error', reason: 'Түрлендіру қате: тізбектегі өрнектер тең емес' });
          prevExpr = cs[cs.length - 1];
          continue;
        }
      }
    }

    // бір жолда бірнеше түбір (x=2; x=-3)
    const claims = splitClaims(line);
    if (claims.length > 1) {
      const sub = claims.map((c) => checkClaim(c, eqByVar, subst));
      const bad = sub.find((x) => x.status === 'error');
      res.push(bad ?? (sub.every((x) => x.status === 'ok') ? { status: 'ok' } : sub.find((x) => x.status === 'warn') ?? { status: 'unknown' }));
      continue;
    }

    const cl = compile(L), cr = compile(R);
    if (!cl || !cr) { res.push({ status: 'unknown' }); continue; }
    const vars = [...new Set([...cl.vars, ...cr.vars])];
    prevExpr = cr;

    // 1) сандық теңдік: 14^2-4·3·(-5)=256
    if (vars.length === 0) {
      const a = safe(cl.f, {}), b = safe(cr.f, {});
      res.push(!Number.isFinite(a) || !Number.isFinite(b) ? { status: 'unknown' } : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)) ? { status: 'ok' } : { status: 'error', reason: 'Есептеу қатесі' });
      continue;
    }

    // 2) мән немесе алмастыру: x=…, t=…, D=…
    const single = /^([a-zA-Z](?:_\{?[0-9a-z,]+\}?)?|\\(?:alpha|beta|varphi))$/.test(L);
    if (single) {
      const name = cl.vars[0];
      if (cr.vars.length === 0) { res.push(checkClaim(line, eqByVar, subst, lastEq)); continue; }
      if (cr.vars.length === 1 && cr.vars[0] !== name) {   // алмастыру t = √(x−2)
        subst = { v: name, from: cr.vars[0], f: cr.f };
        res.push({ status: 'ok' });
        continue;
      }
    }

    // 3) тепе-теңдік (екі жағы тең өрнектер): x^2-9=(x-3)(x+3)
    const id = identical(cl.f, cr.f, vars);
    if (id === true) { res.push({ status: 'ok' }); continue; }

    // 4) бір айнымалылы теңдеу: түбірлер жиынын алдыңғымен салыстыру
    if (vars.length !== 1) { res.push({ status: 'unknown' }); continue; }
    const v = vars[0];
    const f: Fn = (e) => cl.f(e) - cr.f(e);
    const roots = rootsOf(f, v);
    const eq: Eq = { v, f, roots, quad: quadCoeffs(f, v) };
    const prev = eqByVar[v] ?? null;
    let check: StepCheck = { status: 'unknown' };
    if (roots && prev?.roots) {
      const lost = missing(prev.roots, roots), extra = missing(roots, prev.roots);
      if (!lost.length && !extra.length) check = { status: 'ok' };
      else if (lost.length) check = { status: 'error', reason: `Түбір жоғалды: ${v} = ${lost.map(fmt).join('; ')}` };
      else check = { status: 'warn', reason: `Артық түбір пайда болды (${v} = ${extra.map(fmt).join('; ')}) — соңында тексеріңіз` };
    } else if (roots && subst && subst.v === v && eqByVar[subst.from]?.roots) {
      // алмастырудан кейінгі теңдеу: x түбірлерінен алынған t мәндері жаңа теңдеудің түбірі болуы керек
      const need = eqByVar[subst.from].roots!.map((x) => safe(subst!.f, { [subst!.from]: x })).filter(Number.isFinite);
      const lost = missing(need, roots);
      check = lost.length ? { status: 'error', reason: 'Алмастырудан кейінгі теңдеу қате' } : { status: 'ok' };
    } else if (roots && !prev && !lastEq) check = { status: 'ok' };      // бірінші теңдеу (шарттан)
    eqByVar[v] = eq; lastEq = eq;
    res.push(check);
  }
  return res;
}

function checkClaim(claim: string, eqByVar: Record<string, Eq>, subst: { v: string; from: string; f: Fn } | null, lastEq?: Eq | null): StepCheck {
  const [L, rel, R] = splitRel(claim);
  if (rel !== '=') return { status: 'unknown' };
  const cl = compile(L), cr = compile(R);
  if (!cl || !cr || cr.vars.length) return { status: 'unknown' };
  const name = cl.vars[0];
  if (!name) return { status: 'unknown' };
  const val = safe(cr.f, {});
  if (!Number.isFinite(val)) return { status: 'unknown' };
  if (name === 'D' && lastEq?.quad) {
    const [a, b, c] = lastEq.quad;
    const D = b * b - 4 * a * c;
    return Math.abs(val - D) <= 1e-6 * Math.max(1, Math.abs(D)) ? { status: 'ok' } : { status: 'error', reason: 'Дискриминант қате есептелген' };
  }
  const base = name.replace(/_.*/, '');
  const eq = eqByVar[name] ?? eqByVar[base];
  if (eq) {
    const fv = safe(eq.f, { [eq.v]: val });
    if (Number.isFinite(fv) && Math.abs(fv) < 1e-6 * Math.max(1, Math.abs(val) ** 2)) {
      // алмастырудың мәндер жиынына жата ма (t = √(x−2) ⇒ t ≥ 0)
      if (subst && subst.v === name) {
        let mn = Infinity, mx = -Infinity;
        for (let x = -60; x <= 60; x += 0.01) { const y = safe(subst.f, { [subst.from]: x }); if (Number.isFinite(y)) { mn = Math.min(mn, y); mx = Math.max(mx, y); } }
        if (val < mn - 1e-6 || val > mx + 1e-6) return { status: 'warn', reason: `Түбір дұрыс, бірақ ${name} = ${fmt(val)} алмастыру шартына сай емес — жарамсыз` };
      }
      return { status: 'ok' };
    }
    if (!Number.isFinite(fv)) return { status: 'warn', reason: 'Бұл мәнде өрнек анықталмаған (ММО) — бөгде түбір' };
    return { status: 'error', reason: 'Бұл мән теңдеуді қанағаттандырмайды' };
  }
  // алмастырудан кері: x табу (t = √(x−2), t=1/3 → x = 19/9)
  if (subst && subst.from === base) {
    const tEq = eqByVar[subst.v];
    if (tEq?.roots) {
      const tv = safe(subst.f, { [subst.from]: val });
      return tEq.roots.some((r) => Math.abs(r - tv) < 1e-6) ? { status: 'ok' } : { status: 'error', reason: 'Алмастыру бойынша кері мән қате' };
    }
  }
  return { status: 'unknown' };
}
