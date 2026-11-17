import type { AnswerKey, QuestionType } from './generator/types.ts';

export type MarkingState = 'auto' | 'pending' | 'manual' | 'self';
import { evalLatexNumber } from './latexnum.ts';

export interface ResponseValue {
  choice?: string;      // single
  choices?: string[];   // multi
  value?: string;       // numeric / short
  text?: string;        // open
  parts?: Record<string, string>;
  /** Калькулятордағы шешім жолдары (LaTeX) */
  steps?: string[];
  partSteps?: Record<string, string[]>;
  /** М6–М8: тақтадағы сызба (графиктік/геометриялық/3D) */
  sketch?: import('./tools/types.ts').Sketch;
}

export interface GradeOutcome {
  awarded: number | null;
  state: MarkingState;
  correct: boolean | null;
}

/** "3,5" → 3.5; "-7/2" → -3.5; бос/жарамсыз → null */
export function parseNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  // Калькулятордан келген LaTeX жауап (2\frac19, \frac{2\sqrt{13}}{13}, x=0{,}5)
  if (/[\\{}=^]/.test(raw)) return evalLatexNumber(raw);
  const s = raw.trim().replace(/\s+/g, '').replace(',', '.').replace('−', '-');
  if (s === '') return null;
  const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  return Number(s);
}

const normalizeText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(',', '.');

/** Серверлік тексеру (6-бөлім, 7-қадам). Ашық есептер pending-ке түседі. */
export function gradeResponse(
  type: QuestionType,
  key: AnswerKey,
  response: ResponseValue | null | undefined,
  maxMarks: number,
): GradeOutcome {
  const r = response ?? {};
  switch (type) {
    case 'single': {
      const ok = !!r.choice && r.choice === key.correct;
      return { awarded: ok ? maxMarks : 0, state: 'auto', correct: ok };
    }
    case 'multi': {
      const expected = new Set(Array.isArray(key.correct) ? key.correct : []);
      const given = new Set(r.choices ?? []);
      const ok = expected.size > 0 && expected.size === given.size && [...expected].every((c) => given.has(c));
      return { awarded: ok ? maxMarks : 0, state: 'auto', correct: ok };
    }
    case 'numeric': {
      const v = parseNumber(r.value);
      const tol = Math.max(key.tolerance ?? 0, 1e-9);
      const ok = v !== null && typeof key.value === 'number' && Math.abs(v - key.value) <= tol;
      return { awarded: ok ? maxMarks : 0, state: 'auto', correct: ok };
    }
    case 'short': {
      const accepted = (key.accepted ?? []).map(normalizeText);
      const ok = !!r.value && accepted.includes(normalizeText(r.value));
      return { awarded: ok ? maxMarks : 0, state: 'auto', correct: ok };
    }
    case 'multipart': {
      // Әр бөліктің кілті болса — автоматты, бөлік бойынша жартылай ұпай. Кілті жоқ болса — мұғалімге.
      if (!key.parts || !Object.keys(key.parts).length) return { awarded: null, state: 'pending', correct: null };
      const given = r.parts ?? {};
      const labels = Object.keys(key.parts);
      const partMarks = key.part_marks ?? {};
      let awarded = 0, all = true;
      for (const label of labels) {
        const pk = key.parts[label];
        const raw = given[label];
        let ok = false;
        if (pk.correct !== undefined) ok = !!raw && raw === pk.correct;
        else if (typeof pk.value === 'number') {
          const v = parseNumber(raw);
          ok = v !== null && Math.abs(v - pk.value) <= Math.max(pk.tolerance ?? 0, 1e-9);
        }
        if (ok) awarded += partMarks[label] ?? maxMarks / labels.length;
        else all = false;
      }
      return { awarded: Math.min(maxMarks, Math.round(awarded * 100) / 100), state: 'auto', correct: all };
    }
    case 'open':
    default:
      return { awarded: null, state: 'pending', correct: null };
  }
}
