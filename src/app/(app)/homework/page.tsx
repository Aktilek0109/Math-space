import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDue, isLate } from '@/lib/homework';

export const metadata: Metadata = { title: 'Үй жұмысы' };

export default async function HomeworkList() {
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: list } = await supabase
    .from('assignments')
    .select('id, title, grade, due_at, max_score')
    .eq('status', 'published')
    .order('due_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100);
  const { data: subs } = await supabase
    .from('submissions')
    .select('assignment_id, submitted_at, score, graded_at')
    .eq('student_id', profile.id);
  const mine = new Map((subs ?? []).map((s) => [s.assignment_id as string, s]));
  const now = Date.now();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Үй жұмысы</h1>
        {isStaff(profile) && <Link href="/admin/homework" className="btn btn-primary">Тапсырмаларды басқару</Link>}
      </div>
      {(list ?? []).length === 0 && <div className="card text-slate-500">Әзірге тапсырма жоқ.</div>}
      <div className="space-y-3">
        {(list ?? []).map((a) => {
          const s = mine.get(a.id) as { submitted_at: string | null; score: number | null; graded_at: string | null } | undefined;
          const overdue = a.due_at && new Date(a.due_at).getTime() < now && !s?.submitted_at;
          let chip = <span className="chip">Тапсырылмаған</span>;
          if (s?.graded_at) chip = <span className="chip bg-green-100 text-green-800">Бағаланды{s.score != null ? `: ${Number(s.score)} / ${Number(a.max_score)}` : ''}</span>;
          else if (s?.submitted_at) chip = <span className="chip bg-blue-100 text-blue-800">Тапсырылды{isLate(s, a.due_at) ? ' (кешігіп)' : ''}</span>;
          else if (overdue) chip = <span className="chip bg-red-100 text-red-800">Мерзімі өтті</span>;
          return (
            <Link key={a.id} href={`/homework/${a.id}`} className="card flex flex-wrap items-center justify-between gap-2 hover:border-brand-500">
              <div>
                <div className="font-medium">{a.title}</div>
                <div className="text-xs text-slate-500">{a.grade}-сынып · мерзімі: {fmtDue(a.due_at)}</div>
              </div>
              {isStaff(profile) ? null : chip}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
