/**
 * ТЗ М4: БЖБ/ТЖБ/жаттығудан кейінгі кері байланыстың таза бөлігі (тестіленеді).
 * Әр тапсырма бойынша балл қою кестесінің қай жолы алынбағанын және себебін анықтайды.
 */
import { deriveMarkScheme, niceNumber, type MarkLine } from './rubric.ts';
import { gradeResponse, type ResponseValue } from './grading.ts';
import { checkLines } from './stepcheck.ts';
import type { AnswerKey, PublicBody, QuestionType, RubricLine } from './generator/types.ts';

export interface LostLine extends MarkLine { got: boolean; reason?: string }
export interface ItemLoss {
  lines: LostLine[];
  reasons: string[];   // тапсырма деңгейіндегі себептер
  lost: number;
}

const empty = (r: ResponseValue | null | undefined) =>
  !r || !(r.choice || r.choices?.length || r.value?.trim() || r.text?.trim() || r.steps?.some((s) => s.trim()) || Object.values(r.parts ?? {}).some((v) => String(v ?? '').trim()));

function showKey(type: QuestionType, body: PublicBody, key: AnswerKey): string {
  if (typeof key.value === 'number') return niceNumber(key.value);
  if (typeof key.correct === 'string') {
    const o = body.options?.find((x) => x.id === key.correct);
    return o ? `${key.correct}) ${o.text}` : key.correct;
  }
  if (Array.isArray(key.correct)) return key.correct.join(', ');
  if (key.accepted?.length) return key.accepted[0];
  return type === 'open' ? 'дескриптор бойынша' : '—';
}

function firstStepError(steps: string[] | undefined): string | null {
  if (!steps?.length) return null;
  const c = checkLines(steps);
  const i = c.findIndex((x) => x.status === 'error');
  return i < 0 ? null : `шешімнің ${i + 1}-жолында қате: ${c[i].reason ?? 'түрлендіру дұрыс емес'}`;
}

export function itemLoss(args: {
  type: QuestionType; body: PublicBody; key: AnswerKey; solutionText: string; rubric?: RubricLine[] | null;
  max: number; awarded: number | null; response: ResponseValue | null; hints: number; pending: boolean;
}): ItemLoss {
  const { type, body, key, solutionText, rubric, max, awarded, response, hints, pending } = args;
  const scheme = deriveMarkScheme(type, max, body, key ?? {}, solutionText ?? '', rubric);
  const reasons: string[] = [];
  if (pending) return { lines: scheme.map((l) => ({ ...l, got: false, reason: 'мұғалім тексеруде' })), reasons: ['Ашық жауап — мұғалім тексергеннен кейін жаңарады'], lost: 0 };
  const lost = Math.max(0, Math.round((max - (awarded ?? 0)) * 100) / 100);
  if (hints > 0) reasons.push(`💡 көмек ${hints} рет қолданылды: балдың ${Math.min(hints, 2) * 25}%-ы шегерілді`);
  if (empty(response)) {
    reasons.unshift('Жауап жазылмаған');
    return { lines: scheme.map((l) => ({ ...l, got: false, reason: 'жауап жоқ' })), reasons, lost };
  }

  // Бөліктері бар есеп: кесте жолдары бөліктерге сәйкес келсе — бөлік бойынша
  if (type === 'multipart' && key?.parts && body.parts?.length) {
    const partOk = new Map<string, boolean>();
    const partWhy = new Map<string, string>();
    for (const p of body.parts) {
      const pk = key.parts[p.label];
      if (!pk) continue;
      const m = key.part_marks?.[p.label] ?? p.marks;
      const raw = response?.parts?.[p.label];
      const g = gradeResponse('multipart', { parts: { [p.label]: pk }, part_marks: { [p.label]: m } }, { parts: { [p.label]: raw ?? '' } }, m);
      partOk.set(p.label, !!g.correct);
      if (!g.correct) {
        const opt = (id: string | undefined) => { const o = p.options?.find((x) => x.id === id); return o ? `${id}) ${o.text}` : String(id ?? '—'); };
        const right = typeof pk.value === 'number' ? niceNumber(pk.value) : opt(pk.correct);
        const mine = p.options?.length ? opt(raw) : /[\\^{}]/.test(raw ?? '') ? `$${raw}$` : raw;
        const step = firstStepError(response?.partSteps?.[p.label]);
        partWhy.set(p.label, !raw?.trim() ? 'жауап жазылмаған' : `сіздің жауабыңыз: ${mine}${scheme.length === body.parts!.length ? '' : `; дұрысы: ${right}`}${step ? `; ${step}` : ''}`);
      }
    }
    const byPart = scheme.length === body.parts.length;
    const lines: LostLine[] = scheme.map((l, i) => {
      const label = byPart ? body.parts![i].label : (/^([a-zа-я]\d?)\)/i.exec(l.text)?.[1] ?? '');
      const ok = partOk.get(label);
      if (ok === undefined) return { ...l, got: lost === 0 };
      return { ...l, got: ok, reason: ok ? undefined : partWhy.get(label) };
    });
    return { lines, reasons, lost };
  }

  // Бір жауапты есеп: жауап дұрыс болса — бәрі алынды (көмек айыппұлынан басқа)
  const g = gradeResponse(type, key ?? {}, response, max);
  if (g.correct) return { lines: scheme.map((l) => ({ ...l, got: true })), reasons, lost };
  const given = response?.value ?? response?.choice ?? response?.choices?.join(', ') ?? response?.text ?? '';
  const why = `сіздің жауабыңыз: ${/[\\^{}]/.test(given) ? `$${given}$` : given || '—'}; дұрысы: ${showKey(type, body, key ?? {})}`;
  const step = firstStepError(response?.steps);
  reasons.unshift(step ? `${why}. Алғашқы қате: ${step.replace(/^шешімнің /, '')}` : why);
  if (!step && !response?.steps?.length && max > 1) reasons.push('Шешім жолы жазылмаған — қай қадамда қателескеніңізді анықтау үшін келесіде шешімді жол-жолымен жазыңыз');
  return { lines: scheme.map((l) => ({ ...l, got: false })), reasons, lost };
}
