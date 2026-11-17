import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkLines } from '@/lib/stepcheck';
import { MathText } from '@/components/MathText';
import { EXAM_LABEL } from '@/lib/catalog';
import { band } from '@/lib/heatmap-rules';

/** М5.1: ұяшықты ашу — оқушының осы мақсаттағы есептері, терген шешім жолдары, қате себептері. */
export default async function HeatCell({ searchParams }: { searchParams: Promise<{ class?: string; s?: string; o?: string }> }) {
  await requireRole(['teacher', 'admin']);
  const sp = await searchParams;
  if (!sp.s || !sp.o) notFound();
  const db = await createClient();
  const { data: allowed } = await db.rpc('can_view_student', { p_student: sp.s });
  if (!allowed) notFound();
  const admin = createAdminClient();
  const [{ data: stu }, { data: obj }, { data: m }, { data: qo }] = await Promise.all([
    admin.from('profiles').select('full_name, username').eq('id', sp.s).maybeSingle(),
    admin.from('learning_objectives').select('code, text').eq('id', sp.o).maybeSingle(),
    db.rpc('objective_mastery', { p_students: [sp.s], p_source: 'all', p_since: null }),
    admin.from('question_objectives').select('question_id').eq('objective_id', sp.o).limit(3000),
  ]);
  if (!stu || !obj) notFound();
  const cell = ((m ?? []) as { objective_id: string; pct: number; n: number; prev_pct: number | null }[]).find((r) => r.objective_id === sp.o);
  const qids = (qo ?? []).map((r) => r.question_id as string);

  type Resp = { id: string; awarded_marks: number | null; hints_used: number; response_json: { value?: string; choice?: string; parts?: Record<string, string>; steps?: string[]; partSteps?: Record<string, string[]> } | null; updated_at: string;
    practice_items: { question_id: string; max_marks: number; sequence_no: number; public_snapshot_json: { text: string }; practice_sessions: { id: string; exam_type: string; status: string; parameters_json: { purpose?: string } | null } } };
  const resp: Resp[] = [];
  for (let i = 0; i < qids.length; i += 300) {
    const { data } = await admin.from('responses')
      .select('id, awarded_marks, hints_used, response_json, updated_at, practice_items!inner(question_id, max_marks, sequence_no, public_snapshot_json, practice_sessions!inner(id, exam_type, status, parameters_json))')
      .eq('user_id', sp.s).in('practice_items.question_id', qids.slice(i, i + 300)).in('practice_items.practice_sessions.status', ['submitted', 'graded']);
    resp.push(...((data ?? []) as unknown as Resp[]));
  }
  resp.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const { data: hw } = await admin.from('homework_attempts')
    .select('id, kind, awarded_marks, submitted_at, answer_json, homework_items!inner(objective_id, max_marks, body_json, assignment_id, assignments(title))')
    .eq('student_id', sp.s).eq('homework_items.objective_id', sp.o).not('submitted_at', 'is', null).order('submitted_at', { ascending: false }).limit(30);
  const { data: mk } = await admin.from('mistakes').select('reason, status, times_seen, due_at').eq('student_id', sp.s).eq('objective_id', sp.o);

  const purposeLabel = (s: Resp['practice_items']['practice_sessions']) =>
    s.parameters_json?.purpose === 'review' ? 'Қателермен жұмыс' : s.parameters_json?.purpose === 'objective' ? 'Мақсат бойынша дайындық' : EXAM_LABEL[s.exam_type as keyof typeof EXAM_LABEL] ?? s.exam_type;
  const showAns = (r: Resp['response_json']) => r?.parts && Object.keys(r.parts).length ? Object.entries(r.parts).map(([k, v]) => `${k}) ${v || '—'}`).join('; ') : r?.value ?? r?.choice ?? '—';
  const b = band(cell?.pct);
  const tone = b === 'green' ? 'text-emerald-700' : b === 'yellow' ? 'text-yellow-700' : b === 'orange' ? 'text-orange-600' : b === 'red' ? 'text-red-600' : 'text-slate-500';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={`/admin/heatmap${sp.class ? `?class=${sp.class}` : ''}`} className="text-sm text-brand-600 hover:underline">← Жылу картасы</Link>
      <header className="card space-y-1">
        <h1 className="text-xl font-semibold">{stu.full_name || stu.username}</h1>
        <p className="text-sm"><span className="font-mono text-xs text-slate-500">{obj.code}</span> <MathText text={obj.text as string} /></p>
        <p className={`text-2xl font-bold ${tone}`}>{cell ? `${cell.pct}%` : '—'} <span className="text-sm font-normal text-slate-500">{cell ? `${cell.n} дәлел${cell.prev_pct != null ? ` · бұрын ${cell.prev_pct}%` : ''}` : 'дерек жоқ'}</span></p>
      </header>

      {(mk ?? []).length > 0 && (
        <section className="card text-sm">
          <h2 className="mb-1 font-semibold">Қате себептері (қателермен жұмыс)</h2>
          <ul className="list-disc pl-5">{(mk ?? []).map((x, i) => <li key={i}>{x.reason ? <MathText text={x.reason as string} /> : 'себебі анықталмаған'} <span className="text-xs text-slate-500">· {x.status === 'mastered' ? 'меңгерілді' : `қайталау: ${new Date(x.due_at as string).toLocaleDateString('kk-KZ')}`} · {x.times_seen as number} рет</span></li>)}</ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Есептер ({resp.length + (hw ?? []).length})</h2>
        {resp.map((r) => {
          const pi = r.practice_items;
          const steps = [r.response_json?.steps, ...Object.values(r.response_json?.partSteps ?? {})].filter((x): x is string[] => !!x?.length);
          const full = r.awarded_marks != null && Number(r.awarded_marks) >= Number(pi.max_marks);
          return (
            <div key={r.id} className={`card space-y-2 border-l-4 text-sm ${full ? 'border-l-emerald-500' : 'border-l-red-400'}`}>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <Link href={`/results/${pi.practice_sessions.id}`} className="text-brand-600 hover:underline">{purposeLabel(pi.practice_sessions)} · {pi.sequence_no}-тапсырма</Link>
                <span>{new Date(r.updated_at).toLocaleDateString('kk-KZ')} · {r.awarded_marks ?? '?'}/{Number(pi.max_marks)} ұпай{r.hints_used ? ` · 💡×${r.hints_used}` : ''}</span>
              </div>
              <MathText text={pi.public_snapshot_json.text} className="block" />
              <p><span className="text-slate-500">Жауабы:</span> <MathText text={showAns(r.response_json)} /></p>
              {steps.map((st, j) => {
                const c = checkLines(st);
                return (
                  <ol key={j} className="space-y-0.5 rounded bg-slate-50 p-2">
                    {st.map((line, k) => (
                      <li key={k} className="flex gap-2">
                        <span className={c[k]?.status === 'ok' ? 'text-emerald-600' : c[k]?.status === 'error' ? 'text-red-600' : c[k]?.status === 'warn' ? 'text-amber-600' : 'text-slate-400'}>{c[k]?.status === 'ok' ? '✓' : c[k]?.status === 'error' ? '✗' : c[k]?.status === 'warn' ? '!' : '?'}</span>
                        <span><MathText text={`$${line}$`} />{c[k]?.reason && c[k].status !== 'ok' && <span className="ml-2 text-xs text-red-600"><MathText text={c[k].reason!} /></span>}</span>
                      </li>
                    ))}
                  </ol>
                );
              })}
            </div>
          );
        })}
        {((hw ?? []) as unknown as { id: string; kind: string; awarded_marks: number | null; submitted_at: string; homework_items: { max_marks: number; body_json: { text: string }; assignment_id: string; assignments: { title: string } | null } }[]).map((a) => (
          <div key={a.id} className="card space-y-1 border-l-4 border-l-sky-400 text-sm">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <Link href={`/admin/homework/${a.homework_items.assignment_id}`} className="text-brand-600 hover:underline">Үй жұмысы · {a.homework_items.assignments?.title}{a.kind === 'revised' ? ' (түзетілген)' : ''}</Link>
              <span>{new Date(a.submitted_at).toLocaleDateString('kk-KZ')} · {a.awarded_marks ?? 'тексерілмеген'}/{Number(a.homework_items.max_marks)}</span>
            </div>
            <MathText text={a.homework_items.body_json.text} className="block" />
          </div>
        ))}
        {resp.length + (hw ?? []).length === 0 && <p className="text-sm text-slate-500">Тапсырылған есеп жоқ.</p>}
      </section>
    </div>
  );
}
