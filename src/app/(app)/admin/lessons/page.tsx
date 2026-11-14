import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getUnits, type UnitWithTopics } from '@/lib/catalog';
import { LESSON_SELECT, addDays, fmtDay, todayAlmaty, topicHref, type LessonRow } from '@/lib/lessons';
import { LessonForm, DeleteLesson, type TopicGroup } from './LessonForm';

export const metadata: Metadata = { title: 'Сабақ журналы' };

export default async function AdminLessons({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requireRole(['teacher', 'admin']);
  const sp = await searchParams;
  const today = todayAlmaty();
  const day = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const supabase = await createClient();

  const { data: classes } = await supabase.from('classes').select('id, name, grade').order('grade').order('name');
  const cls = (classes ?? []) as { id: string; name: string; grade: number }[];
  const grades = [...new Set(cls.map((c) => c.grade))];
  const unitsByGrade = new Map<number, UnitWithTopics[]>(await Promise.all(grades.map(async (g) => [g, await getUnits(g)] as const)));

  const [{ data: todays }, { data: recent }] = await Promise.all([
    supabase.from('lessons').select(LESSON_SELECT).eq('lesson_date', day).order('created_at'),
    supabase.from('lessons').select('class_id, topic_id, lesson_date, created_at').lte('lesson_date', day).not('topic_id', 'is', null)
      .order('lesson_date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
  ]);
  const lessons = (todays ?? []) as unknown as LessonRow[];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Сабақ журналы</h1>
          <p className="text-sm text-slate-600">Әр сыныпқа бүгін өткен тақырып пен үй тапсырмасын жазыңыз — оқушылар өз бетінде бірден көреді.</p>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <Link className="btn btn-secondary px-3 py-1" href={`/admin/lessons?d=${addDays(day, -1)}`}>←</Link>
          <span className="min-w-44 text-center font-medium">{fmtDay(day)}{day === today ? ' (бүгін)' : ''}</span>
          <Link className="btn btn-secondary px-3 py-1" href={`/admin/lessons?d=${addDays(day, 1)}`}>→</Link>
          {day !== today && <Link className="ml-1 text-brand-600 hover:underline" href="/admin/lessons">бүгін</Link>}
        </nav>
      </header>

      {cls.length === 0 && <div className="card text-sm text-slate-500">Сыныптар жоқ. Алдымен «Аккаунттар» бетінде оқушыларды сыныппен импорттаңыз.</div>}

      {cls.map((c) => {
        const units = unitsByGrade.get(c.grade) ?? [];
        const groups: TopicGroup[] = units
          .filter((u) => u.topics.length)
          .map((u) => ({ label: `${u.term ? `${u.term}-тоқсан · ` : ''}${u.title}`, topics: u.topics.map((t) => ({ id: t.id, title: t.title })) }));
        const flat = groups.flatMap((g) => g.topics.map((t) => t.id));
        const last = (recent ?? []).find((r) => r.class_id === c.id && r.topic_id && flat.includes(r.topic_id as string));
        const suggested = last ? flat[Math.min(flat.indexOf(last.topic_id as string) + 1, flat.length - 1)] : flat[0];
        const mine = lessons.filter((l) => l.class_id === c.id);
        return (
          <section key={c.id} className="card space-y-3">
            <h2 className="font-semibold">{c.name} <span className="text-sm font-normal text-slate-500">· {c.grade}-сынып</span></h2>
            {mine.map((l) => {
              const href = topicHref(l);
              const title = l.topics?.title ?? l.title;
              return (
                <div key={l.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="font-medium">📘 {href ? <Link href={href} className="hover:underline">{title}</Link> : title}{l.topics && l.title ? ` — ${l.title}` : ''}</div>
                    <DeleteLesson id={l.id} />
                  </div>
                  {l.note && <p className="text-slate-600">{l.note}</p>}
                  {l.homework_text && <p className="mt-1">🏠 <b>Үй тапсырмасы:</b> {l.homework_text}</p>}
                  {l.assignment_id && <Link href={`/admin/homework/${l.assignment_id}`} className="text-xs text-brand-600 hover:underline">Онлайн тапсыру → жұмыстарды көру</Link>}
                  {!l.assignment_id && l.topic_id && (
                    <Link href={`/admin/homework/compose?class=${c.id}&topic=${l.topic_id}&lesson=${l.id}`} className="text-xs text-brand-600 hover:underline">🎯 Үй жұмысын құрастыру</Link>
                  )}
                </div>
              );
            })}
            <LessonForm classId={c.id} day={day} groups={groups} suggested={suggested ?? ''} hasLesson={mine.length > 0} />
          </section>
        );
      })}
    </div>
  );
}
