import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getUnits, MATERIAL_TYPES } from '@/lib/catalog';
import { setMaterialStatus } from './actions';
import { UploadForm } from './UploadForm';

export const metadata: Metadata = { title: 'Материалдар' };

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', review: 'Тексеруде', published: 'Жарияланған', archived: 'Архив' };

export default async function AdminMaterials({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  await requireRole(['teacher', 'admin']);
  const supabase = await createClient();
  const units = await getUnits();
  let q = supabase.from('materials').select('id, title, grade, type, status, updated_at, material_assets(count)').order('updated_at', { ascending: false }).limit(100);
  if (sp.status) q = q.eq('status', sp.status);
  const { data: materials } = await q;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/materials" className={`btn ${!sp.status ? 'btn-primary' : 'btn-secondary'} px-3 py-1`}>Барлығы</Link>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <Link key={k} href={`/admin/materials?status=${k}`} className={`btn ${sp.status === k ? 'btn-primary' : 'btn-secondary'} px-3 py-1`}>{v}</Link>
          ))}
        </div>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-2">Атауы</th><th className="p-2">Сынып</th><th className="p-2">Түрі</th><th className="p-2">Мәртебе</th><th className="p-2"></th></tr></thead>
            <tbody>
              {(materials ?? []).map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="p-2"><Link href={`/library/${m.id}`} className="hover:underline">{m.title}</Link></td>
                  <td className="p-2">{m.grade}</td>
                  <td className="p-2">{MATERIAL_TYPES[m.type]}</td>
                  <td className="p-2"><span className="chip">{STATUS_LABEL[m.status]}</span></td>
                  <td className="p-2">
                    <form action={setMaterialStatus} className="flex gap-1">
                      <input type="hidden" name="id" value={m.id} />
                      {m.status !== 'published' && <button name="status" value="published" className="btn btn-primary px-2 py-1 text-xs">Жариялау</button>}
                      {m.status === 'published' && <button name="status" value="draft" className="btn btn-secondary px-2 py-1 text-xs">Жасыру</button>}
                      {m.status !== 'archived' && <button name="status" value="archived" className="btn btn-secondary px-2 py-1 text-xs">Архив</button>}
                    </form>
                  </td>
                </tr>
              ))}
              {(materials ?? []).length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Материал жоқ.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <aside>
        <Link href="/admin/materials/bulk" className="btn btn-secondary mb-3 w-full">📁 Папкадан жаппай импорт</Link>
        <h2 className="mb-2 font-semibold">Жаңа материал</h2>
        <UploadForm units={units.map((u) => ({ id: u.id, grade: u.grade, title: u.title, topics: u.topics.map((t) => ({ id: t.id, title: t.title })) }))} />
      </aside>
    </div>
  );
}
