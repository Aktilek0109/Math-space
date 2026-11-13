import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EXAM_LABEL } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Нәтижелер' };

const STATUS: Record<string, string> = { in_progress: 'Жалғасуда', submitting: 'Тапсырылуда', submitted: 'Тексерілуде', graded: 'Бағаланды' };

export default async function ResultsPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from('practice_sessions')
    .select('id, exam_type, mode, grade, status, created_at, submitted_at, total_marks, results(marks_earned, marks_possible, percent, pending_manual, feedback_json)')
    .eq('owner_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(100);

  // Бөлімдер бойынша жиынтық прогресс
  const agg = new Map<string, { title: string; earned: number; possible: number }>();
  for (const s of sessions ?? []) {
    const r = (Array.isArray(s.results) ? s.results[0] : s.results) as { feedback_json?: { by_unit?: { unit_id: string; title: string; earned: number; possible: number }[] } } | undefined;
    for (const u of r?.feedback_json?.by_unit ?? []) {
      const a = agg.get(u.unit_id) ?? { title: u.title, earned: 0, possible: 0 };
      a.earned += u.earned;
      a.possible += u.possible;
      agg.set(u.unit_id, a);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Нәтижелер</h1>

      {agg.size > 0 && (
        <section className="card">
          <h2 className="mb-3 font-semibold">Бөлімдер бойынша прогресс</h2>
          <ul className="space-y-2">
            {[...agg.values()].map((u) => {
              const pct = u.possible ? Math.round((u.earned / u.possible) * 100) : 0;
              return (
                <li key={u.title} className="text-sm">
                  <div className="flex justify-between"><span>{u.title}</span><span>{pct}%</span></div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={u.title}>
                    <div className={`h-2 rounded-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="p-3">Түрі</th><th className="p-3">Күні</th><th className="p-3">Мәртебе</th><th className="p-3 text-right">Нәтиже</th></tr>
          </thead>
          <tbody>
            {(sessions ?? []).length === 0 && (
              <tr><td colSpan={4} className="p-4 text-slate-500">Әзірге сынақ жоқ.</td></tr>
            )}
            {(sessions ?? []).map((s) => {
              const r = (Array.isArray(s.results) ? s.results[0] : s.results) as { marks_earned: number; marks_possible: number; percent: number; pending_manual: boolean } | undefined;
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <Link href={s.status === 'in_progress' ? `/practice/${s.id}` : `/results/${s.id}`} className="font-medium text-brand-600 hover:underline">
                      {EXAM_LABEL[s.exam_type]} · {s.grade}-сынып
                    </Link>
                  </td>
                  <td className="p-3">{new Date(s.submitted_at ?? s.created_at).toLocaleString('kk-KZ', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="p-3">{STATUS[s.status]}{r?.pending_manual ? ' (ашық жауаптар)' : ''}</td>
                  <td className="p-3 text-right">{r ? `${Number(r.marks_earned)}/${Number(r.marks_possible)} · ${Number(r.percent)}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
