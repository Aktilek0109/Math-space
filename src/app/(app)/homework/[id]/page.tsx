import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDue } from '@/lib/homework';
import { HomeworkTasks, type HwTask } from '@/components/HomeworkTasks';

/** Үй тапсырмасы: мұғалім не бергені ғана көрінеді (тапсыру/тексеру жоқ). */
export default async function HomeworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireUser();
  const supabase = await createClient();
  const { data: a } = await supabase
    .from('assignments')
    .select('id, title, description, grade, due_at, created_at, material_id, mode, materials(title), classes(name)')
    .eq('id', id)
    .maybeSingle();
  if (!a) notFound();
  let items: HwTask[] = [];
  if (a.mode === 'tasks') {
    const { data } = await supabase
      .from('homework_items')
      .select('id, parent_item_id, student_id, position, body_json')
      .eq('assignment_id', id)
      .order('position');
    items = ((data ?? []) as unknown as HwTask[]).filter((i) => !i.parent_item_id && (!i.student_id || i.student_id === profile.id));
  }
  const material = a.materials as unknown as { title: string } | null;
  const cls = (a.classes as unknown as { name: string } | null)?.name;

  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <Link href="/homework" className="text-sm text-brand-600 hover:underline">← Үй тапсырмалары</Link>
      <header className="card space-y-2">
        <h1 className="text-xl font-semibold">{a.title}</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="chip">{cls ?? `${a.grade}-сынып`}</span>
          <span className="chip">Берілді: {fmtDue(a.created_at)}</span>
          <span className="chip">Мерзімі: {fmtDue(a.due_at)}</span>
        </div>
        {a.description && <p className="whitespace-pre-wrap text-slate-700">{a.description}</p>}
        {a.material_id && material && (
          <Link href={`/library/${a.material_id}`} className="btn btn-secondary">📄 {material.title}</Link>
        )}
      </header>
      {items.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Есептер ({items.length})</h2>
          <HomeworkTasks items={items} />
        </section>
      )}
      {isStaff(profile) && (
        <div className="card text-sm text-slate-600">
          Бұл — оқушы көретін бет. Өңдеу/жою: <Link className="underline" href={`/admin/homework/${a.id}`}>тапсырма бетінде</Link>.
        </div>
      )}
    </article>
  );
}
