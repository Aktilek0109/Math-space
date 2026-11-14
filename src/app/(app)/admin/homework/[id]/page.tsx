import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { assignmentStudents, fmtDue, isLate } from '@/lib/homework';
import { GradeRow, ImportGrades, DeleteAssignment, ExportZip, AiCheckAll, AiBox, type AiResult } from './GradeTools';
import { AI_DAILY_FREE, aiConfigured, aiUsageToday } from '@/lib/ai-check';
import { TasksReport } from './TasksReport';

export default async function AdminHomeworkItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(['teacher', 'admin']);
  const admin = createAdminClient();
  const { data: a } = await admin
    .from('assignments')
    .select('id, title, description, grade, class_id, due_at, max_score, mode, classes(name)')
    .eq('id', id)
    .maybeSingle();
  if (!a) notFound();
  if (a.mode === 'tasks') return <TasksReport a={{ ...a, classes: a.classes as unknown as { name: string } | null }} />;
  const [{ data: key }, students, { data: subs }, usage] = await Promise.all([
    admin.from('assignment_keys').select('answer_text').eq('assignment_id', id).maybeSingle(),
    assignmentStudents(admin, a),
    admin
      .from('submissions')
      .select('id, student_id, submitted_at, comment, score, feedback, graded_at, submission_files(id, mime_type, original_name, position), submission_ai(status, score, feedback, details, error, model, neurons)')
      .eq('assignment_id', id),
    aiUsageToday(admin),
  ]);
  type Sub = {
    student_id: string; submitted_at: string | null; comment: string; score: number | null; feedback: string | null; graded_at: string | null;
    submission_files: { id: string; mime_type: string; original_name: string; position: number }[];
    submission_ai: AiResult | AiResult[] | null;
  };
  const aiOf = (s?: Sub) => (s ? (Array.isArray(s.submission_ai) ? s.submission_ai[0] ?? null : s.submission_ai) : null);
  const aiOn = aiConfigured();
  const pct = Math.round((usage.neurons / AI_DAILY_FREE) * 100);
  const byStudent = new Map(((subs ?? []) as Sub[]).map((s) => [s.student_id, s]));
  const sent = students.filter((s) => byStudent.get(s.id)?.submitted_at).length;
  const graded = students.filter((s) => byStudent.get(s.id)?.graded_at).length;
  const cls = (a.classes as unknown as { name: string } | null)?.name;

  return (
    <div className="space-y-4">
      <Link href="/admin/homework" className="text-sm text-brand-600 hover:underline">← Үй жұмыстары</Link>
      <header className="card space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-semibold">{a.title}</h1>
          <DeleteAssignment id={a.id} />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="chip">{cls ?? `${a.grade}-сынып (барлығы)`}</span>
          <span className="chip">Мерзімі: {fmtDue(a.due_at)}</span>
          <span className="chip">Ең жоғары баға: {Number(a.max_score)}</span>
          <span className="chip">Тапсырғаны: {sent} / {students.length}</span>
          <span className="chip">Бағаланғаны: {graded}</span>
        </div>
        {a.description && <p className="whitespace-pre-wrap text-slate-700">{a.description}</p>}
        {key?.answer_text && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600">Жауаптар / критерий (тек сізге)</summary>
            <p className="mt-1 whitespace-pre-wrap">{key.answer_text}</p>
          </details>
        )}
      </header>

      <section className="card space-y-2">
        <h2 className="font-semibold">AI алдын ала тексеру (тегін)</h2>
        {aiOn ? (
          <>
            <p className="text-sm text-slate-600">
              Оқушы фото салғанда AI жауаптарды кілтпен салыстырып, баға ұсынады. Оқушы бағаны сіз растағаннан кейін ғана көреді.
              Нақтырақ болу үшін тапсырма бергенде жауап кілтін жазыңыз.
            </p>
            <div className="text-sm">
              Бүгінгі тегін лимит: <b>{usage.neurons}</b> / {AI_DAILY_FREE} нейрон ({pct}%) · {usage.calls} тексеру · Алматы уақытымен таңғы 5-те жаңарады
              <div className="mt-1 h-2 w-full max-w-md rounded bg-slate-100"><div className={`h-2 rounded ${pct > 85 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
            </div>
            <AiCheckAll id={a.id} />
          </>
        ) : (
          <p className="text-sm text-slate-600">Қосылмаған. Vercel → Settings → Environment Variables бөліміне <code>CF_ACCOUNT_ID</code> және <code>CF_AI_TOKEN</code> қосып, Redeploy жасаңыз.</p>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">Claude-пен тексеру</h2>
        <p className="text-sm text-slate-600">
          1) Барлық жұмысты zip етіп жүктеп алыңыз. 2) Оны Claude чатына салып: «тексеріп, бағалар кестесін толтыр» деп жазыңыз.
          3) Claude қайтарған <b>бағалар.csv</b> кестесін төменде жүктесеңіз, бағалар мен түсініктемелер оқушыларға бірден шығады.
        </p>
        <div className="flex flex-wrap gap-2">
          <ExportZip id={a.id} />
        </div>
        <ImportGrades id={a.id} />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Оқушылар</h2>
        {students.length === 0 && (
          <div className="card text-sm text-slate-500">Бұл сыныпта оқушы аккаунттары әлі жоқ. Аккаунттар жасалғанда тізім осында шығады.</div>
        )}
        {students.map((st) => {
          const s = byStudent.get(st.id);
          const files = [...(s?.submission_files ?? [])].sort((x, y) => x.position - y.position);
          return (
            <div key={st.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{st.full_name || st.username}</div>
                  <div className="text-xs text-slate-500">{st.username}</div>
                </div>
                {s?.submitted_at ? (
                  <span className={`chip ${isLate(s, a.due_at) ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                    Тапсырды {fmtDue(s.submitted_at)}{isLate(s, a.due_at) ? ' · кешігіп' : ''}
                  </span>
                ) : (
                  <span className="chip bg-red-50 text-red-700">Тапсырмаған</span>
                )}
              </div>
              {files.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {files.map((f, i) => (
                    <a key={f.id} href={`/api/homework/file?id=${f.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      {f.mime_type.startsWith('image/') && f.mime_type !== 'image/heic' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/homework/file?id=${f.id}`} alt={`${i + 1}-бет`} className="h-32 w-24 rounded border border-slate-200 object-cover" />
                      ) : (
                        <div className="flex h-32 w-24 items-center justify-center rounded border border-slate-200 text-xs">📄 {i + 1}</div>
                      )}
                    </a>
                  ))}
                </div>
              )}
              {s?.comment && <p className="text-sm text-slate-600">Оқушы пікірі: {s.comment}</p>}
              {aiOn && s?.submitted_at && <AiBox assignmentId={a.id} studentId={st.id} max={Number(a.max_score)} ai={aiOf(s)} graded={!!s.graded_at} />}
              <GradeRow assignmentId={a.id} studentId={st.id} max={Number(a.max_score)} score={s?.score ?? null} feedback={s?.feedback ?? ''} graded={!!s?.graded_at} />
            </div>
          );
        })}
      </section>
    </div>
  );
}
