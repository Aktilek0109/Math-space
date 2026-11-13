import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Тексеруді күтетін жауаптар' };

export default async function PendingPage() {
  await requireRole(['teacher', 'admin']);
  const supabase = await createClient();
  // RLS: мұғалімге тек бекітілген сынып оқушыларының нәтижелері көрінеді
  const { data } = await supabase
    .from('results')
    .select('session_id, marks_earned, marks_possible, created_at, profiles!results_user_id_fkey(username, full_name)')
    .eq('pending_manual', true)
    .order('created_at')
    .limit(100);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Ашық жауаптарды тексеру</h1>
      {(data ?? []).length === 0 && <div className="card text-slate-500">Тексеруді күтетін жауап жоқ.</div>}
      <ul className="space-y-2">
        {(data ?? []).map((r) => {
          const p = r.profiles as unknown as { username: string; full_name: string } | null;
          return (
            <li key={r.session_id} className="card flex items-center justify-between text-sm">
              <span>{p?.full_name || p?.username} · {new Date(r.created_at).toLocaleString('kk-KZ')}</span>
              <Link href={`/results/${r.session_id}`} className="btn btn-primary px-3 py-1">Тексеру</Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
