import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GRADES, MATERIAL_TYPES, getUnits } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Кітапхана' };
const PER_PAGE = 20;

type SP = { grade?: string; unit?: string; topic?: string; type?: string; q?: string; page?: string };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const profile = await requireUser();
  const grade = Number(sp.grade) || profile.current_grade || 7;
  const page = Math.max(1, Number(sp.page) || 1);
  const units = await getUnits(grade);

  const supabase = await createClient();
  let q = supabase
    .from('materials')
    .select('id, title, description, type, language, unit_id, topic_id, units(title), topics(title)', { count: 'exact' })
    .eq('status', 'published')
    .eq('grade', grade)
    .order('sort_order')
    .order('created_at', { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (sp.unit) q = q.eq('unit_id', sp.unit);
  if (sp.topic) q = q.eq('topic_id', sp.topic);
  if (sp.type && sp.type in MATERIAL_TYPES) q = q.eq('type', sp.type);
  if (sp.q?.trim()) q = q.textSearch('search_tsv', sp.q.trim().slice(0, 100), { type: 'websearch', config: 'simple' });
  const { data: materials, count } = await q;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));

  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { grade: String(grade), unit: sp.unit, topic: sp.topic, type: sp.type, q: sp.q, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/library?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Кітапхана</h1>

      <nav aria-label="Сынып" className="flex flex-wrap gap-2">
        {GRADES.map((g) => (
          <Link key={g} href={`/library?grade=${g}`} className={`btn ${g === grade ? 'btn-primary' : 'btn-secondary'}`}>
            {g}-сынып
          </Link>
        ))}
      </nav>

      <form className="flex flex-col gap-2 sm:flex-row" action="/library">
        <input type="hidden" name="grade" value={grade} />
        {sp.unit && <input type="hidden" name="unit" value={sp.unit} />}
        <input name="q" defaultValue={sp.q} placeholder="Материал іздеу…" className="input sm:flex-1" aria-label="Іздеу" />
        <select name="type" defaultValue={sp.type ?? ''} className="input sm:w-48" aria-label="Түрі">
          <option value="">Барлық түр</option>
          {Object.entries(MATERIAL_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn btn-primary">Іздеу</button>
      </form>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <aside className="card h-fit text-sm">
          <h2 className="mb-2 font-semibold">Бөлімдер</h2>
          <Link href={link({ unit: undefined, topic: undefined, page: undefined })} className={`block rounded px-2 py-1 ${!sp.unit ? 'bg-brand-50 font-medium' : 'hover:bg-slate-50'}`}>
            Барлығы
          </Link>
          {units.map((u) => (
            <div key={u.id}>
              <Link href={link({ unit: u.id, topic: undefined, page: undefined })} className={`block rounded px-2 py-1 ${sp.unit === u.id && !sp.topic ? 'bg-brand-50 font-medium' : 'hover:bg-slate-50'}`}>
                {u.term ? `${u.term}-тоқсан · ` : ''}{u.title}
              </Link>
              {sp.unit === u.id &&
                u.topics.map((t) => (
                  <Link key={t.id} href={link({ unit: u.id, topic: t.id, page: undefined })} className={`ml-3 block rounded px-2 py-1 text-slate-600 ${sp.topic === t.id ? 'bg-brand-50 font-medium' : 'hover:bg-slate-50'}`}>
                    {t.title}
                  </Link>
                ))}
            </div>
          ))}
          {units.length === 0 && <p className="text-slate-500">Бөлімдер әлі енгізілмеген.</p>}
        </aside>

        <section aria-label="Материалдар" className="space-y-3">
          {(materials ?? []).length === 0 && <div className="card text-slate-500">Материал табылмады.</div>}
          {(materials ?? []).map((m) => (
            <Link key={m.id} href={`/library/${m.id}`} className="card block hover:border-brand-500">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip">{MATERIAL_TYPES[m.type] ?? m.type}</span>
                {(m.units as unknown as { title: string } | null)?.title && <span className="text-xs text-slate-500">{(m.units as unknown as { title: string }).title}</span>}
              </div>
              <h3 className="mt-1 font-medium">{m.title}</h3>
              {m.description && <p className="line-clamp-2 text-sm text-slate-600">{m.description}</p>}
            </Link>
          ))}
          {pages > 1 && (
            <nav aria-label="Беттер" className="flex items-center justify-center gap-2 pt-2">
              {page > 1 && <Link className="btn btn-secondary" href={link({ page: String(page - 1) })}>← Алдыңғы</Link>}
              <span className="text-sm text-slate-600">{page} / {pages}</span>
              {page < pages && <Link className="btn btn-secondary" href={link({ page: String(page + 1) })}>Келесі →</Link>}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
