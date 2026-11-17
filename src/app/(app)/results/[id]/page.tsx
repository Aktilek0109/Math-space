import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, isStaff } from '@/lib/auth';
import { loadSessionView } from '@/lib/sessions';
import { ApiError } from '@/lib/api';
import { EXAM_LABEL } from '@/lib/catalog';
import { MathText } from '@/components/MathText';
import { Figure, Figures } from '@/components/Figure';
import { ManualGrade } from './ManualGrade';
import { MarkScheme } from '@/components/MarkScheme';
import { objectiveFeedback } from '@/lib/objective';
import { StartObjective } from '@/app/(app)/objectives/StartObjective';

function showResponse(r: { choice?: string; choices?: string[]; value?: string; text?: string; parts?: Record<string, string> } | null) {
  if (!r) return '—';
  if (r.parts && Object.keys(r.parts).length) return Object.entries(r.parts).map(([k, v]) => `${k}) ${v || '—'}`).join('; ');
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
  const pj = (view.session.parameters_json ?? {}) as Record<string, unknown>;
  const fb = pj.purpose === 'objective' ? await objectiveFeedback(id, view.session.owner_id, pj) : null;
  const LV: Record<number, string> = { 1: 'Жеңіл', 2: 'Орта', 3: 'Күрделі' };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/results" className="text-sm text-brand-600 hover:underline">← Барлық нәтижелер</Link>
      <header className="card">
        <h1 className="text-xl font-semibold">{fb ? 'Оқу мақсаты бойынша дайындық' : pj.purpose === 'review' ? 'Қателермен жұмыс' : EXAM_LABEL[view.session.exam_type]} · {view.session.grade}-сынып</h1>
        {fb && <p className="mt-1 text-sm text-slate-600"><span className="font-mono text-xs">{fb.code}</span> <MathText text={fb.text} /></p>}
        {r && (
          <div className="mt-3 flex flex-wrap items-end gap-6">
            <div><div className="text-4xl font-bold">{Number(r.percent)}%</div><div className="text-sm text-slate-500">{Number(r.marks_earned)} / {Number(r.marks_possible)} ұпай</div></div>
            <div className="text-sm text-slate-600">Аяқталды: {new Date(view.session.submitted_at ?? r.created_at).toLocaleString('kk-KZ')}</div>
          </div>
        )}
        {r?.pending_manual && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">Ашық жауаптар мұғалім тексеруін күтуде — балл өзгеруі мүмкін.</p>}
        <p className="mt-2 text-xs text-slate-500">Бұл — дайындық нәтижесі. Ресми баға шегі тек тексерілген кесте енгізілгенде қолданылады.</p>
      </header>

      {fb && (
        <section className={`card space-y-4 ${fb.mastered ? 'border-emerald-300' : ''}`}>
          <h2 className="font-semibold">Кері байланыс</h2>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-sm text-slate-500">Мақсатты меңгеру</div>
              <div className="text-2xl font-bold">{fb.startPct == null ? '—' : `${fb.startPct}%`} → {fb.endPct == null ? '—' : `${fb.endPct}%`}</div>
            </div>
            <div className={`rounded-full px-3 py-1 text-sm font-medium ${fb.mastered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {fb.mastered ? '✓ Меңгерілді' : 'Әлі меңгерілген жоқ'}
            </div>
            <div className="text-sm text-slate-600">Көмек: {fb.hintsUsed} рет</div>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">Деңгейлер бойынша</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {fb.levels.map((l) => {
                const p = l.n ? Math.round((l.ok / l.n) * 100) : null;
                return (
                  <div key={l.level} className="rounded-lg border border-slate-200 p-2 text-sm">
                    <div className="flex justify-between"><span>{LV[l.level] ?? l.level}</span><span className="text-slate-500">{l.n ? `${l.ok}/${l.n}` : 'берілмеді'}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100"><div className={`h-full ${p == null ? '' : p >= 80 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${p ?? 0}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
          {fb.stepErrors.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-medium">Шешім жолындағы жиі қателер</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">{fb.stepErrors.map((e) => <li key={e.reason}><MathText text={e.reason} /> <span className="text-slate-500">×{e.n}</span></li>)}</ul>
            </div>
          )}
          <div>
            <h3 className="mb-1 text-sm font-medium">Не істеу керек</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">{fb.advice.map((a) => <li key={a}><MathText text={a} /></li>)}</ul>
          </div>
          {view.isOwner && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
              <StartObjective objectiveId={fb.objectiveId} label={fb.mastered ? 'Тағы бекіту' : 'Қайта бастау'} />
              <Link href="/review" className="btn btn-secondary text-sm">Қателермен жұмыс</Link>
              {fb.next && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Келесі мақсат: <span className="font-mono text-xs">{fb.next.code}</span>{fb.next.pct != null ? ` (${fb.next.pct}%)` : ''}</span>
                  <StartObjective objectiveId={fb.next.id} label="Бастау →" />
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {!fb && r?.feedback_json?.by_unit && r.feedback_json.by_unit.length > 0 && (
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
            <Figure figure={(it.body as { figure?: unknown }).figure} />
            {it.body.parts?.length ? (
              <ol className="space-y-1 text-sm">
                {it.body.parts.map((p) => <li key={p.label}><b>{p.label})</b> <MathText text={p.text} /> <span className="text-slate-500">({p.marks} ұпай)</span></li>)}
              </ol>
            ) : null}
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
                  {it.key.answer.parts ? Object.entries(it.key.answer.parts as Record<string, { value?: number; correct?: string }>).map(([k, v]) => `${k}) ${v.value ?? v.correct}`).join('; ')
                    : it.key.answer.value !== undefined ? it.key.answer.value
                    : Array.isArray(it.key.answer.correct) ? it.key.answer.correct.join(', ')
                    : it.key.answer.correct ?? it.key.answer.accepted?.join(' / ') ?? 'дескриптор бойынша'}
                </p>
                {it.key.solution?.text && <div className="mt-1"><span className="text-slate-500">Шешуі: </span><MathText text={it.key.solution.text} /></div>}
                <Figures figures={(it.key.solution as { figures?: unknown }).figures} />
                <MarkScheme type={it.question_type} maxMarks={Number(it.max_marks)} body={it.body} answer={it.key.answer} solutionText={it.key.solution?.text ?? ''} rubric={it.key.rubric} />
              </div>
            )}
            {staff && pending && it.response_id && <ManualGrade responseId={it.response_id} max={it.max_marks} />}
          </section>
        );
      })}

      <div className="flex gap-2">
        <Link href={fb ? '/objectives' : view.session.exam_type === 'MESK' ? '/mesk/mock/new' : '/practice'} className="btn btn-primary">{fb ? 'Барлық мақсаттар' : 'Жаңа нұсқа'}</Link>
        <Link href="/library" className="btn btn-secondary">Қайта дайындалу</Link>
      </div>
    </div>
  );
}
