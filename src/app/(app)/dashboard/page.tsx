import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GRADES, EXAM_LABEL } from '@/lib/catalog';
import { isMeskGrade } from '@/lib/catalog';
import { LESSON_SELECT, todayAlmaty, fmtDay, type LessonRow } from '@/lib/lessons';
import { LessonItem } from '@/components/LessonList';

export const metadata: Metadata = { title: 'Басты бет' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ forbidden?: string }> }) {
  const sp = await searchParams;
  const profile = await requireUser();
  const supabase = await createClient();

  const today = todayAlmaty();
  const [{ data: recent }, { data: sessions }, { data: lastLessons }] = await Promise.all([
    supabase
      .from('material_views')
      .select('viewed_at, materials(id, title, grade)')
      .eq('user_id', profile.id)
      .order('viewed_at', { ascending: false })
      .limit(5),
    supabase
      .from('practice_sessions')
      .select('id, exam_type, status, created_at, results(percent)')
      .eq('owner_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('lessons').select(LESSON_SELECT).lte('lesson_date', today).order('lesson_date', { ascending: false }).order('created_at').limit(6),
  ]);
  const ll = (lastLessons ?? []) as unknown as LessonRow[];
  const lessonDay = ll[0]?.lesson_date;
  const dayLessons = profile.role === 'student' && lessonDay ? ll.filter((l) => l.lesson_date === lessonDay) : [];

  const unfinished = (sessions ?? []).find((s) => s.status === 'in_progress');

  return (
    <div className="space-y-6">
      {sp.forbidden && <div className="error-box">Бұл бетке рұқсатыңыз жоқ.</div>}
      <section>
        <h1 className="text-2xl font-semibold">Сәлем, {profile.full_name || profile.username}!</h1>
        <p className="text-slate-600">Сынып таңдаңыз — барлық жарияланған материалдар ашық.</p>
      </section>

      {dayLessons.length > 0 && (
        <section className="card space-y-2 border-brand-500">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{lessonDay === today ? 'Бүгінгі сабақ' : `Соңғы сабақ · ${fmtDay(lessonDay!)}`}</h2>
            <Link href="/lessons" className="text-sm text-brand-600 hover:underline">Барлық сабақтар →</Link>
          </div>
          {dayLessons.map((l) => <LessonItem key={l.id} l={l} />)}
        </section>
      )}

      <section aria-labelledby="grades" className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <h2 id="grades" className="sr-only">Сыныптар</h2>
        {GRADES.map((g) => (
          <Link
            key={g}
            href={`/library?grade=${g}`}
            className={`card text-center text-lg font-semibold hover:border-brand-500 ${profile.current_grade === g ? 'border-brand-500 bg-brand-50' : ''}`}
          >
            {g}
            <span className="block text-xs font-normal text-slate-500">сынып</span>
          </Link>
        ))}
      </section>

      {unfinished && (
        <Link href={`/practice/${unfinished.id}`} className="ok-box block">
          Аяқталмаған {EXAM_LABEL[unfinished.exam_type]} сынағыңыз бар — жалғастыру →
        </Link>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Соңғы ашылған материалдар</h2>
          {(recent ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Әзірге жоқ. <Link className="text-brand-600 underline" href="/library">Кітапханаға өту</Link></p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(recent ?? []).map((r) => {
                const m = r.materials as unknown as { id: string; title: string; grade: number } | null;
                return m ? (
                  <li key={m.id}>
                    <Link href={`/library/${m.id}`} className="hover:underline">{m.title}</Link>{' '}
                    <span className="chip">{m.grade}-сынып</span>
                  </li>
                ) : null;
              })}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Соңғы сынақтар</h2>
          {(sessions ?? []).length === 0 ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/practice" className="btn btn-primary">БЖБ/ТЖБ дайындығы</Link>
              {(isMeskGrade(profile.current_grade) || profile.role !== 'student') && <Link href="/mesk/mock/new" className="btn btn-secondary">МЭСК пробный</Link>}
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {(sessions ?? []).map((s) => {
                const res = (s.results as unknown as { percent: number }[] | { percent: number } | null);
                const pct = Array.isArray(res) ? res[0]?.percent : res?.percent;
                return (
                  <li key={s.id} className="flex justify-between">
                    <Link href={s.status === 'in_progress' ? `/practice/${s.id}` : `/results/${s.id}`} className="hover:underline">
                      {EXAM_LABEL[s.exam_type]} · {new Date(s.created_at).toLocaleDateString('kk-KZ')}
                    </Link>
                    <span className="text-slate-600">{pct != null ? `${pct}%` : s.status === 'in_progress' ? 'жалғасуда' : 'тексерілуде'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
