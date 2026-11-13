import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { LESSON_SELECT, addDays, todayAlmaty, type LessonRow } from '@/lib/lessons';
import { LessonList } from '@/components/LessonList';

export const metadata: Metadata = { title: 'Сабақтар' };

export default async function LessonsPage() {
  const profile = await requireUser();
  const supabase = await createClient();
  const today = todayAlmaty();
  // RLS: оқушы тек өз сыныбының сабақтарын көреді
  const [{ data }, { data: classes }] = await Promise.all([
    supabase.from('lessons').select(LESSON_SELECT).gte('lesson_date', addDays(today, -30)).lte('lesson_date', addDays(today, 7))
      .order('lesson_date', { ascending: false }).order('created_at'),
    supabase.from('classes').select('id, name'),
  ]);
  const lessons = (data ?? []) as unknown as LessonRow[];
  const names = new Map(((classes ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const staff = isStaff(profile);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Сабақтар</h1>
          <p className="text-sm text-slate-600">Сабақта өткен тақырып пен үй тапсырмасы. Сабақты өткізіп алсаң — осы жерден қара.</p>
        </div>
        {staff && <Link href="/admin/lessons" className="btn btn-primary">Журналды толтыру</Link>}
      </header>
      {lessons.length === 0 ? (
        <div className="card text-sm text-slate-500">{staff ? 'Әзірге сабақ жазылмаған.' : 'Әзірге сабақ жазылмаған. Мұғалім жазған соң осында шығады.'}</div>
      ) : (
        <LessonList lessons={lessons} today={today} classNames={names} showClass={staff || names.size > 1} />
      )}
    </div>
  );
}
