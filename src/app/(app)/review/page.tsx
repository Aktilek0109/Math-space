import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { INTERVALS_DAYS, MASTER_STREAK } from '@/lib/mistakes';
import { MathText } from '@/components/MathText';
import { StartReview } from './StartReview';

export const metadata = { title: 'Қателермен жұмыс' };

/** Қателермен жұмыс (ТЗ М2): қате шыққан есеп түрлері, келесі қайталау күні, бүгінгі қайталау. */
export default async function ReviewPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from('mistakes')
    .select('id, status, stage, correct_streak, times_seen, due_at, reason, topics(title), learning_objectives(code, text)')
    .eq('student_id', profile.id)
    .order('due_at');
  const rows = (data ?? []) as unknown as {
    id: string; status: string; stage: number; correct_streak: number; times_seen: number; due_at: string; reason: string | null;
    topics: { title: string } | null; learning_objectives: { code: string; text: string } | null;
  }[];
  const now = Date.now();
  const active = rows.filter((r) => r.status === 'active');
  const due = active.filter((r) => new Date(r.due_at).getTime() <= now);
  const mastered = rows.filter((r) => r.status === 'mastered');
  const day = (iso: string) => {
    const d = Math.ceil((new Date(iso).getTime() - now) / 86_400_000);
    return d <= 0 ? 'бүгін' : d === 1 ? 'ертең' : `${d} күннен кейін`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Қателермен жұмыс</h1>
        <p className="text-sm text-slate-600">
          Қате шыққан есептердің түрлері осында жиналады. Қайталағанда сол есеп емес, сол түрдегі басқа нұсқа беріледі.
          Аралық: {INTERVALS_DAYS.join(' → ')} күн; қатарынан {MASTER_STREAK} рет көмексіз дұрыс шықса — «меңгерілді».
        </p>
      </header>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{due.length ? `Бүгін қайталау: ${Math.min(due.length, 10)} есеп` : 'Бүгін қайталайтын есеп жоқ'}</p>
          <p className="text-sm text-slate-500">Белсенді: {active.length} · Меңгерілген: {mastered.length}</p>
        </div>
        {due.length > 0 && <StartReview />}
      </section>

      {active.length === 0 && mastered.length === 0 && (
        <p className="text-sm text-slate-500">Әзірге қате жоқ. БЖБ/ТЖБ жаттығуларында толық балл алынбаған есептер осында түседі.</p>
      )}

      {active.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Қайталанатын түрлер</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {active.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{r.topics?.title ?? 'Тақырып'}</p>
                  {r.learning_objectives && <p className="text-xs text-slate-500">{r.learning_objectives.code} — {r.learning_objectives.text}</p>}
                  {r.reason && <p className="mt-1 text-xs text-red-600">Соңғы қате: <MathText text={r.reason} /></p>}
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p className={new Date(r.due_at).getTime() <= now ? 'font-semibold text-red-600' : ''}>{day(r.due_at)}</p>
                  <p>{'●'.repeat(r.correct_streak)}{'○'.repeat(Math.max(0, MASTER_STREAK - r.correct_streak))} · {r.times_seen} рет</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mastered.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-emerald-700">Меңгерілгендер ({mastered.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {mastered.map((r) => <li key={r.id}>✓ {r.topics?.title ?? 'Тақырып'}{r.learning_objectives ? ` · ${r.learning_objectives.code}` : ''}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
