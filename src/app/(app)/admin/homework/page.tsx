import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDue } from '@/lib/homework';
import { NewAssignment } from './NewAssignment';

export const metadata: Metadata = { title: 'Үй тапсырмасы' };

export default async function AdminHomework() {
  await requireRole(['teacher', 'admin']);
  const supabase = await createClient();
  const [{ data: list }, { data: classes }, { data: materials }] = await Promise.all([
    supabase.from('assignments').select('id, title, grade, due_at, max_score, class_id, student_id, mode, classes(name), profiles!assignments_student_id_fkey(full_name, username)').order('created_at', { ascending: false }).limit(200),
    supabase.from('classes').select('id, name, grade').order('grade').order('name'),
    supabase.from('materials').select('id, title, grade').eq('status', 'published').order('grade').order('sort_order').limit(1000),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Үй тапсырмасын жариялау</h1>
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/homework/compose" className="btn btn-primary">🎯 Банктен есеп таңдап жариялау</Link>
      </div>
      <NewAssignment classes={(classes ?? []) as { id: string; name: string; grade: number }[]} materials={(materials ?? []) as { id: string; title: string; grade: number }[]} />
      <section className="space-y-2">
        <h2 className="font-semibold">Жарияланған тапсырмалар</h2>
        {(list ?? []).length === 0 && <div className="card text-slate-500">Әзірге тапсырма жоқ.</div>}
        {(list ?? []).map((a) => {
          const cls = (a.classes as unknown as { name: string } | null)?.name;
          return (
            <Link key={a.id} href={`/admin/homework/${a.id}`} className="card flex flex-wrap items-center justify-between gap-2 hover:border-brand-500">
              <div>
                <div className="font-medium">{(a as { mode?: string }).mode === 'tasks' ? '🎯 ' : ''}{a.title}</div>
                <div className="text-xs text-slate-500">{(() => { const st = (a as unknown as { profiles: { full_name: string; username: string } | null }).profiles; return st ? `👤 жеке: ${st.full_name || st.username} · ` : ''; })()}{cls ?? `${a.grade}-сынып (барлығы)`} · мерзімі: {fmtDue(a.due_at)}</div>
              </div>
</Link>
          );
        })}
      </section>
    </div>
  );
}
