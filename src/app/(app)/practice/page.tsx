import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getUnits } from '@/lib/catalog';
import { createAdminClient } from '@/lib/supabase/admin';
import { PracticeForm, type TzhbSpec } from './PracticeForm';

export const metadata: Metadata = { title: 'БЖБ/ТЖБ дайындығы' };

export default async function PracticePage() {
  const profile = await requireUser();
  const units = await getUnits();
  // ТЖБ спецификациялары (тек оқу: атауы, тоқсан, тапсырма құрылымы — кілттер жоқ)
  const { data: bps } = await createAdminClient()
    .from('exam_blueprints')
    .select('grade, component, title, duration_min, total_marks, distribution_json')
    .eq('exam_type', 'TZhB')
    .eq('is_active', true);
  const specs: TzhbSpec[] = (bps ?? []).map((b) => ({
    grade: b.grade as number,
    term: Number(String(b.component ?? 'Q0').slice(1)) || 0,
    title: b.title as string,
    duration: (b.duration_min as number) ?? 80,
    total: Number(b.total_marks ?? 0),
    tasks: ((b.distribution_json ?? []) as { no: string; marks: number; title?: string }[]).map((t) => ({ no: t.no, marks: t.marks, title: t.title ?? '' })),
  }));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">БЖБ / ТЖБ дайындығы</h1>
      <p className="text-slate-600">БЖБ — параметрлерді өзіңіз таңдайсыз. ТЖБ — спецификация бойынша 35 балдық нұсқа: құрылымы тұрақты, есептері әр жолы кездейсоқ ауысады.</p>
      <p className="text-sm"><a href="/objectives" className="text-blue-600 underline">Оқу мақсаты бойынша бейімделетін дайындық →</a></p>
      <PracticeForm units={units.map(({ id, grade, term, title }) => ({ id, grade, term, title }))} defaultGrade={profile.current_grade ?? 7} specs={specs} />
    </div>
  );
}
