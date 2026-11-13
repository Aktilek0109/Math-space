import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EXAM_LABEL } from '@/lib/catalog';
import { fmtDue } from '@/lib/homework';

export const metadata: Metadata = { title: 'Профиль' };

const ROLE: Record<string, string> = { student: 'Оқушы', teacher: 'Мұғалім', admin: 'Әкімші' };

/** Оқушы профилі: өзі үшін /profile; мұғалім кез келген оқушыны көре алады: /profile?u=<id> (RLS: can_view_student). */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const me = await requireUser();
  const { u } = await searchParams;
  const viewingOther = !!u && u !== me.id;
  if (viewingOther && !isStaff(me)) notFound();
  const uid = viewingOther ? u! : me.id;
  const supabase = await createClient();

  const { data: p } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, current_grade, created_at, class_members(classes(name))')
    .eq('id', uid)
    .maybeSingle();
  if (!p) notFound();
  const classes = ((p.class_members ?? []) as unknown as { classes: { name: string } | null }[]).map((c) => c.classes?.name).filter(Boolean);

  const [{ data: subs }, { data: sessions }, { data: views }] = await Promise.all([
    supabase
      .from('submissions')
      .select('submitted_at, score, graded_at, feedback, assignments(id, title, due_at, max_score)')
      .eq('student_id', uid)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('practice_sessions')
      .select('id, exam_type, grade, status, created_at, results(percent, marks_earned, marks_possible)')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('material_views')
      .select('viewed_at, materials(id, title)')
      .eq('user_id', uid)
      .order('viewed_at', { ascending: false })
      .limit(8),
  ]);

  type Sub = { submitted_at: string | null; score: number | null; graded_at: string | null; feedback: string | null; assignments: { id: string; title: string; due_at: string | null; max_score: number } | null };
  const hw = (subs ?? []) as unknown as Sub[];
  const sent = hw.filter((s) => s.submitted_at).length;
  const gradedHw = hw.filter((s) => s.score != null && s.assignments);
  const hwAvg = gradedHw.length ? Math.round((gradedHw.reduce((t, s) => t + Number(s.score) / Number(s.assignments!.max_score), 0) / gradedHw.length) * 100) : null;

  const pct = (s: { results: unknown }) => {
    const r = (Array.isArray(s.results) ? s.results[0] : s.results) as { percent: number } | null | undefined;
    return r ? Number(r.percent) : null;
  };
  const done = (sessions ?? []).map((s) => ({ ...s, p: pct(s) })).filter((s) => s.p != null);
  const testAvg = done.length ? Math.round(done.reduce((t, s) => t + (s.p as number), 0) / done.length) : null;

  const initials = (p.full_name || p.username).split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('');

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {viewingOther && <Link href="/admin/users" className="text-sm text-brand-600 hover:underline">← Аккаунттар</Link>}
      <header className="card flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-xl font-semibold text-white">{initials}</div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{p.full_name || p.username}</h1>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            <span className="chip font-mono">{p.username}</span>
            <span className="chip">{ROLE[p.role] ?? p.role}</span>
            {p.current_grade && <span className="chip">{p.current_grade}-сынып</span>}
            {classes.map((c) => <span key={c} className="chip">{c}</span>)}
          </div>
        </div>
        {!viewingOther && <Link href="/change-password" className="btn btn-secondary">Парольді ауыстыру</Link>}
      </header>

      {p.role === 'student' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card"><div className="text-sm text-slate-500">Тапсырылған үй жұмысы</div><div className="text-2xl font-semibold">{sent}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Үй жұмысының орташа бағасы</div><div className="text-2xl font-semibold">{hwAvg != null ? `${hwAvg}%` : '—'}</div></div>
            <div className="card"><div className="text-sm text-slate-500">БЖБ/ТЖБ жаттығулары</div><div className="text-2xl font-semibold">{done.length}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Жаттығудың орташа нәтижесі</div><div className="text-2xl font-semibold">{testAvg != null ? `${testAvg}%` : '—'}</div></div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card">
              <h2 className="mb-2 font-semibold">Үй жұмыстары</h2>
              {hw.length === 0 ? <p className="text-sm text-slate-500">Әзірге жоқ.</p> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {hw.slice(0, 10).map((s, i) => s.assignments && (
                    <li key={i} className="flex items-center justify-between gap-2 py-2">
                      <Link href={viewingOther ? `/admin/homework/${s.assignments.id}` : `/homework/${s.assignments.id}`} className="hover:underline">{s.assignments.title}</Link>
                      <span className="shrink-0 text-slate-600">
                        {s.score != null ? `${Number(s.score)}/${Number(s.assignments.max_score)}` : s.submitted_at ? 'тексерілуде' : 'тапсырылмаған'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <h2 className="mb-2 font-semibold">Соңғы жаттығулар</h2>
              {done.length === 0 ? (
                <p className="text-sm text-slate-500">Әзірге жоқ. {!viewingOther && <Link href="/practice" className="underline">БЖБ/ТЖБ-ға дайындалу</Link>}</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {done.slice(0, 10).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/results/${s.id}`} className="hover:underline">{EXAM_LABEL[s.exam_type] ?? s.exam_type} · {fmtDue(s.created_at)}</Link>
                      <span className={`chip ${(s.p as number) >= 70 ? 'bg-green-100 text-green-800' : (s.p as number) >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{s.p}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <h2 className="mb-2 font-semibold">Соңғы ашылған материалдар</h2>
            {(views ?? []).length === 0 ? <p className="text-sm text-slate-500">Әзірге жоқ.</p> : (
              <ul className="space-y-1 text-sm">
                {(views ?? []).map((v, i) => {
                  const m = v.materials as unknown as { id: string; title: string } | null;
                  return m ? <li key={i}><Link href={`/library/${m.id}`} className="hover:underline">{m.title}</Link> <span className="text-slate-400">· {fmtDue(v.viewed_at)}</span></li> : null;
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
