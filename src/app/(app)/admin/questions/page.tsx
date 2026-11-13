import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getUnits } from '@/lib/catalog';
import { MathText } from '@/components/MathText';
import { QuestionForm } from './QuestionForm';

export const metadata: Metadata = { title: 'Есептер банкі' };

export default async function AdminQuestions({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const sp = await searchParams;
  await requireRole(['teacher', 'admin']);
  const supabase = await createClient();
  const units = await getUnits();
  let q = supabase.from('questions').select('id, grade, body_json, question_type, marks, status, exam_types, component').order('created_at', { ascending: false }).limit(50);
  if (sp.grade) q = q.eq('grade', Number(sp.grade));
  const { data: questions } = await q;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
      <section className="space-y-2">
        <h1 className="text-xl font-semibold">Есептер банкі (соңғы 50)</h1>
        {(questions ?? []).map((qq) => (
          <article key={qq.id} className="card space-y-1 text-sm">
            <div className="flex flex-wrap gap-1">
              <span className="chip">{qq.grade}-сынып</span>
              <span className="chip">{qq.question_type}</span>
              <span className="chip">{Number(qq.marks)} ұпай</span>
              <span className="chip">{qq.status}</span>
              {(qq.exam_types as string[]).map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
            <MathText text={(qq.body_json as { text: string }).text} className="block" />
          </article>
        ))}
      </section>
      <aside>
        <h2 className="mb-2 font-semibold">Жаңа есеп</h2>
        <QuestionForm units={units.map((u) => ({ id: u.id, grade: u.grade, title: u.title, topics: u.topics.map((t) => ({ id: t.id, title: t.title })) }))} />
      </aside>
    </div>
  );
}
