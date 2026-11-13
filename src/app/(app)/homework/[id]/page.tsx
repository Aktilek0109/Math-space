import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDue, isLate } from '@/lib/homework';
import { SubmitWork } from './SubmitWork';

export default async function HomeworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: a } = await supabase
    .from('assignments')
    .select('id, title, description, grade, due_at, max_score, material_id, materials(title)')
    .eq('id', id)
    .maybeSingle();
  if (!a) notFound();
  const { data: s } = await supabase
    .from('submissions')
    .select('id, submitted_at, comment, score, feedback, graded_at, submission_files(id, original_name, mime_type, position)')
    .eq('assignment_id', id)
    .eq('student_id', profile.id)
    .maybeSingle();
  const files = [...((s?.submission_files ?? []) as { id: string; original_name: string; mime_type: string; position: number }[])].sort((x, y) => x.position - y.position);
  const material = a.materials as unknown as { title: string } | null;

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <Link href="/homework" className="text-sm text-brand-600 hover:underline">← Үй жұмыстары</Link>
      <header className="card space-y-2">
        <h1 className="text-xl font-semibold">{a.title}</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="chip">{a.grade}-сынып</span>
          <span className="chip">Мерзімі: {fmtDue(a.due_at)}</span>
          <span className="chip">Ең жоғары баға: {Number(a.max_score)}</span>
        </div>
        {a.description && <p className="whitespace-pre-wrap text-slate-700">{a.description}</p>}
        {a.material_id && material && (
          <Link href={`/library/${a.material_id}`} className="btn btn-secondary">📄 {material.title}</Link>
        )}
      </header>

      {s?.graded_at && (
        <section className="card border-green-300 bg-green-50">
          <h2 className="font-semibold">Мұғалімнің бағасы</h2>
          {s.score != null && <div className="mt-1 text-2xl font-semibold">{Number(s.score)} / {Number(a.max_score)}</div>}
          {s.feedback && <p className="mt-1 whitespace-pre-wrap">{s.feedback}</p>}
        </section>
      )}

      {isStaff(profile) ? (
        <div className="card text-sm text-slate-600">
          Бұл — оқушы көретін бет. Жұмыстарды көру және бағалау: <Link className="underline" href={`/admin/homework/${a.id}`}>тапсырма бетінде</Link>.
        </div>
      ) : (
        <section className="card space-y-3">
          <h2 className="font-semibold">Менің жұмысым</h2>
          {s?.submitted_at && (
            <p className="text-sm text-slate-600">
              Тапсырылды: {fmtDue(s.submitted_at)}{isLate(s, a.due_at) ? ' · мерзімнен кешігіп' : ''}
            </p>
          )}
          <SubmitWork
            assignmentId={a.id}
            files={files}
            locked={!!s?.graded_at}
            initialComment={s?.comment ?? ''}
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
            anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
          />
        </section>
      )}
    </article>
  );
}
