import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MATERIAL_TYPES, STAFF_ONLY_TYPES } from '@/lib/catalog';
import { PdfViewer } from '@/components/PdfViewer';

const PREVIEWABLE = ['application/pdf', 'image/png', 'image/jpeg'];

function fmtSize(b: number) {
  return b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.ceil(b / 1024)} КБ`;
}

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  const isStaff = profile.role === 'teacher' || profile.role === 'admin';
  const supabase = await createClient();
  const { data: m } = await supabase
    .from('materials')
    .select('id, title, description, grade, type, language, external_url, unit_id, topic_id, units(id, title, term), topics(id, title), material_assets(id, original_name, mime_type, size_bytes, position, is_current)')
    .eq('id', id)
    .maybeSingle();
  if (!m) notFound();

  const assets = ((m.material_assets ?? []) as { id: string; original_name: string; mime_type: string; size_bytes: number; position: number; is_current: boolean }[])
    .filter((a) => a.is_current)
    .sort((a, b) => a.position - b.position);
  const first = assets.find((a) => PREVIEWABLE.includes(a.mime_type));

  // Байланысты есептер (сол тақырып бойынша жарияланған сұрақтар саны)
  let relatedCount = 0;
  if (m.topic_id) {
    const { count } = await supabase.from('question_topics').select('question_id', { count: 'exact', head: true }).eq('topic_id', m.topic_id);
    relatedCount = count ?? 0;
  }

  // Қайту жолы: материал жатқан папкаға (тақырып/бөлім) тікелей
  const unit = m.units as unknown as { id: string; title: string; term: number | null } | null;
  const topic = m.topics as unknown as { id: string; title: string } | null;
  const lib = (p: Record<string, string | number | null | undefined>) => {
    const q = new URLSearchParams();
    Object.entries({ grade: m.grade, ...p }).forEach(([k, v]) => v != null && v !== '' && q.set(k, String(v)));
    return `/library?${q.toString()}`;
  };
  const folderHref = topic && unit ? lib({ unit: unit.id, topic: topic.id }) : unit ? lib({ unit: unit.id }) : lib({});
  const folderTitle = topic?.title ?? unit?.title ?? `${m.grade}-сынып кітапханасы`;

  // Сол папкадағы басқа материалдар — қате ашса, бірден дұрысына өтуге болады
  let siblings: { id: string; title: string; type: string }[] = [];
  if (m.topic_id || m.unit_id) {
    let sq = supabase.from('materials').select('id, title, type').eq('status', 'published').eq('grade', m.grade).order('sort_order').order('title');
    sq = m.topic_id ? sq.eq('topic_id', m.topic_id) : sq.eq('unit_id', m.unit_id as string).is('topic_id', null);
    siblings = ((await sq).data ?? []) as { id: string; title: string; type: string }[];
    if (!isStaff) siblings = siblings.filter((x) => !STAFF_ONLY_TYPES.includes(x.type) || x.id === m.id);
  }
  const idx = siblings.findIndex((x) => x.id === m.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  return (
    <article className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={folderHref} className="btn btn-secondary text-sm">← {folderTitle}</Link>
        <nav aria-label="Жол" className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
          <Link href={lib({})} className="hover:underline">{m.grade}-сынып</Link>
          {unit?.term && (<><span>›</span><Link href={lib({ term: unit.term })} className="hover:underline">{unit.term}-тоқсан</Link></>)}
          {unit && (<><span>›</span><Link href={lib({ unit: unit.id })} className="hover:underline">{unit.title}</Link></>)}
          {topic && unit && (<><span>›</span><Link href={lib({ unit: unit.id, topic: topic.id })} className="hover:underline">{topic.title}</Link></>)}
        </nav>
      </div>
      {(prev || next) && (
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          {prev ? <Link href={`/library/${prev.id}`} className="btn btn-secondary max-w-[48%] truncate">‹ {prev.title}</Link> : <span />}
          {next ? <Link href={`/library/${next.id}`} className="btn btn-secondary max-w-[48%] truncate">{next.title} ›</Link> : <span />}
        </div>
      )}
      {siblings.length > 1 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">📂 Осы папкадағы материалдар ({siblings.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {siblings.map((x) => (
              <li key={x.id} className="py-1.5 text-sm">
                {x.id === m.id
                  ? <span className="font-semibold text-brand-600">▸ {x.title}</span>
                  : <Link href={`/library/${x.id}`} className="hover:underline"><span className="chip mr-2">{MATERIAL_TYPES[x.type] ?? x.type}</span>{x.title}</Link>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <header>
        <div className="flex flex-wrap gap-2">
          <span className="chip">{MATERIAL_TYPES[m.type] ?? m.type}</span>
          <span className="chip">{m.grade}-сынып</span>
          {(m.units as unknown as { title: string } | null) && <span className="chip">{(m.units as unknown as { title: string }).title}</span>}
          {(m.topics as unknown as { title: string } | null) && <span className="chip">{(m.topics as unknown as { title: string }).title}</span>}
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{m.title}</h1>
        {m.description && <p className="mt-1 whitespace-pre-wrap text-slate-700">{m.description}</p>}
      </header>

      {m.external_url && (
        <a href={m.external_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Сілтемені ашу ↗</a>
      )}

      {first && (
        <section className={first.mime_type === 'application/pdf' ? 'card bg-slate-50' : 'card p-0'}>
          {first.mime_type === 'application/pdf' ? (
            <PdfViewer title={first.original_name} src={`/api/library/${m.id}/file?asset=${first.id}`} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/library/${m.id}/file?asset=${first.id}`} alt={first.original_name} className="mx-auto max-h-[75vh] rounded-xl" />
          )}
        </section>
      )}

      {assets.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Файлдар</h2>
          <ul className="divide-y divide-slate-100">
            {assets.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate">{a.original_name} <span className="text-slate-500">· {fmtSize(a.size_bytes)}</span></span>
                <a className="btn btn-secondary px-3 py-1" href={`/api/library/${m.id}/file?asset=${a.id}&download=1`}>Жүктеу</a>
              </li>
            ))}
          </ul>
          {assets.some((a) => !PREVIEWABLE.includes(a.mime_type)) && (
            <p className="mt-2 text-xs text-slate-500">DOCX/PPTX файлдарын жүктеп алып ашыңыз.</p>
          )}
        </section>
      )}

      {relatedCount > 0 && (
        <section className="card flex items-center justify-between">
          <span>Осы тақырып бойынша {relatedCount} есеп бар</span>
          <Link href="/practice" className="btn btn-primary">Жаттығу</Link>
        </section>
      )}
    </article>
  );
}
