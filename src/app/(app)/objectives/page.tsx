import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { objectiveMastery, MASTERY } from '@/lib/objective';
import { StartObjective } from './StartObjective';

export const metadata: Metadata = { title: 'Оқу мақсаты бойынша дайындық' };

const bar = (p: number | null) => (p == null ? 'bg-slate-200' : p >= 80 ? 'bg-[#5E9C78]' : p >= 65 ? 'bg-[#93B172]' : p >= 40 ? 'bg-[#D49A62]' : 'bg-[#CE7468]');

/** ТЗ М3: оқу мақсаттары, меңгеру деңгейі және бейімделетін дайындықты бастау. */
export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const profile = await requireUser();
  const admin = createAdminClient();
  const sp = await searchParams;
  const grade = Number(sp.grade) || (profile.current_grade && [7, 8, 9, 10].includes(profile.current_grade) ? profile.current_grade : 9);
  const [{ data: objs }, { data: counts }, { data: units }, mastery] = await Promise.all([
    admin.from('learning_objectives').select('id, code, text, unit_id, sort_order').eq('grade', grade).order('sort_order'),
    admin.rpc('objective_bank_counts', { p_grade: grade }),
    admin.from('units').select('id, term, title, sort_order').eq('grade', grade).order('term').order('sort_order'),
    objectiveMastery(admin, profile.id),
  ]);
  const cnt = new Map(((counts ?? []) as { objective_id: string; n: number }[]).map((c) => [c.objective_id, c.n]));
  const list = ((objs ?? []) as { id: string; code: string; text: string; unit_id: string | null }[]).filter((o) => cnt.get(o.id));
  const byUnit = ((units ?? []) as { id: string; term: number | null; title: string }[])
    .map((u) => ({ ...u, objs: list.filter((o) => o.unit_id === u.id) }))
    .filter((u) => u.objs.length);
  const orphan = list.filter((o) => !byUnit.some((u) => u.id === o.unit_id));
  if (orphan.length) byUnit.push({ id: 'x', term: null, title: 'Басқа', objs: orphan });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Оқу мақсаты бойынша дайындық</h1>
        <p className="text-sm text-slate-600">
          Мақсатты таңдаңыз — есептер жеңілден басталып, нәтижеңізге қарай қиындайды не жеңілдейді.
          Соңғы 5 есептің орташасы {Math.round(MASTERY * 100)}%-дан асса (жоғары деңгей есебімен қоса), мақсат меңгерілді деп саналады. Соңында кері байланыс беріледі.
        </p>
        <div className="flex gap-2 pt-1 text-sm">
          {[7, 8, 9, 10].map((g) => (
            <Link key={g} href={`/objectives?grade=${g}`} className={`rounded-full px-3 py-1 ${g === grade ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{g}-сынып</Link>
          ))}
        </div>
      </header>
      {byUnit.length === 0 && <p className="text-sm text-slate-500">Бұл сынып үшін банкте есеп әлі жоқ.</p>}
      {byUnit.map((u) => (
        <section key={u.id} className="space-y-2">
          <h2 className="font-semibold">{u.term ? `${u.term}-тоқсан · ` : ''}{u.title}</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {u.objs.map((o) => {
              const m = mastery.get(o.id);
              const p = m ? m.pct : null;
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm"><span className="font-mono text-xs text-slate-500">{o.code}</span> {o.text}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-2 w-40 overflow-hidden rounded bg-slate-100"><div className={`h-full ${bar(p)}`} style={{ width: `${p ?? 0}%` }} /></div>
                      <span className="text-xs text-slate-500">{p == null ? 'әлі дәлел жоқ' : `${p}% · ${m!.n} есеп бойынша`}</span>
                    </div>
                  </div>
                  <StartObjective objectiveId={o.id} label={p != null && p >= 80 ? 'Бекіту' : 'Бастау'} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
