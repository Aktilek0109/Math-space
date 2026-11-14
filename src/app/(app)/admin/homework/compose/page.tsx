import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getUnits } from '@/lib/catalog';
import { Composer } from './Composer';

export const metadata: Metadata = { title: 'Үй жұмысын құрастыру' };

/** ТЗ 14.1. Сабақтан (?class=&topic=&lesson=) немесе кітапханадағы тақырыптан (?topic=) ашылады. */
export default async function ComposePage({ searchParams }: { searchParams: Promise<{ topic?: string; class?: string; lesson?: string; grade?: string }> }) {
  await requireRole(['teacher', 'admin']);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: classes }, units] = await Promise.all([
    supabase.from('classes').select('id, name, grade').order('grade').order('name'),
    getUnits(),
  ]);
  const topicGrade = units.find((u) => u.topics.some((t) => t.id === sp.topic))?.grade;
  const cls = (classes ?? []).find((c) => c.id === sp.class);
  const grade = cls?.grade ?? topicGrade ?? (Number(sp.grade) || 8);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin/homework" className="text-sm text-brand-600 hover:underline">← Үй жұмыстары</Link>
      <h1 className="text-2xl font-semibold">Үй жұмысын құрастыру</h1>
      <p className="text-sm text-slate-600">
        Тақырыпты таңдаңыз — жүйе оның оқу мақсаттарын және әр мақсатқа әртүрлі қырынан тексеретін есептерді банктен ұсынады
        (әдісті қолдану, негіздеу, өзгерген шарт). Есепті ауыстыруға, алып тастауға және бағалау өлшемін өзгертуге болады.
      </p>
      <Composer
        classes={(classes ?? []) as { id: string; name: string; grade: number }[]}
        units={units.filter((u) => u.topics.length).map((u) => ({ id: u.id, grade: u.grade, term: u.term, title: u.title, topics: u.topics.map((t) => ({ id: t.id, title: t.title })) }))}
        initial={{ grade, classId: cls?.id ?? '', topicId: sp.topic ?? '', lessonId: sp.lesson ?? '' }}
      />
    </div>
  );
}
