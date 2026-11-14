import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { assignmentStudents, fmtDue } from '@/lib/homework';
import { MathText } from '@/components/MathText';
import { MIN_ITEMS } from '@/lib/objectives';
import { DeleteAssignment } from './GradeTools';
import { GradeAttempt } from './GradeAttempt';

interface Item {
  id: string; parent_item_id: string | null; student_id: string | null; position: number; question_type: string;
  body_json: { text: string; options?: { id: string; text: string }[] }; criteria_json: { descriptor: string; marks: number }[];
  max_marks: number; difficulty: number; objective_id: string | null;
  learning_objectives: { code: string; text: string } | null;
  homework_item_keys: { answer_json: Record<string, unknown>; solution_json: { text?: string } } | null;
}
interface Att {
  id: string; item_id: string; student_id: string; kind: 'first' | 'revised';
  answer_json: { value?: string; choice?: string; text?: string }; files_json: { mime: string; name: string }[];
  submitted_at: string | null; feedback_json: { next_step: string; done: string[]; readable: boolean; source: string; correct: boolean | null } | null;
  awarded_marks: number | null; auto_marks: number | null; marking_state: string; teacher_note: string | null;
}

/** ТЗ 14.5: әр оқу мақсаты бойынша дербес / көмекпен орындалған тапсырмалар, қайталанған қате, дәлел жолдары. */
export async function TasksReport({ a }: { a: { id: string; title: string; description: string; grade: number; class_id: string | null; due_at: string | null; max_score: number; classes: { name: string } | null } }) {
  const admin = createAdminClient();
  const [{ data: itemsRaw }, students, { data: attsRaw }, { data: subs }] = await Promise.all([
    admin.from('homework_items')
      .select('id, parent_item_id, student_id, position, question_type, body_json, criteria_json, max_marks, difficulty, objective_id, learning_objectives(code, text), homework_item_keys(answer_json, solution_json)')
      .eq('assignment_id', a.id).order('position'),
    assignmentStudents(admin, a),
    admin.from('homework_attempts')
      .select('id, item_id, student_id, kind, answer_json, files_json, submitted_at, feedback_json, awarded_marks, auto_marks, marking_state, teacher_note, homework_items!inner(assignment_id)')
      .eq('homework_items.assignment_id', a.id),
    admin.from('submissions').select('student_id, submitted_at, score, graded_at').eq('assignment_id', a.id),
  ]);
  const items = (itemsRaw ?? []) as unknown as Item[];
  const atts = (attsRaw ?? []) as unknown as Att[];
  const common = items.filter((i) => !i.student_id);
  const subBy = new Map((subs ?? []).map((s) => [s.student_id as string, s]));
  const att = (itemId: string, sid: string, kind: 'first' | 'revised') => atts.find((x) => x.item_id === itemId && x.student_id === sid && x.kind === kind) ?? null;
  const followOf = (itemId: string, sid: string) => items.find((i) => i.parent_item_id === itemId && i.student_id === sid) ?? null;

  // Мақсаттар
  const objectives = [...new Map(common.filter((i) => i.objective_id).map((i) => [i.objective_id!, i.learning_objectives])).entries()];

  /** Бір оқушының мақсат бойынша дербес дерегі (ортақ есептің first + тексеру есебінің first). */
  function studentObjective(sid: string, oid: string) {
    let earned = 0, possible = 0, n = 0, assisted = 0, repeated = false, unread = false;
    for (const it of common.filter((i) => i.objective_id === oid)) {
      const f = att(it.id, sid, 'first');
      if (f?.feedback_json && !f.feedback_json.readable) unread = true;
      if (f?.submitted_at && f.awarded_marks != null) { earned += Number(f.awarded_marks); possible += Number(it.max_marks); n++; }
      const r = att(it.id, sid, 'revised');
      if (r?.submitted_at) assisted++;
      const fo = followOf(it.id, sid);
      if (fo) {
        const ff = att(fo.id, sid, 'first');
        if (ff?.submitted_at && ff.awarded_marks != null) {
          earned += Number(ff.awarded_marks); possible += Number(fo.max_marks); n++;
          if (f?.awarded_marks != null && Number(f.awarded_marks) === 0 && Number(ff.awarded_marks) === 0) repeated = true;
        }
      }
    }
    return { earned, possible, n, assisted, repeated, unread, pct: possible ? Math.round((earned / possible) * 100) : null };
  }

  const sent = students.filter((s) => subBy.get(s.id)?.submitted_at).length;
  const pendingCount = atts.filter((x) => x.kind === 'first' && x.submitted_at && x.awarded_marks == null).length;

  return (
    <div className="space-y-4">
      <Link href="/admin/homework" className="text-sm text-brand-600 hover:underline">← Үй жұмыстары</Link>
      <header className="card space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-semibold">🎯 {a.title}</h1>
          <DeleteAssignment id={a.id} />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="chip">{a.classes?.name ?? `${a.grade}-сынып (барлығы)`}</span>
          <span className="chip">Мерзімі: {fmtDue(a.due_at)}</span>
          <span className="chip">{common.length} есеп · {Number(a.max_score)} ұпай</span>
          <span className="chip">Тапсырғаны: {sent} / {students.length}</span>
          {pendingCount > 0 && <span className="chip bg-amber-100 text-amber-800">Бағалауды күтеді: {pendingCount}</span>}
        </div>
        {a.description && <p className="whitespace-pre-wrap text-slate-700">{a.description}</p>}
      </header>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Оқу мақсаттары бойынша</h2>
        <p className="mb-2 text-xs text-slate-500">
          % — тек дербес әрекеттер (алғашқы нұсқа және тексеру есебі) ұпайларының қосындысынан. Көмекпен түзетілген жауап пайызға кірмейді.
          {` ${MIN_ITEMS}`}-ден аз бағаланған есеп болса — «қосымша тексеру қажет».
        </p>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-1 pr-2">Оқушы</th>
              {objectives.map(([oid, o]) => <th key={oid} className="py-1 pr-2" title={o?.text}>{o?.code}</th>)}
            </tr>
          </thead>
          <tbody>
            {students.map((st) => (
              <tr key={st.id} className="border-b last:border-0">
                <td className="py-1 pr-2"><a href={`#s-${st.id}`} className="hover:underline">{st.full_name || st.username}</a></td>
                {objectives.map(([oid]) => {
                  const r = studentObjective(st.id, oid);
                  const enough = r.n >= MIN_ITEMS;
                  return (
                    <td key={oid} className="py-1 pr-2">
                      {r.n === 0 ? <span className="text-slate-400">—</span> : enough ? (
                        <span className={r.pct! >= 80 ? 'text-green-700' : r.pct! < 50 ? 'text-red-700' : ''}>{r.pct}% <span className="text-xs text-slate-500">({r.earned}/{r.possible})</span></span>
                      ) : <span className="text-amber-700" title={`${r.earned}/${r.possible}`}>қосымша тексеру қажет</span>}
                      {r.assisted > 0 && <span className="ml-1 text-xs text-amber-700" title="көмекпен түзеткен есеп саны">· көмек {r.assisted}</span>}
                      {r.repeated && <span className="ml-1 text-xs text-red-700">· қате қайталанды</span>}
                      {r.unread && <span className="ml-1 text-xs text-slate-500">· сурет оқылмады</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Оқушылардың жұмыстары</h2>
        {students.map((st) => {
          const s = subBy.get(st.id);
          return (
            <details key={st.id} id={`s-${st.id}`} className="card" open={!!s?.submitted_at && atts.some((x) => x.student_id === st.id && x.kind === 'first' && x.submitted_at && x.awarded_marks == null)}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{st.full_name || st.username}</span>
                <span className="flex gap-2 text-xs">
                  {s?.submitted_at ? <span className="chip bg-blue-100 text-blue-800">Тапсырды {fmtDue(s.submitted_at as string)}</span> : <span className="chip bg-red-50 text-red-700">Тапсырмаған</span>}
                  {s?.graded_at && <span className="chip bg-green-100 text-green-800">{Number(s.score)} / {Number(a.max_score)}</span>}
                </span>
              </summary>
              <div className="mt-3 space-y-4">
                {common.map((it, i) => {
                  const f = att(it.id, st.id, 'first');
                  const r = att(it.id, st.id, 'revised');
                  const fo = followOf(it.id, st.id);
                  const ff = fo ? att(fo.id, st.id, 'first') : null;
                  return (
                    <div key={it.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <b>{i + 1}-есеп</b>
                        {it.learning_objectives && <span className="chip">{it.learning_objectives.code}</span>}
                        <span className="chip">{Number(it.max_marks)} ұпай</span>
                      </div>
                      <details className="text-sm text-slate-600">
                        <summary className="cursor-pointer">Шарты, өлшемдері және кілт</summary>
                        <div className="mt-1 space-y-1"><MathText text={it.body_json.text} />
                          <ul className="list-disc pl-5">{it.criteria_json.map((c, k) => <li key={k}>{c.descriptor} — {c.marks}</li>)}</ul>
                          {it.homework_item_keys?.solution_json?.text && <p>Шешім: <MathText text={it.homework_item_keys.solution_json.text} /></p>}
                        </div>
                      </details>
                      <AttemptView a={f} label="Алғашқы нұсқа · дербес" max={it.max_marks} assignmentId={a.id} />
                      {r && <AttemptView a={r} label="Түзетілген нұсқа · көмекпен" max={it.max_marks} assignmentId={a.id} assisted />}
                      {fo && (
                        <div className="ml-3 border-l-4 border-brand-200 pl-3">
                          <div className="text-sm font-medium">Тексеру есебі (шарты өзгеше)</div>
                          <MathText text={fo.body_json.text} className="text-sm" />
                          <AttemptView a={ff} label="Дербес әрекет" max={fo.max_marks} assignmentId={a.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}

function AttemptView({ a, label, max, assignmentId, assisted }: { a: Att | null; label: string; max: number; assignmentId: string; assisted?: boolean }) {
  if (!a) return <p className="text-sm text-slate-400">{label}: жауап жоқ</p>;
  const ans = a.answer_json ?? {};
  return (
    <div className={`space-y-1 rounded p-2 text-sm ${assisted ? 'bg-amber-50' : 'bg-slate-50'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        {!a.submitted_at && <span className="chip">бекітілмеген</span>}
      </div>
      {(ans.value || ans.choice) && <div>Жауабы: <b>{ans.value ?? ans.choice}</b>{a.auto_marks != null && <span className="ml-2 text-xs text-slate-500">(автоматты: {Number(a.auto_marks)}/{Number(max)})</span>}</div>}
      {ans.text && <pre className="whitespace-pre-wrap font-sans">{ans.text}</pre>}
      {(a.files_json ?? []).length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {a.files_json.map((f, i) => (
            <a key={i} href={`/api/homework/attempt-file?a=${a.id}&i=${i}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
              {f.mime.startsWith('image/') && f.mime !== 'image/heic'
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/homework/attempt-file?a=${a.id}&i=${i}`} alt={`${i + 1}-бет`} className="h-28 w-20 rounded border object-cover" />
                : <div className="flex h-28 w-20 items-center justify-center rounded border text-xs">📄 {i + 1}</div>}
            </a>
          ))}
        </div>
      )}
      {a.feedback_json && (
        <p className="text-xs text-brand-800">💬 {a.feedback_json.source === 'ai' ? 'ЖИ' : 'Авто'} нұсқауы: {a.feedback_json.next_step}{a.feedback_json.readable ? '' : ' (сурет оқылмады)'}</p>
      )}
      {a.submitted_at && <GradeAttempt assignmentId={assignmentId} attemptId={a.id} max={Number(max)} marks={a.awarded_marks != null ? Number(a.awarded_marks) : null} note={a.teacher_note ?? ''} manual={a.marking_state === 'manual'} />}
    </div>
  );
}
