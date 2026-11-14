import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GRADES, MATERIAL_TYPES, STAFF_ONLY_TYPES, getUnits } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Кітапхана' };

/**
 * Кітапхана — қабатты шолу: сынып → тоқсан → бөлім → тақырып → материалдар.
 * URL: /library?grade=8&term=2&unit=<id>&topic=<id>. Іздеу (q) берілсе — тегіс тізім.
 */
type SP = { grade?: string; term?: string; unit?: string; topic?: string; type?: string; q?: string };
type Mat = { id: string; title: string; description: string; type: string; unit_id: string | null; topic_id: string | null };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const profile = await requireUser();
  const grade = Number(sp.grade) || profile.current_grade || 7;
  const units = await getUnits(grade);
  const isStaff = profile.role === 'teacher' || profile.role === 'admin';
  const typeOptions = Object.entries(MATERIAL_TYPES).filter(([k]) => isStaff || !STAFF_ONLY_TYPES.includes(k));

  const supabase = await createClient();
  const { data } = await supabase
    .from('materials')
    .select('id, title, description, type, unit_id, topic_id')
    .eq('status', 'published')
    .eq('grade', grade)
    .order('sort_order')
    .order('title');
  const everything = (data ?? []) as Mat[];
  // ҚМЖ санға кірмейді және тақырып ішінде бөлек блокта көрсетіледі
  const all = everything.filter((m) => !STAFF_ONLY_TYPES.includes(m.type));
  const plans = everything.filter((m) => STAFF_ONLY_TYPES.includes(m.type));

  const unit = units.find((u) => u.id === sp.unit) ?? null;
  const topic = unit?.topics.find((t) => t.id === sp.topic) ?? null;
  const term = unit?.term ?? (Number(sp.term) || null);
  const terms = [...new Set(units.map((u) => u.term).filter((t): t is number => t != null))].sort();
  const noTermUnits = units.filter((u) => u.term == null);

  const countUnit = (id: string) => all.filter((m) => m.unit_id === id).length;
  const countTopic = (id: string) => all.filter((m) => m.topic_id === id).length;
  const countTerm = (t: number) => units.filter((u) => u.term === t).reduce((s, u) => s + countUnit(u.id), 0);

  const href = (p: Partial<SP>) => {
    const q = new URLSearchParams();
    Object.entries({ grade: String(grade), ...p }).forEach(([k, v]) => v && q.set(k, String(v)));
    return `/library?${q.toString()}`;
  };

  // Іздеу режимі
  const search = sp.q?.trim();
  let found: Mat[] = [];
  if (search) {
    let q = supabase
      .from('materials')
      .select('id, title, description, type, unit_id, topic_id')
      .eq('status', 'published')
      .eq('grade', grade)
      .textSearch('search_tsv', search.slice(0, 100), { type: 'websearch', config: 'simple' })
      .limit(50);
    if (sp.type && typeOptions.some(([k]) => k === sp.type)) q = q.eq('type', sp.type);
    found = ((await q).data ?? []) as Mat[];
  }

  const Crumbs = () => (
    <nav aria-label="Жол" className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
      <Link href={href({})} className="hover:underline">{grade}-сынып</Link>
      {term && (<><span>›</span><Link href={href({ term: String(term) })} className="hover:underline">{term}-тоқсан</Link></>)}
      {unit && (<><span>›</span><Link href={href({ unit: unit.id })} className="hover:underline">{unit.title}</Link></>)}
      {topic && (<><span>›</span><span className="font-medium text-slate-900">{topic.title}</span></>)}
    </nav>
  );

  const Tile = ({ to, title, sub }: { to: string; title: string; sub?: string }) => (
    <Link href={to} className="card block hover:border-brand-500">
      <div className="font-medium">{title}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Link>
  );

  const Plans = ({ items }: { items: Mat[] }) =>
    items.length ? (
      <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
        <h2 className="text-sm font-semibold text-amber-900">ҚМЖ · тек мұғалімге көрінеді</h2>
        <MatList items={items} />
      </section>
    ) : null;

  const MatList = ({ items }: { items: Mat[] }) => (
    <div className="space-y-3">
      {items.map((m) => (
        <Link key={m.id} href={`/library/${m.id}`} className="card flex items-center gap-3 hover:border-brand-500">
          <span className={`chip shrink-0 ${STAFF_ONLY_TYPES.includes(m.type) ? 'bg-amber-100 text-amber-900' : ''}`}>{MATERIAL_TYPES[m.type] ?? m.type}</span>
          <span className="font-medium">{m.title}</span>
        </Link>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (search) {
    body = found.length ? <MatList items={found} /> : <div className="card text-slate-500">Материал табылмады.</div>;
  } else if (topic) {
    const items = all.filter((m) => m.topic_id === topic.id);
    const tp = plans.filter((m) => m.topic_id === topic.id);
    body = (
      <div className="space-y-4">
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/homework/compose?topic=${topic.id}`} className="btn btn-secondary text-sm">🎯 Үй жұмысын құрастыру</Link>
          </div>
        )}
        {isStaff && <Plans items={tp} />}
        {items.length ? <MatList items={items} /> : <div className="card text-slate-500">Бұл тақырыпта материал әлі жоқ.</div>}
      </div>
    );
  } else if (unit) {
    const direct = all.filter((m) => m.unit_id === unit.id && !m.topic_id);
    body = (
      <div className="space-y-4">
        {isStaff && <Plans items={plans.filter((m) => m.unit_id === unit.id && !m.topic_id)} />}
        {unit.topics.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {unit.topics.map((t) => <Tile key={t.id} to={href({ unit: unit.id, topic: t.id })} title={t.title} sub={`${countTopic(t.id)} материал${isStaff && plans.some((m) => m.topic_id === t.id) ? ' · ҚМЖ бар' : ''}`} />)}
          </div>
        )}
        {direct.length > 0 && <MatList items={direct} />}
        {unit.topics.length === 0 && direct.length === 0 && <div className="card text-slate-500">Материал әлі жоқ.</div>}
      </div>
    );
  } else if (term) {
    const list = units.filter((u) => u.term === term);
    body = list.length ? (
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((u) => <Tile key={u.id} to={href({ unit: u.id })} title={u.title} sub={`${u.topics.length} тақырып · ${countUnit(u.id)} материал`} />)}
      </div>
    ) : <div className="card text-slate-500">Бұл тоқсанда материал әлі жоқ.</div>;
  } else {
    const loose = all.filter((m) => !m.unit_id);
    body = (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((t) => (
            terms.includes(t)
              ? <Tile key={t} to={href({ term: String(t) })} title={`${t}-тоқсан`} sub={`${countTerm(t)} материал`} />
              : <div key={t} className="card text-slate-400"><div className="font-medium">{t}-тоқсан</div><div className="mt-1 text-xs">әлі жоқ</div></div>
          ))}
        </div>
        {noTermUnits.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {noTermUnits.map((u) => <Tile key={u.id} to={href({ unit: u.id })} title={u.title} sub={`${countUnit(u.id)} материал`} />)}
          </div>
        )}
        {loose.length > 0 && <MatList items={loose} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Кітапхана</h1>

      <nav aria-label="Сынып" className="flex flex-wrap gap-2">
        {GRADES.map((g) => (
          <Link key={g} href={`/library?grade=${g}`} className={`btn ${g === grade ? 'btn-primary' : 'btn-secondary'}`}>{g}-сынып</Link>
        ))}
      </nav>

      <form className="flex flex-col gap-2 sm:flex-row" action="/library">
        <input type="hidden" name="grade" value={grade} />
        <input name="q" defaultValue={sp.q} placeholder={`${grade}-сынып материалдарынан іздеу…`} className="input sm:flex-1" aria-label="Іздеу" />
        <select name="type" defaultValue={sp.type ?? ''} className="input sm:w-48" aria-label="Түрі">
          <option value="">Барлық түр</option>
          {typeOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-primary">Іздеу</button>
      </form>

      {search ? <p className="text-sm text-slate-600">«{search}» бойынша нәтижелер · <Link href={href({})} className="underline">тазалау</Link></p> : <Crumbs />}
      {body}
    </div>
  );
}
