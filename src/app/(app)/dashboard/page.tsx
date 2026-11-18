import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GRADES, EXAM_LABEL, isMeskGrade } from '@/lib/catalog';
import { LESSON_SELECT, todayAlmaty, fmtDay, type LessonRow } from '@/lib/lessons';
import { LessonItem } from '@/components/LessonList';
import { MathText } from '@/components/MathText';
import { fmtDue } from '@/lib/homework';

export const metadata: Metadata = { title: 'Басты бет' };

const barCls = (p: number) => (p >= 80 ? 'bg-[#5E9C78]' : p >= 65 ? 'bg-[#93B172]' : p >= 40 ? 'bg-[#D49A62]' : 'bg-[#CE7468]');

/** Басты бет (G «Тыныш»): бүгінгі сабақ, қайталау, оқу мақсаттары, үй жұмысы, соңғы нәтижелер. */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ forbidden?: string }> }) {
  const sp = await searchParams;
  const profile = await requireUser();
  const staff = isStaff(profile);
  const supabase = await createClient();
  const today = todayAlmaty();
  const nowIso = new Date().toISOString();

  const [{ data: sessions }, { data: lastLessons }, { data: dueRows }, { data: mastery }, { data: hw }] = await Promise.all([
    supabase.from('practice_sessions').select('id, exam_type, status, created_at, parameters_json, results(percent)').eq('owner_id', profile.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('lessons').select(LESSON_SELECT).lte('lesson_date', today).order('lesson_date', { ascending: false }).order('created_at').limit(6),
    supabase.from('mistakes').select('id, topics(title)').eq('student_id', profile.id).eq('status', 'active').lte('due_at', nowIso).limit(20),
    supabase.rpc('objective_mastery', { p_students: [profile.id], p_source: 'all', p_since: null }),
    supabase.from('assignments').select('id, title, due_at').eq('status', 'published').gte('due_at', nowIso).order('due_at').limit(4),
  ]);
  const ll = (lastLessons ?? []) as unknown as LessonRow[];
  const lessonDay = ll[0]?.lesson_date;
  const dayLessons = lessonDay ? ll.filter((l) => l.lesson_date === lessonDay) : [];
  const unfinished = (sessions ?? []).find((s) => s.status === 'in_progress');
  const due = (dueRows ?? []) as unknown as { id: string; topics: { title: string } | null }[];
  const dueTopics = [...new Set(due.map((d) => d.topics?.title).filter(Boolean))].slice(0, 3) as string[];
  const m = ((mastery ?? []) as { objective_id: string; pct: number; n: number }[]).sort((a, b) => a.pct - b.pct).slice(0, 4);
  const { data: objs } = m.length ? await supabase.from('learning_objectives').select('id, code, text').in('id', m.map((x) => x.objective_id)) : { data: [] };
  const objMap = new Map(((objs ?? []) as { id: string; code: string; text: string }[]).map((o) => [o.id, o]));
  const openHw = ((hw ?? []) as { id: string; title: string; due_at: string }[]).slice(0, 3);
  const name = (profile.full_name || profile.username).split(/\s+/)[0];
  const roleLabel = profile.role === 'admin' ? 'Әкімші' : profile.role === 'teacher' ? 'Мұғалім' : 'Оқушы';

  return (
    <div className="space-y-6">
      {sp.forbidden && <div className="error-box">Бұл бетке рұқсатыңыз жоқ.</div>}
      <header className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-600">{roleLabel}</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Сәлем, {name}!</h1>
        <p className="text-slate-500">{profile.current_grade ? `${profile.current_grade}-сынып · ` : ''}{new Date().toLocaleDateString('kk-KZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </header>

      {unfinished && (
        <Link href={`/practice/${unfinished.id}`} className="ok-box block font-medium">Аяқталмаған {EXAM_LABEL[unfinished.exam_type]} сынағыңыз бар — жалғастыру →</Link>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card space-y-3 border-brand-200">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-semibold">{lessonDay === today ? 'Бүгінгі сабақ' : lessonDay ? `Соңғы сабақ · ${fmtDay(lessonDay)}` : 'Сабақтар'}</h2>
            <Link href="/lessons" className="text-sm text-brand-600 hover:underline">Барлығы →</Link>
          </div>
          {dayLessons.length ? dayLessons.map((l) => <LessonItem key={l.id} l={l} />) : <p className="text-sm text-slate-500">Әзірге сабақ жазылмаған.</p>}
        </section>

        {!staff ? (
          <section className="card flex flex-col gap-3">
            <h2 className="text-[17px] font-semibold">Қателермен жұмыс</h2>
            {due.length ? (
              <>
                <p className="flex items-baseline gap-2.5"><span className="text-5xl font-bold leading-none text-brand-600">{Math.min(due.length, 10)}</span><span className="font-semibold">есеп бүгін қайталауға дайын</span></p>
                {dueTopics.length > 0 && <p className="text-sm text-slate-500">{dueTopics.join(' · ')}</p>}
                <div><Link href="/review" className="btn btn-primary">Қайталауды бастау</Link></div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Бүгін қайталайтын есеп жоқ. Толық балл алынбаған есептер осында жиналады.</p>
            )}
          </section>
        ) : (
          <section className="card flex flex-col gap-3">
            <h2 className="text-[17px] font-semibold">Мұғалім құралдары</h2>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/heatmap" className="btn btn-primary">Жылу картасы</Link>
              <Link href="/admin/pending" className="btn btn-secondary">Тексеру</Link>
              <Link href="/admin/homework" className="btn btn-secondary">Үй жұмысы</Link>
            </div>
          </section>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-semibold">Оқу мақсаттарын меңгеру</h2>
            <Link href="/objectives" className="text-sm text-brand-600 hover:underline">Барлығы →</Link>
          </div>
          {m.length ? (
            <ul className="space-y-3.5">
              {m.map((x) => {
                const o = objMap.get(x.objective_id);
                return (
                  <li key={x.objective_id} className="space-y-1.5">
                    <div className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate">{o ? <MathText text={o.text} /> : '—'}</span><span className="font-bold">{x.pct}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${barCls(x.pct)}`} style={{ width: `${x.pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Әлі дерек жоқ. БЖБ/ТЖБ жаттығуын немесе мақсат бойынша дайындықты бастаңыз.</p>
          )}
          <div><Link href="/objectives" className="btn btn-secondary">Әлсіз мақсатқа дайындалу</Link></div>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="card space-y-3">
            <div className="flex items-center justify-between gap-2"><h2 className="text-[17px] font-semibold">Үй тапсырмасы</h2><Link href="/homework" className="text-sm text-brand-600 hover:underline">Барлығы</Link></div>
            {openHw.length ? (
              <ul className="space-y-3">
                {openHw.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <Link href={`/homework/${a.id}`} className="min-w-0 font-medium hover:underline"><span className="block truncate">{a.title}</span><span className="block text-xs font-normal text-slate-500">Мерзімі: {fmtDue(a.due_at)}</span></Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Ағымдағы үй тапсырмасы жоқ.</p>}
          </section>

          <section className="card">
            <h2 className="mb-1 text-[17px] font-semibold">Соңғы нәтижелер</h2>
            {(sessions ?? []).length === 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href="/practice" className="btn btn-primary">БЖБ/ТЖБ дайындығы</Link>
                {(isMeskGrade(profile.current_grade) || staff) && <Link href="/mesk/mock/new" className="btn btn-secondary">МЭСК пробный</Link>}
              </div>
            ) : (
              <ul className="text-sm">
                {(sessions ?? []).map((s) => {
                  const res = s.results as unknown as { percent: number }[] | { percent: number } | null;
                  const pct = Array.isArray(res) ? res[0]?.percent : res?.percent;
                  const purpose = (s.parameters_json as { purpose?: string } | null)?.purpose;
                  const label = purpose === 'review' ? 'Қателермен жұмыс' : purpose === 'objective' ? 'Мақсат бойынша дайындық' : EXAM_LABEL[s.exam_type];
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2.5 first:border-t-0">
                      <Link href={s.status === 'in_progress' ? `/practice/${s.id}` : `/results/${s.id}`} className="hover:underline">{label} <span className="text-slate-500">· {new Date(s.created_at).toLocaleDateString('kk-KZ')}</span></Link>
                      <span className="font-bold">{pct != null ? `${Number(pct)}%` : s.status === 'in_progress' ? <span className="chip">жалғасуда</span> : <span className="chip">тексерілуде</span>}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section aria-labelledby="grades" className="space-y-2">
        <h2 id="grades" className="text-sm font-semibold text-slate-500">Кітапхана: сыныптар</h2>
        <div className="flex flex-wrap gap-2">
          {GRADES.map((g) => (
            <Link key={g} href={`/library?grade=${g}`} className={`flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold ${profile.current_grade === g ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>{g}-сынып</Link>
          ))}
        </div>
      </section>
    </div>
  );
}
