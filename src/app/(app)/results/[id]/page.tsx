import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, isStaff } from '@/lib/auth';
import { loadSessionView } from '@/lib/sessions';
import { ApiError } from '@/lib/api';
import { EXAM_LABEL } from '@/lib/catalog';
import { MathText } from '@/components/MathText';
import { ManualGrade } from './ManualGrade';

function showResponse(r: { choice?: string; choices?: string[]; value?: string; text?: string } | null) {
  if (!r) return '—';
  if (r.choice) return r.choice;
  if (r.choices?.length) return r.choices.join(', ');
  if (r.value) return r.value;
  if (r.text) return r.text;
  return '—';
}

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  let view;
  try {
    view = await loadSessionView(id, profile);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  if (!view.finished) {
    if (view.isOwner) redirect(`/practice/${id}`);
    notFound();
  }
  const r = view.result as null | {
    marks_earned: number; marks_possible: number; percent: number; pending_manual: boolean; created_at: string;
    feedback_json: { by_unit?: { unit_id: string; title: string; earned: number; possible: number }[] };
  };
  const staff = isStaff(profile) && !view.isOwner;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/results" className="text-sm text-brand-600 hover:underline">← Барлық нәтижелер</Link>
      <header className="card">
        <h1 className="text-xl font-semibold">{EXAM_LABEL[view.session.exam_type]} · {view.session.grade}-сынып</h1>
        {r && (
          <div className="mt-3 flex flex-wrap items-end gap-6">
            <div><div className="text-4xl font-bold">{Number(r.percent)}%</div><div className="text-sm text-slate-500">{Number(r.marks_earned)} / {Number(r.marks_possible)} ұпай</div></div>
            <div className="text-sm text-slate-600">Аяқталды: {new Date(view.session.submitted_at ?? r.created_at).toLocaleString('kk-KZ')}</div>
          </div>
        )}
        {r?.pending_manual && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">Ашық жауаптар мұғалім тексеруін күтуде — балл өзгеруі мүмкін.</p>}
        <p className="mt-2 text-xs text-slate-500">Бұл — дайындық нәтижесі. Ресми баға шегі тек тексерілген кесте енгізілгенде қолданылады.</p>
      </header>

      {r?.feedback_json?.by_unit && r.feedback_json.by_unit.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Бөлімдер кесіндісі</h2>
          <ul className="space-y-1 text-sm">
            {r.feedback_json.by_unit.map((u) => (
              <li key={u.unit_id} className="flex justify-between"><span>{u.title}</span><span>{u.earned}/{u.possible}</span></li>
            ))}
          </ul>
        </section>
      )}

      {view.items.map((it) => {
        const full = it.awarded_marks === it.max_marks;
        const pending = it.marking_state === 'pending';
        return (
          <section key={it.id} className={`card space-y-2 border-l-4 ${pending ? 'border-l-amber-400' : full ? 'border-l-emerald-500' : 'border-l-red-400'}`}>
            <div className="flex justify-between">
              <h2 className="font-semibold">{it.sequence_no}-тапсырма</h2>
              <span className="chip">{pending ? 'тексерілуде' : `${it.awarded_marks ?? 0}/${it.max_marks}`}</span>
            </div>
            <MathText text={it.body.text} className="block" />
            {it.body.options && (
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {it.body.options.map((o) => <li key={o.id}><b>{o.id})</b> <MathText text={o.text} /></li>)}
              </ul>
            )}
            <p className="text-sm"><span className="text-slate-500">Сіздің жауабыңыз:</span> <span className="whitespace-pre-wrap">{showResponse(it.response)}</span></p>
            {it.key && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p>
                  <span className="text-slate-500">Дұрыс жауап: </span>
                  {it.key.answer.value !== undefined ? it.key.answer.value
                    : Array.isArray(it.key.answer.correct) ? it.key.answer.correct.join(', ')
                    : it.key.answer.correct ?? it.key.answer.accepted?.join(' / ') ?? 'дескриптор бойынша'}
                </p>
                {it.key.solution?.text && <div className="mt-1"><span className="text-slate-500">Шешуі: </span><MathText text={it.key.solution.text} /></div>}
                {it.key.rubric?.length > 0 && (
                  <ul className="mt-1 list-disc pl-5">{it.key.rubric.map((d, i) => <li key={i}>{d.descriptor} — {d.marks}</li>)}</ul>
                )}
              </div>
            )}
            {staff && pending && it.response_id && <ManualGrade responseId={it.response_id} max={it.max_marks} />}
          </section>
        );
      })}

      <div className="flex gap-2">
        <Link href={view.session.exam_type === 'MESK' ? '/mesk/mock/new' : '/practice'} className="btn btn-primary">Жаңа нұсқа</Link>
        <Link href="/library" className="btn btn-secondary">Қайта дайындалу</Link>
      </div>
    </div>
  );
}
