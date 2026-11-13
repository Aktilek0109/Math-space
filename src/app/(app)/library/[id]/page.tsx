import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MATERIAL_TYPES } from '@/lib/catalog';

const PREVIEWABLE = ['application/pdf', 'image/png', 'image/jpeg'];

function fmtSize(b: number) {
  return b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : `${Math.ceil(b / 1024)} КБ`;
}

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();
  const { data: m } = await supabase
    .from('materials')
    .select('id, title, description, grade, type, language, external_url, topic_id, units(title), topics(title), material_assets(id, original_name, mime_type, size_bytes, position, is_current)')
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

  return (
    <article className="space-y-4">
      <Link href={`/library?grade=${m.grade}`} className="text-sm text-brand-600 hover:underline">← {m.grade}-сынып кітапханасы</Link>
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
        <section className="card p-0">
          {first.mime_type === 'application/pdf' ? (
            <iframe title={first.original_name} src={`/api/library/${m.id}/file?asset=${first.id}`} className="h-[75vh] w-full rounded-xl" />
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
