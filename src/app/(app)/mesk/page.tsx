import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MESK_GRADES, isMeskGrade, getUnits } from '@/lib/catalog';
import { isStaff } from '@/lib/auth';
import { MathText } from '@/components/MathText';

export const metadata: Metadata = { title: 'МЭСК тапсырмалар банкі' };

type SP = { grade?: string; unit?: string; year?: string; component?: string; page?: string };
const PER_PAGE = 20;

export default async function MeskBankPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const profile = await requireUser();
  if (!isStaff(profile) && !isMeskGrade(profile.current_grade)) redirect('/dashboard');
  const want = Number(sp.grade) || profile.current_grade || 10;
  const grade = isMeskGrade(want) ? want : 10;
  const page = Math.max(1, Number(sp.page) || 1);
  const units = await getUnits(grade);
  const supabase = await createClient();

  let q = supabase
    .from('questions')
    .select('id, body_json, question_type, marks, difficulty, exam_year, component, unit_id', { count: 'exact' })
    .eq('status', 'published')
    .eq('grade', grade)
    .contains('exam_types', ['MESK'])
    .order('unit_id')
    .order('created_at')
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (sp.unit) q = q.eq('unit_id', sp.unit);
  if (sp.year) q = q.eq('exam_year', Number(sp.year));
  if (sp.component) q = q.eq('component', sp.component);
  const { data: questions, count } = await q;
  const unitTitle = new Map(units.map((u) => [u.id, u.title]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">МЭСК тапсырмалар банкі</h1>
        <Link href={`/mesk/mock/new?grade=${grade}`} className="btn btn-primary">Пробный құрастыру</Link>
      </div>

      <form className="card grid grid-cols-2 gap-2 sm:grid-cols-5" action="/mesk">
        <select name="grade" defaultValue={grade} className="input" aria-label="Сынып">
          {MESK_GRADES.map((g) => <option key={g} value={g}>{g}-сынып</option>)}
        </select>
        <select name="unit" defaultValue={sp.unit ?? ''} className="input sm:col-span-2" aria-label="Бөлім">
          <option value="">Барлық бөлім</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
        </select>
        <input name="year" defaultValue={sp.year} placeholder="Жыл" inputMode="numeric" className="input" aria-label="Жыл" />
        <input name="component" defaultValue={sp.component} placeholder="Компонент (Paper 1)" className="input" aria-label="Компонент" />
        <button className="btn btn-secondary col-span-2 sm:col-span-5">Сүзу</button>
      </form>

      <p className="text-sm text-slate-600">Табылды: {count ?? 0} тапсырма</p>
      <div className="space-y-3">
        {(questions ?? []).map((qq, i) => (
          <article key={qq.id} className="card space-y-2">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="chip">№{(page - 1) * PER_PAGE + i + 1}</span>
              {qq.unit_id && <span className="chip">{unitTitle.get(qq.unit_id)}</span>}
              {qq.component && <span className="chip">{qq.component}</span>}
              {qq.exam_year && <span className="chip">{qq.exam_year}</span>}
              <span className="chip">{Number(qq.marks)} ұпай</span>
            </div>
            <MathText text={(qq.body_json as { text: string }).text} className="block" />
            {((qq.body_json as { options?: { id: string; text: string }[] }).options ?? []).length > 0 && (
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {(qq.body_json as { options: { id: string; text: string }[] }).options.map((o) => (
                  <li key={o.id}><b>{o.id})</b> <MathText text={o.text} /></li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
      {pages > 1 && (
        <nav className="flex justify-center gap-2" aria-label="Беттер">
          {Array.from({ length: pages }, (_, i) => i + 1).slice(0, 20).map((p) => {
            const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), grade: String(grade), page: String(p) });
            return <Link key={p} href={`/mesk?${params}`} className={`btn ${p === page ? 'btn-primary' : 'btn-secondary'} px-3 py-1`}>{p}</Link>;
          })}
        </nav>
      )}
    </div>
  );
}
