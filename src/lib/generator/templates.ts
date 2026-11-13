import type { GeneratedItem, Template } from './types.ts';
import { linearTerm, polynomial } from './format.ts';

/** 7-сынып: ax + b = c, шешімі бүтін сан. */
const linearEquation: Template = {
  key: 'linear-equation',
  version: 1,
  title: 'ax + b = c сызықтық теңдеуі',
  grade: 7,
  generate(rng) {
    const a = rng.pick([-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]);
    const x = rng.int(-12, 12);
    let b = rng.int(-20, 20);
    if (b === 0) b = 5;
    const c = a * x + b;
    const lhs = linearTerm(a, 'x', true) + linearTerm(b, '', false);
    return {
      questionType: 'numeric',
      body: { text: `Теңдеуді шешіңіз: $${lhs} = ${c}$` },
      answer: { value: x, tolerance: 0 },
      solution: {
        text: `$${linearTerm(a, 'x', true)} = ${c} ${b < 0 ? '+' : '-'} ${Math.abs(b)} = ${c - b}$, сондықтан $x = \\frac{${c - b}}{${a}} = ${x}$`,
      },
      rubric: [
        { descriptor: 'Бос мүшені теңдіктің екінші жағына көшіреді', marks: 1 },
        { descriptor: 'x-тің дұрыс мәнін табады', marks: 1 },
      ],
      marks: 2,
      difficulty: Math.abs(a) > 5 || x < 0 ? 2 : 1,
      params: { a, b, c, x },
    };
  },
  validate(item) {
    const { a, b, c, x } = item.params as Record<string, number>;
    const errors: string[] = [];
    if (a === 0) errors.push('a = 0');
    if (!Number.isInteger(x)) errors.push('x бүтін емес');
    if (a * x + b !== c) errors.push('a·x + b ≠ c');
    if ((c - b) / a !== item.answer.value) errors.push('кілт шешімге сәйкес емес');
    if (Math.abs(c) > 200) errors.push('c тым үлкен (оқылымдылық)');
    return errors;
  },
};

/** 7-сынып: дәреже қасиеттері, бір дұрыс жауап. */
const powerRules: Template = {
  key: 'power-rules',
  version: 1,
  title: 'Дәреже қасиеттері',
  grade: 7,
  generate(rng) {
    const op = rng.pick(['mul', 'div', 'pow'] as const);
    const v = rng.pick(['a', 'b', 'x', 'y']);
    let m = rng.int(2, 9);
    let n = rng.int(2, 9);
    if (op === 'div' && m <= n) [m, n] = [n + 1, m];
    const expr =
      op === 'mul' ? `${v}^{${m}} \\cdot ${v}^{${n}}` : op === 'div' ? `${v}^{${m}} : ${v}^{${n}}` : `(${v}^{${m}})^{${n}}`;
    const correctExp = op === 'mul' ? m + n : op === 'div' ? m - n : m * n;
    const candidates = [m + n, m * n, m - n, m + n + 1, m * n - 1, Math.abs(m - n) + 1, m, n].filter(
      (e) => e !== correctExp && e > 0,
    );
    const distractors = [...new Set(candidates)].slice(0, 3);
    const exps = rng.shuffle([correctExp, ...distractors]);
    const ids = ['a', 'b', 'c', 'd'];
    const options = exps.map((e, i) => ({ id: ids[i], text: `$${v}^{${e}}$` }));
    const correctId = ids[exps.indexOf(correctExp)];
    const rule = op === 'mul' ? 'көрсеткіштер қосылады' : op === 'div' ? 'көрсеткіштер азайтылады' : 'көрсеткіштер көбейтіледі';
    return {
      questionType: 'single',
      body: { text: `Өрнекті дәреже түрінде жазыңыз: $${expr}$`, options },
      answer: { correct: correctId },
      solution: { text: `Дәреже қасиеті бойынша ${rule}: $${expr} = ${v}^{${correctExp}}$` },
      rubric: [{ descriptor: 'Дәреже қасиетін дұрыс қолданады', marks: 1 }],
      marks: 1,
      difficulty: op === 'pow' ? 2 : 1,
      params: { op, m, n, correctExp, v },
    };
  },
  validate(item) {
    const errors: string[] = [];
    const opts = item.body.options ?? [];
    if (opts.length !== 4) errors.push('4 нұсқа болуы керек');
    if (new Set(opts.map((o) => o.text)).size !== opts.length) errors.push('нұсқалар қайталанады');
    const correct = opts.filter((o) => o.id === item.answer.correct);
    if (correct.length !== 1) errors.push('дұрыс нұсқа дәл біреу емес');
    const { op, m, n, correctExp, v } = item.params as { op: string; m: number; n: number; correctExp: number; v: string };
    const expected = op === 'mul' ? m + n : op === 'div' ? m - n : m * n;
    if (expected !== correctExp || expected <= 0) errors.push('дұрыс көрсеткіш қате');
    if (correct[0] && correct[0].text !== `$${v}^{${expected}}$`) errors.push('кілт нұсқаға сәйкес емес');
    return errors;
  },
};

/** 10-сынып: көпмүшенің нүктедегі туындысы. */
const derivativeAtPoint: Template = {
  key: 'derivative-at-point',
  version: 1,
  title: "f'(x₀) — көпмүшенің туындысы",
  grade: 10,
  generate(rng) {
    let p = rng.int(-3, 3);
    if (p === 0) p = 1;
    const q = rng.int(-5, 5);
    const r = rng.int(-9, 9);
    const s = rng.int(-9, 9);
    const x0 = rng.pick([-3, -2, -1, 1, 2, 3]);
    const value = 3 * p * x0 * x0 + 2 * q * x0 + r;
    const f = polynomial([[p, 'x^3'], [q, 'x^2'], [r, 'x'], [s, '']]);
    const df = polynomial([[3 * p, 'x^2'], [2 * q, 'x'], [r, '']]);
    return {
      questionType: 'numeric',
      body: { text: `$f(x) = ${f}$ болса, $f'(${x0})$ мәнін табыңыз.` },
      answer: { value, tolerance: 0 },
      solution: { text: `$f'(x) = ${df}$, сондықтан $f'(${x0}) = ${value}$` },
      rubric: [
        { descriptor: 'Туындыны дұрыс табады', marks: 1 },
        { descriptor: 'Нүктедегі мәнін есептейді', marks: 1 },
      ],
      marks: 2,
      difficulty: Math.abs(x0) > 2 ? 2 : 1,
      params: { p, q, r, s, x0 },
    };
  },
  validate(item) {
    const { p, q, r, x0 } = item.params as Record<string, number>;
    const errors: string[] = [];
    if (p === 0) errors.push('көпмүше 3-дәрежелі емес');
    // Сандық туындымен тәуелсіз тексеру
    const f = (x: number) => p * x ** 3 + q * x ** 2 + r * x;
    const h = 1e-5;
    const numeric = (f(x0 + h) - f(x0 - h)) / (2 * h);
    if (Math.abs(numeric - (item.answer.value ?? NaN)) > 1e-4) errors.push('кілт сандық туындыға сәйкес емес');
    return errors;
  },
};

/** 10-сынып: log_b(x + d) = k. */
const logEquation: Template = {
  key: 'log-equation',
  version: 1,
  title: 'Қарапайым логарифмдік теңдеу',
  grade: 10,
  generate(rng) {
    const b = rng.pick([2, 3, 5, 10]);
    const maxK = b === 2 ? 6 : b === 3 ? 4 : 3;
    const k = rng.int(1, maxK);
    const d = rng.int(-9, 9);
    const x = b ** k - d;
    const arg = d === 0 ? 'x' : `x ${d > 0 ? '+' : '-'} ${Math.abs(d)}`;
    const logTex = b === 10 ? `\\lg(${arg})` : `\\log_{${b}}(${arg})`;
    return {
      questionType: 'numeric',
      body: { text: `Теңдеуді шешіңіз: $${logTex} = ${k}$` },
      answer: { value: x, tolerance: 0 },
      solution: {
        text: `Анықтама бойынша $${arg} = ${b}^{${k}} = ${b ** k}$, демек $x = ${x}$. Тексеру: $${arg} > 0$ орындалады.`,
      },
      rubric: [
        { descriptor: 'Логарифм анықтамасын қолданады', marks: 1 },
        { descriptor: 'Түбірді тауып, анықталу облысын тексереді', marks: 1 },
      ],
      marks: 2,
      difficulty: d === 0 ? 1 : 2,
      params: { b, k, d, x },
    };
  },
  validate(item) {
    const { b, k, d, x } = item.params as Record<string, number>;
    const errors: string[] = [];
    if (x + d <= 0) errors.push('логарифм аргументі оң емес');
    if (Math.abs(Math.log(x + d) / Math.log(b) - k) > 1e-9) errors.push('log_b(x+d) ≠ k');
    if (item.answer.value !== x) errors.push('кілт сәйкес емес');
    return errors;
  },
};

export const TEMPLATES: Record<string, Template> = Object.fromEntries(
  [linearEquation, powerRules, derivativeAtPoint, logEquation].map((t) => [t.key, t]),
);

export function getTemplate(key: string): Template | undefined {
  return TEMPLATES[key];
}

export type { GeneratedItem };
