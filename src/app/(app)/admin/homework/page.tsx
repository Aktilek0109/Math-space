import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fmtDue } from '@/lib/homework';
import { NewAssignment } from './NewAssignment';

export const metadata: Metadata = { title: 'Үй жұмыстары' };

export default async function AdminHomework() {
  await requireRole(['teacher', 'admin']);
  const supabase = await createClient();
  const [{ data: list }, { data: classes }, { data: materials }] = await Promise.all([
    supabase.from('assignments').select('id, title, grade, due_at, max_score, class_id, classes(name)').order('created_at', { ascending: false }).limit(200),
    supabase.from('classes').select('id, name, grade').order('grade').order('name'),
    supabase.from('materials').select('id, title, grade').eq('status', 'published').order('grade').order('sort_order').limit(1000),
  ]);
  const ids = (list ?? []).map((a) => a.id);
  const admin = createAdminClient();
  const { data: subs } = ids.length
    ? await admin.from('submissions').select('assignment_id, submitted_at, graded_at').in('assignment_id', ids)
    : { data: [] as { assignment_id: string; submitted_at: string | null; graded_at: string | null }[] };
  const stat = new Map<string, { sent: number; graded: number }>();
  for (const s of subs ?? []) {
    const v = stat.get(s.assignment_id) ?? { sent: 0, graded: 0 };
    if (s.submitted_at) v.sent++;
    if (s.graded_at) v.graded++;
    stat.set(s.assignment_id, v);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Үй жұмыстары</h1>
      <NewAssignment classes={(classes ?? []) as { id: string; name: string; grade: number }[]} materials={(materials ?? []) as { id: string; title: string; grade: number }[]} />
      <section className="space-y-2">
        <h2 className="font-semibold">Берілген тапсырмалар</h2>
        {(list ?? []).length === 0 && <div className="card text-slate-500">Әзірге тапсырма жоқ.</div>}
        {(list ?? []).map((a) => {
          const v = stat.get(a.id) ?? { sent: 0, graded: 0 };
          const cls = (a.classes as unknown as { name: string } | null)?.name;
          return (
            <Link key={a.id} href={`/admin/homework/${a.id}`} className="card flex flex-wrap items-center justify-between gap-2 hover:border-brand-500">
              <div>
                <div className="font-medium">{a.title}</div>
                <div className="text-xs text-slate-500">{cls ?? `${a.grade}-сынып (барлығы)`} · мерзімі: {fmtDue(a.due_at)}</div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="chip">Тапсырғаны: {v.sent}</span>
                <span className="chip">Бағаланғаны: {v.graded}</span>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
