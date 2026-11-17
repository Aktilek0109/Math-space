import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadHeatmap, PERIODS, SOURCE_LABEL, type Source } from '@/lib/heatmap';
import { HeatTable } from './HeatTable';

export const metadata: Metadata = { title: 'Жылу картасы' };

/** ТЗ М5: сыныптың жылу картасы — оқушылар × оқу мақсаттары. */
export default async function HeatmapPage({ searchParams }: { searchParams: Promise<{ class?: string; term?: string; source?: string; period?: string; sort?: string }> }) {
  await requireRole(['teacher', 'admin']);
  const sp = await searchParams;
  const source = (['all', 'exam', 'homework', 'practice'].includes(sp.source ?? '') ? sp.source : 'all') as Source;
  const period = PERIODS[sp.period ?? ''] ? sp.period! : 'all';
  const term = Number(sp.term) || undefined;
  const db = await createClient();
  const h = await loadHeatmap(db, { classId: sp.class, term, source, period });
  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur = { class: h.cls?.id, term: term ? String(term) : undefined, source, period, sort: sp.sort, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v && !(k === 'source' && v === 'all') && !(k === 'period' && v === 'all')) p.set(k, v);
    return `/admin/heatmap?${p}`;
  };
  const pill = (active: boolean) => `rounded-full px-3 py-1 text-sm ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Жылу картасы</h1>
          <p className="text-sm text-slate-600">Әр ұяшық — оқушының оқу мақсатын меңгеруі: соңғы 10 дәлел, жаңасына салмақ көп, көмекпен шыққаны жартылай. Бозғылт — дәлел 3-тен аз.</p>
        </div>
        {h.cls && <a className="btn btn-secondary text-sm" href={`/api/admin/heatmap/export?class=${h.cls.id}&source=${source}&period=${period}${term ? `&term=${term}` : ''}`}>⬇ CSV (Excel)</a>}
      </div>
      <div className="flex flex-wrap gap-2">
        {h.classes.map((c) => <Link key={c.id} href={q({ class: c.id, term: undefined })} className={pill(c.id === h.cls?.id)}>{c.name}</Link>)}
      </div>
      {h.cls && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <div className="flex flex-wrap gap-1"><Link href={q({ term: undefined })} className={pill(!term)}>Барлық тоқсан</Link>{h.terms!.map((t) => <Link key={t} href={q({ term: String(t) })} className={pill(term === t)}>{t}-тоқсан</Link>)}</div>
          <div className="flex flex-wrap gap-1">{(Object.keys(SOURCE_LABEL) as Source[]).map((s) => <Link key={s} href={q({ source: s })} className={pill(source === s)}>{SOURCE_LABEL[s]}</Link>)}</div>
          <div className="flex flex-wrap gap-1">{Object.entries(PERIODS).map(([k, v]) => <Link key={k} href={q({ period: k })} className={pill(period === k)}>{v.label}</Link>)}</div>
        </div>
      )}
      {!h.cls ? <div className="card text-slate-500">Сыныптар жоқ.</div> : h.students!.length === 0 ? (
        <div className="card text-slate-500">Бұл сыныпта оқушы жоқ немесе оларды көруге рұқсат жоқ.</div>
      ) : h.objectives!.length === 0 ? (
        <div className="card text-slate-500">Бұл тоқсанда оқу мақсаттары байланған есептер әлі жоқ.</div>
      ) : (
        <HeatTable
          classId={h.cls.id}
          grade={h.cls.grade}
          sort={sp.sort === 'avg' ? 'avg' : 'name'}
          sortHref={{ name: q({ sort: undefined }), avg: q({ sort: 'avg' }) }}
          students={h.students!}
          objectives={h.objectives!}
          cells={Object.fromEntries(h.cells!)}
          rowAvg={Object.fromEntries(h.rowAvg!)}
          colAvg={Object.fromEntries(h.colAvg!)}
          errors={Object.fromEntries(h.errors!)}
        />
      )}
    </div>
  );
}
