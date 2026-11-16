/**
 * Калькулятор жолдарымен жұмыс: LaTeX → сан, жолды қатынас белгісі бойынша бөлу, соңғы жауапты алу.
 * Тәуелділіксіз (серверде де, клиентте де жұмыс істейді).
 */

const REL_RE = /\\Leftrightarrow|\\Rightarrow|\\iff|\\implies|\\leqslant|\\geqslant|\\le(?![a-zA-Z])|\\ge(?![a-zA-Z])|\\leq|\\geq|\\ne(?![a-zA-Z])|\\neq|\\approx|=|<|>/y;

/** Жолды бірінші (жақшадан тыс) қатынас белгісі бойынша үшке бөледі: [сол жақ, белгі, оң жақ]. Белгі жоқ болса — [ '', '', жол ]. */
export function splitRel(latex: string): [string, string, string] {
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    const ch = latex[i];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (depth === 0) {
      if (latex.startsWith('\\left', i) || latex.startsWith('\\right', i)) continue;
      REL_RE.lastIndex = i;
      const m = REL_RE.exec(latex);
      if (m && m.index === i) return [latex.slice(0, i).trim(), m[0], latex.slice(i + m[0].length).trim()];
    }
  }
  return ['', '', latex.trim()];
}

/** Соңғы жолдан жауапты алады: соңғы қатынас белгісінен кейінгі бөлік (x = 2\frac19 → 2\frac19). */
export function answerFromLines(lines: string[]): string {
  const last = [...lines].reverse().find((l) => l.trim() !== '') ?? '';
  let rest = last;
  for (;;) {
    const [l, rel, r] = splitRel(rest);
    if (!rel || !l) return rest.trim();
    rest = r;
  }
}

function normalize(src: string): string {
  return src
    .replace(/\\left|\\right/g, '')
    .replace(/\\[,;:!]|\\quad|\\qquad|~/g, '')
    .replace(/\\text\{[^}]*\}/g, '')
    .replace(/\{,\}/g, '.')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/−/g, '-')
    .replace(/\\cdot|\\times|·|×/g, '*')
    .replace(/\\div|÷|:/g, '/')
    .replace(/\\dfrac|\\tfrac/g, '\\frac')
    .replace(/\^\{?\\circ\}?|°/g, '')
    .replace(/\s+/g, '');
}

class P {
  i = 0;
  s: string;
  constructor(s: string) { this.s = s; }
  peek() { return this.s[this.i]; }
  eat(t: string) { if (this.s.startsWith(t, this.i)) { this.i += t.length; return true; } return false; }
  done() { return this.i >= this.s.length; }
  group(): number {
    if (this.eat('{')) { const v = this.expr(); if (!this.eat('}')) throw new Error('}'); return v; }
    const ch = this.peek();
    if (ch && /\d/.test(ch)) { this.i++; return Number(ch); }   // \frac12, \sqrt3
    return this.atom();
  }
  expr(): number {
    let v = this.term();
    for (;;) {
      if (this.eat('+')) v += this.term();
      else if (this.eat('-')) v -= this.term();
      else return v;
    }
  }
  term(): number {
    let v = this.unary();
    for (;;) {
      if (this.eat('*')) v *= this.unary();
      else if (this.eat('/')) v /= this.unary();
      else if (this.startsFactor()) {
        // аралас сан: 2\frac{1}{9} = 2 + 1/9 (тек бүтін сан мен сандық бөлшек қатар тұрса)
        if (this.s.startsWith('\\frac', this.i) && this.lastWasInt) {
          const save = this.i;
          const f = this.power();
          if (this.mixedOk) { v = v < 0 ? v - f : v + f; continue; }
          this.i = save;
        }
        v *= this.unary();
      } else return v;
    }
  }
  lastWasInt = false;
  mixedOk = false;
  startsFactor() {
    const ch = this.peek();
    return !!ch && (/[\d.(\\{]/.test(ch) && !this.s.startsWith('\\right', this.i));
  }
  unary(): number {
    if (this.eat('-')) return -this.unary();
    if (this.eat('+')) return this.unary();
    return this.power();
  }
  power(): number {
    let v = this.atom();
    while (this.eat('^')) {
      const e = this.peek() === '{' ? this.group() : this.atomNoInt();
      v = Math.pow(v, e);
    }
    return v;
  }
  atomNoInt(): number {
    const ch = this.peek();
    if (ch && /\d/.test(ch)) { this.i++; return Number(ch); }
    return this.atom();
  }
  atom(): number {
    this.mixedOk = false;
    const start = this.i;
    const num = /^\d+(?:\.\d+)?|^\.\d+/.exec(this.s.slice(this.i));
    if (num) { this.i += num[0].length; this.lastWasInt = !num[0].includes('.'); return Number(num[0]); }
    this.lastWasInt = false;
    if (this.eat('(')) { const v = this.expr(); if (!this.eat(')')) throw new Error(')'); return v; }
    if (this.eat('{')) { const v = this.expr(); if (!this.eat('}')) throw new Error('}'); return v; }
    if (this.eat('\\frac')) {
      const a0 = this.i; const a = this.group(); const numIsInt = /^\{?\d+\}?$/.test(this.s.slice(a0, this.i));
      const b0 = this.i; const b = this.group(); const denIsInt = /^\{?\d+\}?$/.test(this.s.slice(b0, this.i));
      this.mixedOk = numIsInt && denIsInt;
      return a / b;
    }
    if (this.eat('\\sqrt')) {
      let n = 2;
      if (this.eat('[')) { n = this.expr(); if (!this.eat(']')) throw new Error(']'); }
      const v = this.group();
      return n === 2 ? Math.sqrt(v) : (v < 0 && n % 2 === 1 ? -Math.pow(-v, 1 / n) : Math.pow(v, 1 / n));
    }
    if (this.eat('\\pi') || this.eat('π')) return Math.PI;
    if (this.eat('|')) { const v = this.expr(); if (!this.eat('|')) throw new Error('|'); return Math.abs(v); }
    throw new Error('таңба: ' + this.s.slice(start, start + 6));
  }
}

/** LaTeX сандық өрнегін есептейді (2\frac19, \frac{2\sqrt{13}}{13}, 0{,}5, -\frac{\pi}{6}); болмаса null. */
export function evalLatexNumber(latex: string | null | undefined): number | null {
  if (latex == null) return null;
  const s = normalize(answerFromLines([latex]));
  if (!s || /[a-zA-Z]/.test(s.replace(/\\(frac|sqrt|pi)/g, ''))) return null;
  try {
    const p = new P(s);
    const v = p.expr();
    if (!p.done() || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}
