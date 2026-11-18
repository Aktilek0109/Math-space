import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDue } from '@/lib/homework';

export const metadata: Metadata = { title: 'Үй тапсырмасы' };

/** Мұғалім жариялаған үй тапсырмалары (тексеру жоқ — тек не берілгені көрінеді). */
export default async function HomeworkList() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: list } = await supabase
    .from('assignments')
    .select('id, title, grade, due_at, created_at, classes(name)')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100);
  const now = Date.now();
  const rows = (list ?? []) as unknown as { id: string; title: string; grade: number; due_at: string | null; created_at: string; classes: { name: string } | null }[];
  const current = rows.filter((a) => !a.due_at || new Date(a.due_at).getTime() >= now);
  const past = rows.filter((a) => a.due_at && new Date(a.due_at).getTime() < now);

  const Row = ({ a, dim }: { a: (typeof rows)[number]; dim?: boolean }) => (
    <Link href={`/homework/${a.id}`} className={`card flex flex-wrap items-center justify-between gap-2 hover:border-brand-500 ${dim ? 'opacity-70' : ''}`}>
      <div className="min-w-0">
        <div className="font-medium">{a.title}</div>
        <div className="text-xs text-slate-500">
          {a.classes?.name ?? `${a.grade}-сынып`} · берілді: {fmtDue(a.created_at)}
        </div>
      </div>
      <span className="chip">Мерзімі: {fmtDue(a.due_at)}</span>
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Үй тапсырмасы</h1>
        {isStaff(profile) && <Link href="/admin/homework" className="btn btn-primary">Тапсырма жариялау</Link>}
      </div>
      {rows.length === 0 && <div className="card text-slate-500">Әзірге үй тапсырмасы берілмеген.</div>}
      {current.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Ағымдағы</h2>
          {current.map((a) => <Row key={a.id} a={a} />)}
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-slate-600">Бұрын берілген</h2>
          {past.map((a) => <Row key={a.id} a={a} dim />)}
        </section>
      )}
    </div>
  );
}
