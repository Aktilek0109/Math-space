import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadProgress } from '@/lib/progress';

export const metadata: Metadata = { title: 'Сынып мониторингі' };

/** ТЗ 15: мұғалім өз сыныбындағы әр оқушының есебін көреді (RLS: can_view_student). */
export default async function ClassProgress({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  await requireRole(['teacher', 'admin']);
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: classes } = await supabase.from('classes').select('id, name, grade').order('grade').order('name');
  const cls = (classes ?? []).find((c) => c.id === sp.class) ?? (classes ?? [])[0];

  let rows: { id: string; name: string; units: Map<string, { pct: number | null; items: number; checked: number; total: number }> }[] = [];
  let unitCols: { id: string; title: string; term: number | null }[] = [];
  if (cls) {
    const { data: members } = await supabase.from('class_members').select('profiles(id, full_name, username, is_active)').eq('class_id', cls.id);
    const students = ((members ?? []) as unknown as { profiles: { id: string; full_name: string; username: string; is_active: boolean } | null }[])
      .map((m) => m.profiles).filter((p): p is NonNullable<typeof p> => !!p && p.is_active)
      .sort((a, b) => (a.full_name || a.username).localeCompare(b.full_name || b.username, 'kk'));
    const results = await Promise.all(students.map(async (s) => ({ s, p: await loadProgress(supabase, s.id, cls.grade) })));
    const first = results[0]?.p.terms.flatMap((t) => t.units) ?? [];
    unitCols = first.map((u) => ({ id: u.id, title: u.title, term: u.term }));
    rows = results.map(({ s, p }) => ({
      id: s.id,
      name: s.full_name || s.username,
      units: new Map(p.terms.flatMap((t) => t.units).map((u) => [u.id, { pct: u.stat.items ? u.stat.pct : null, items: u.stat.items, checked: u.checked, total: u.objectives.length }])),
    }));
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Сынып мониторингі</h1>
      <p className="text-sm text-slate-600">Бөлім бойынша дербес тапсырмалар ұпайларының қосындысы. Оқушының атын басып, тақырып пен оқу мақсаттарына дейін ашыңыз.</p>
      <nav className="flex flex-wrap gap-2">
        {(classes ?? []).map((c) => (
          <Link key={c.id} href={`/admin/progress?class=${c.id}`} className={`btn ${c.id === cls?.id ? 'btn-primary' : 'btn-secondary'}`}>{c.name}</Link>
        ))}
      </nav>
      {!cls ? <div className="card text-slate-500">Сыныптар жоқ.</div> : rows.length === 0 ? (
        <div className="card text-slate-500">Бұл сыныпта оқушы жоқ немесе оларды көруге рұқсат жоқ.</div>
      ) : (
        <section className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="p-3">Оқушы</th>
                {unitCols.map((u) => <th key={u.id} className="p-3" title={u.title}>{u.term ? `${u.term}т · ` : ''}{u.title.length > 28 ? u.title.slice(0, 28) + '…' : u.title}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="p-3"><Link href={`/results/progress?u=${r.id}`} className="font-medium text-brand-600 hover:underline">{r.name}</Link></td>
                  {unitCols.map((u) => {
                    const v = r.units.get(u.id);
                    return (
                      <td key={u.id} className="p-3">
                        {v?.pct != null ? <span className={v.pct >= 80 ? 'text-emerald-700' : v.pct < 50 ? 'text-red-700' : ''}>{v.pct}%</span> : <span className="text-slate-400">—</span>}
                        {v && <div className="text-xs text-slate-500">{v.checked}/{v.total} мақсат</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
