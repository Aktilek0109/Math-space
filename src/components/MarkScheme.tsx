import { MathText } from '@/components/MathText';
import { deriveMarkScheme } from '@/lib/rubric';
import type { AnswerKey, PublicBody, QuestionType, RubricLine } from '@/lib/generator/types';

/** «Балл қою кестесі»: әр балл не үшін берілетіні (дескриптор). */
export function MarkScheme({
  type, maxMarks, body, answer, solutionText, rubric,
}: { type: QuestionType; maxMarks: number; body: PublicBody; answer: AnswerKey; solutionText: string; rubric?: RubricLine[] | null }) {
  const lines = deriveMarkScheme(type, maxMarks, body, answer ?? {}, solutionText ?? '', rubric);
  if (!lines.length) return null;
  const total = lines.reduce((s, l) => s + l.marks, 0);
  return (
    <div className="mt-2 overflow-x-auto">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Балл қою кестесі</p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-1 pr-2 font-medium">Не үшін</th>
            <th className="w-14 py-1 pr-2 font-medium">Код</th>
            <th className="w-14 py-1 text-right font-medium">Балл</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-100 align-top">
              <td className="py-1 pr-2"><MathText text={l.text} /></td>
              <td className="py-1 pr-2 font-mono text-xs text-slate-600">{l.code}</td>
              <td className="py-1 text-right">{l.marks}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="py-1 pr-2">Барлығы</td>
            <td />
            <td className="py-1 text-right">{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
