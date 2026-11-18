import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fmtDue } from '@/lib/homework';
import { HomeworkTasks, type HwTask } from '@/components/HomeworkTasks';
import { DeleteAssignment } from './DeleteAssignment';

/** Жарияланған үй тапсырмасы (мұғалім көрінісі): не берілгені, кімге, мерзімі. Тексеру жоқ. */
export default async function AdminHomeworkItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(['teacher', 'admin']);
  const admin = createAdminClient();
  const { data: a } = await admin
    .from('assignments')
    .select('id, title, description, grade, due_at, created_at, mode, material_id, materials(title), classes(name), profiles!assignments_student_id_fkey(full_name, username)')
    .eq('id', id)
    .maybeSingle();
  if (!a) notFound();
  const [{ data: key }, { data: itemsRaw }] = await Promise.all([
    admin.from('assignment_keys').select('answer_text').eq('assignment_id', id).maybeSingle(),
    a.mode === 'tasks'
      ? admin.from('homework_items')
          .select('id, parent_item_id, student_id, position, body_json, learning_objectives(code, text), homework_item_keys(answer_json, solution_json)')
          .eq('assignment_id', id).is('parent_item_id', null).order('position')
      : Promise.resolve({ data: [] }),
  ]);
  const items = ((itemsRaw ?? []) as unknown as HwTask[]).filter((i) => !i.student_id);
  const cls = (a.classes as unknown as { name: string } | null)?.name;
  const st = a.profiles as unknown as { full_name: string; username: string } | null;
  const material = a.materials as unknown as { title: string } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/homework" className="text-sm text-brand-600 hover:underline">← Үй тапсырмалары</Link>
      <header className="card space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-xl font-semibold">{a.title}</h1>
          <DeleteAssignment id={a.id} />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="chip">{st ? `👤 ${st.full_name || st.username}` : cls ?? `${a.grade}-сынып (барлығы)`}</span>
          <span className="chip">Жарияланды: {fmtDue(a.created_at)}</span>
          <span className="chip">Мерзімі: {fmtDue(a.due_at)}</span>
        </div>
        {a.description && <p className="whitespace-pre-wrap text-slate-700">{a.description}</p>}
        {a.material_id && material && <Link href={`/library/${a.material_id}`} className="btn btn-secondary">📄 {material.title}</Link>}
        {key?.answer_text && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600">Жауаптар (тек сізге)</summary>
            <p className="mt-1 whitespace-pre-wrap">{key.answer_text}</p>
          </details>
        )}
        <Link href={`/homework/${a.id}`} className="text-sm text-brand-600 hover:underline">Оқушы көретін бетті ашу →</Link>
      </header>
      {items.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Есептер ({items.length})</h2>
          <HomeworkTasks items={items} showKeys />
        </section>
      )}
    </div>
  );
}
