import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Басқару' };

export default async function AdminHome() {
  await requireRole(['teacher', 'admin']);
  const supabase = await createClient();
  const head = { count: 'exact' as const, head: true };

  const [materials, published, questions, students, sessions, pending, { data: templates }, { data: wrong }] = await Promise.all([
    supabase.from('materials').select('id', head),
    supabase.from('materials').select('id', head).eq('status', 'published'),
    supabase.from('questions').select('id', head).eq('status', 'published'),
    supabase.from('profiles').select('id', head).eq('role', 'student'),
    supabase.from('practice_sessions').select('id', head),
    supabase.from('results').select('id', head).eq('pending_manual', true),
    supabase.from('generator_templates').select('template_key, grade, usage_count, status').order('usage_count', { ascending: false }),
    // Соңғы 200 нәтижедегі қате тақырыптар
    supabase.from('results').select('feedback_json').order('created_at', { ascending: false }).limit(200),
  ]);

  const topicCounts = new Map<string, number>();
  for (const r of wrong ?? []) {
    for (const t of ((r.feedback_json as { wrong_topic_ids?: string[] })?.wrong_topic_ids ?? [])) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  }
  const topIds = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const { data: topicRows } = topIds.length
    ? await supabase.from('topics').select('id, title').in('id', topIds.map(([id]) => id))
    : { data: [] as { id: string; title: string }[] };
  const titles = new Map((topicRows ?? []).map((t) => [t.id, t.title]));

  const stats = [
    ['Материалдар', `${published.count ?? 0} / ${materials.count ?? 0}`, 'жарияланған / барлығы'],
    ['Есептер банкі', questions.count ?? 0, 'жарияланған'],
    ['Оқушылар', students.count ?? 0, 'сізге көрінетін'],
    ['Сынақтар', sessions.count ?? 0, 'барлығы'],
    ['Тексеруді күтеді', pending.count ?? 0, 'ашық жауаптар'],
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Басқару панелі</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="card">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="text-2xl font-semibold">{value}</div>
            <div className="text-xs text-slate-400">{hint}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 font-semibold">Жиі қате жіберілетін тақырыптар</h2>
          {topIds.length === 0 ? <p className="text-sm text-slate-500">Дерек әлі жоқ.</p> : (
            <ul className="space-y-1 text-sm">
              {topIds.map(([id, n]) => <li key={id} className="flex justify-between"><span>{titles.get(id) ?? id}</span><span>{n}</span></li>)}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Генератор қолданысы</h2>
          <ul className="space-y-1 text-sm">
            {(templates ?? []).map((t) => (
              <li key={t.template_key} className="flex justify-between">
                <span>{t.template_key} <span className="text-slate-400">({t.grade}-сынып, {t.status})</span></span>
                <span>{t.usage_count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
