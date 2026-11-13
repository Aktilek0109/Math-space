import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUnits, GRADES } from '@/lib/catalog';
import { audit } from '@/lib/api';

export const metadata: Metadata = { title: 'Оқу құрылымы' };

async function addUnit(fd: FormData) {
  'use server';
  const actor = await requireRole(['admin']);
  const v = z.object({
    grade: z.coerce.number().int().min(7).max(12),
    term: z.coerce.number().int().min(1).max(4),
    title: z.string().trim().min(2).max(200),
    academic_year: z.string().trim().max(20),
    sort_order: z.coerce.number().int().default(0),
  }).parse(Object.fromEntries(fd));
  const admin = createAdminClient();
  const { data: subject } = await admin.from('subjects').select('id').eq('code', 'math').single();
  const { data } = await admin.from('units').insert({ ...v, subject_id: subject!.id }).select('id').single();
  await audit(actor.id, 'unit.create', 'unit', data?.id, v);
  revalidatePath('/admin/structure');
}

async function addTopic(fd: FormData) {
  'use server';
  const actor = await requireRole(['admin']);
  const v = z.object({
    unit_id: z.string().uuid(),
    title: z.string().trim().min(2).max(300),
    objectives: z.string().max(500).default(''),
    sort_order: z.coerce.number().int().default(0),
  }).parse(Object.fromEntries(fd));
  const { data } = await createAdminClient()
    .from('topics')
    .insert({ unit_id: v.unit_id, title: v.title, sort_order: v.sort_order, learning_objective_codes: v.objectives.split(',').map((s) => s.trim()).filter(Boolean) })
    .select('id')
    .single();
  await audit(actor.id, 'topic.create', 'topic', data?.id, v);
  revalidatePath('/admin/structure');
}

export default async function StructurePage() {
  await requireRole(['admin']);
  const units = await getUnits();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Сынып → тоқсан → бөлім → тақырып</h1>
        {GRADES.map((g) => {
          const list = units.filter((u) => u.grade === g);
          return (
            <div key={g} className="card">
              <h2 className="font-semibold">{g}-сынып</h2>
              {list.length === 0 && <p className="text-sm text-slate-500">Бөлім жоқ</p>}
              {list.map((u) => (
                <details key={u.id} className="mt-2">
                  <summary className="cursor-pointer text-sm">{u.term}-тоқсан · {u.title} <span className="text-slate-400">({u.topics.length} тақырып)</span></summary>
                  <ul className="ml-4 mt-1 list-disc text-sm text-slate-700">{u.topics.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
                  <form action={addTopic} className="ml-4 mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="unit_id" value={u.id} />
                    <input name="title" placeholder="Жаңа тақырып" className="input flex-1 py-1 text-sm" required />
                    <input name="objectives" placeholder="Оқу мақсаты кодтары (7.2.2.1, …)" className="input flex-1 py-1 text-sm" />
                    <button className="btn btn-secondary px-3 py-1">Қосу</button>
                  </form>
                </details>
              ))}
            </div>
          );
        })}
      </section>
      <aside>
        <form action={addUnit} className="card space-y-2">
          <h2 className="font-semibold">Жаңа бөлім</h2>
          <div className="grid grid-cols-2 gap-2">
            <select name="grade" className="input" aria-label="Сынып">{GRADES.map((g) => <option key={g} value={g}>{g}-сынып</option>)}</select>
            <select name="term" className="input" aria-label="Тоқсан">{[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}-тоқсан</option>)}</select>
          </div>
          <input name="title" placeholder="Бөлім атауы" className="input" required />
          <div className="grid grid-cols-2 gap-2">
            <input name="academic_year" defaultValue="2026-2027" className="input" aria-label="Оқу жылы" />
            <input name="sort_order" type="number" defaultValue={0} className="input" aria-label="Реті" />
          </div>
          <button className="btn btn-primary w-full">Қосу</button>
        </form>
      </aside>
    </div>
  );
}
