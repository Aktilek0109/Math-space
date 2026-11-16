/**
 * Балл қою кестесі: әр балл НЕ ҮШІН берілетіні.
 * Есептің өз дескрипторы (rubric_json) болса — сол; болмаса шешімнен шығарылады:
 *  - бөліктері бар есеп: әр бөлік → «не табу керек + дұрыс мәні» және оның балы;
 *  - бір жауапты есеп: шешімнің негізгі қадамдары (M1 — әдіс/аралық нәтиже) және соңғы жауап (A1).
 * Таза функция: серверде де, клиентте де қолданылады.
 */
import type { AnswerKey, PublicBody, QuestionType, RubricLine } from './generator/types';

export interface MarkLine {
  code: string;      // M1, A1, B1 ...
  text: string;      // MathText-ке берілетін мәтін ($...$ формулалармен)
  marks: number;
}

/** Ондық санды мүмкін болса жай бөлшекке: 0.4166 → $\frac{5}{12}$ */
export function niceNumber(v: number): string {
  if (Number.isInteger(v)) return `$${v}$`;
  for (let q = 2; q <= 60; q++) {
    const p = Math.round(v * q);
    if (Math.abs(p / q - v) < 1e-6) {
      const g = gcd(Math.abs(p), q);
      const [a, b] = [p / g, q / g];
      if (b === 1) return `$${a}$`;
      return `$${a < 0 ? '-' : ''}\\frac{${Math.abs(a)}}{${b}}$`;
    }
  }
  return `$${String(Math.round(v * 1000) / 1000).replace('.', '{,}')}$`;
}
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

/** Шешім мәтінінен формулалық қадамдарды шығару (тек 1-тәсіл). */
export function solutionSteps(text: string): string[] {
  let t = text;
  const second = t.search(/\n\s*2-тәсіл/);
  if (second > 0) t = t.slice(0, second);
  t = t.replace(/Жауабы:[\s\S]*$/, '');
  const steps: string[] = [];
  const re = /\$\$([\s\S]+?)\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const body = m[1].trim();
    const al = /\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/.exec(body);
    if (al) {
      for (const line of al[1].split('\\\\')) {
        const s = line.replace(/&/g, '').replace(/^\{\}/, '').trim();
        if (s) steps.push(s);
      }
    } else {
      // тізбек a=b=c=d → a=b, a=c, a=d (әрқайсысы — жеке қадам)
      const parts = splitTop(body, '=');
      if (parts.length >= 3) for (let i = 1; i < parts.length; i++) steps.push(`${parts[0]}=${parts[i]}`);
      else steps.push(body);
    }
  }
  return steps;
}

/** Жақша/фигуралы жақша ішінде емес таңба бойынша бөлу. */
function splitTop(s: string, ch: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    if (c === ch && depth === 0 && s[i - 1] !== '\\') { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

function answerLine(text: string): string | null {
  const m = /Жауабы:\s*([^\n]+)/.exec(text);
  return m ? m[1].trim().replace(/\.$/, '') : null;
}

/** Қадамның не істейтінін қысқа сипаттау (дескриптор мәтіні). */
export function describeStep(s: string, first: boolean): string {
  if (/^D\s*=/.test(s)) return 'Дискриминантты есептейді';
  if (/x_1\s*\+\s*x_2|x_1x_2|x_1\^\d\s*\+\s*x_2|\\alpha\+\\beta|\\alpha\\beta/.test(s)) return 'Виет теоремасын қолданады';
  if (/x_\{1,2\}|t_\{1,2\}|x_1\s*&?=|^[xtvn]\s*=[^=]*;/.test(s)) return 'Түбірлерін табады';
  if (/бөгде|жарамсыз/.test(s)) return 'Түбірлерді ММО бойынша іріктейді';
  if (/[a-z]\^2.*=\s*0$/.test(s)) return 'Квадрат теңдеуге келтіреді';
  if (/\\smile|\\angle/.test(s)) return 'Бұрыш пен доға қасиетін қолданады';
  if (/\\le|\\ge|<|>/.test(s)) return 'Теңсіздікті дұрыс түрлендіреді';
  if (/\\sin|\\cos|\\operatorname\{c?tg\}/.test(s)) return first ? 'Тригонометриялық формуланы / анықтаманы қолданады' : 'Тригонометриялық өрнектің мәнін табады';
  if (/\\sqrt/.test(s)) return first ? 'Пифагор теоремасын / формуланы қолданады' : 'Ұзындықты есептейді';
  return first ? 'Теңдеу (формула) құрады' : 'Аралық нәтижені дұрыс табады';
}

function pickEvenly<T>(arr: T[], k: number): T[] {
  if (k <= 0) return [];
  if (arr.length <= k) return arr;
  if (k === 1) return [arr[arr.length - 1]];
  const out: T[] = [];
  for (let i = 0; i < k; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (k - 1))]);
  return out;
}

export function deriveMarkScheme(
  type: QuestionType,
  maxMarks: number,
  body: PublicBody,
  answer: AnswerKey,
  solutionText: string,
  rubric?: RubricLine[] | null,
): MarkLine[] {
  if (rubric && rubric.length) {
    return rubric.map((r) => {
      const m = /^([MABC]\d)\s*[:·—-]\s*(.*)$/.exec(r.descriptor);
      return m ? { code: m[1], text: m[2], marks: Number(r.marks) } : { code: `B${r.marks}`, text: r.descriptor, marks: Number(r.marks) };
    });
  }

  // Бөліктері бар есеп: әр бөлік — жеке балл
  if (type === 'multipart' && body.parts?.length && answer.parts) {
    return body.parts.map((p) => {
      const k = answer.parts![p.label] ?? {};
      let val = '';
      if (k.correct !== undefined) {
        const opt = p.options?.find((o) => o.id === k.correct);
        val = opt ? `${k.correct}) ${opt.text}` : String(k.correct);
      } else if (typeof k.value === 'number') {
        val = niceNumber(k.value);
      }
      const marks = answer.part_marks?.[p.label] ?? p.marks;
      const what = p.text.replace(/[:?]\s*$/, '').trim();
      return { code: `B${marks}`, text: `${p.label}) ${what}: ${val}`, marks };
    });
  }

  // Бір жауапты есеп
  let ansText = answerLine(solutionText);
  if (!ansText) {
    if (typeof answer.value === 'number') ansText = niceNumber(answer.value);
    else if (typeof answer.correct === 'string') {
      const opt = body.options?.find((o) => o.id === answer.correct);
      ansText = opt ? `${answer.correct}) ${opt.text}` : answer.correct;
    } else ansText = 'дұрыс жауап';
  }
  if (type === 'single' && typeof answer.correct === 'string') {
    const opt = body.options?.find((o) => o.id === answer.correct);
    if (opt) ansText = `${answer.correct}) ${opt.text}`;
  }
  if (maxMarks <= 1) return [{ code: 'A1', text: `Дұрыс жауап: ${ansText}`, marks: maxMarks }];

  const steps = solutionSteps(solutionText);
  const inner = steps.length > 1 ? steps.slice(0, -1) : steps;
  const chosen = pickEvenly(inner, maxMarks - 1);
  let prev = '';
  const lines: MarkLine[] = chosen.map((s, i) => {
    let d = describeStep(s, i === 0);
    if (d === prev) d = 'Мәндерді қойып есептейді';
    prev = d;
    return { code: 'M1', text: `${d}: $${s}$`, marks: 1 };
  });
  const rest = maxMarks - lines.length;
  lines.push({ code: `A${rest}`, text: `Дұрыс жауап: ${ansText}`, marks: rest });
  return lines;
}
