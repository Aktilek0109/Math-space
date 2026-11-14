import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDue, isLate } from '@/lib/homework';
import { SubmitWork } from './SubmitWork';
import { TaskWork, type TaskItem, type TaskAttempt } from './TaskWork';

export default async function HomeworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: a } = await supabase
    .from('assignments')
    .select('id, title, description, grade, due_at, max_score, material_id, mode, materials(title)')
    .eq('id', id)
    .maybeSingle();
  if (!a) notFound();
  const { data: s } = await supabase
    .from('submissions')
    .select('id, submitted_at, comment, score, feedback, graded_at, submission_files(id, original_name, mime_type, position)')
    .eq('assignment_id', id)
    .eq('student_id', profile.id)
    .maybeSingle();
  if (a.mode === 'tasks') {
    const [{ data: items }, { data: atts }] = await Promise.all([
      supabase
        .from('homework_items')
        .select('id, parent_item_id, student_id, position, question_type, body_json, criteria_json, max_marks, difficulty, learning_objectives(code, text)')
        .eq('assignment_id', id)
        .order('position'),
      supabase
        .from('homework_attempts')
        .select('id, item_id, kind, answer_json, files_json, submitted_at, feedback_json, awarded_marks, marking_state, teacher_note, graded_at')
        .eq('student_id', profile.id),
    ]);
    const mine = ((items ?? []) as unknown as TaskItem[]).filter((i) => !i.student_id || i.student_id === profile.id);
    const ids = new Set(mine.map((i) => i.id));
    return (
      <article className="mx-auto max-w-3xl space-y-4">
        <Link href="/homework" className="text-sm text-brand-600 hover:underline">← Үй жұмыстары</Link>
        <header className="card space-y-2">
          <h1 className="text-xl font-semibold">{a.title}</h1>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="chip">{a.grade}-сынып</span>
            <span className="chip">Мерзімі: {fmtDue(a.due_at)}</span>
            <span className="chip">Барлығы: {Number(a.max_score)} ұпай</span>
          </div>
          {a.description && <p className="whitespace-pre-wrap text-slate-700">{a.description}</p>}
          <p className="text-sm text-slate-600">
            Әр есептің астында не үшін ұпай берілетіні жазылған. Шешуді сайтқа жаз немесе дәптердегі бетті суретке түсіріп жүкте.
            «Кері байланыс алу» — тапсыру емес: алғашқы нұсқаң сақталып, бір нұсқау аласың, содан кейін түзете аласың.
          </p>
        </header>
        {isStaff(profile) ? (
          <div className="card text-sm text-slate-600">
            Бұл — оқушы көретін бет. Нәтижелер мен бағалау: <Link className="underline" href={`/admin/homework/${a.id}`}>тапсырма бетінде</Link>.
          </div>
        ) : (
          <TaskWork
            assignmentId={a.id}
            items={mine}
            attempts={((atts ?? []) as unknown as TaskAttempt[]).filter((t) => ids.has(t.item_id))}
            submittedAt={s?.submitted_at ?? null}
            gradedAt={s?.graded_at ?? null}
            score={s?.score ?? null}
            maxScore={Number(a.max_score)}
            feedback={s?.feedback ?? null}
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
            anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
          />
        )}
      </article>
    );
  }

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
