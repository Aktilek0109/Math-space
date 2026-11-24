import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClassesPanel, type ClassRow, type Person } from './ClassesPanel';

export const metadata: Metadata = { title: 'Сыныптар' };

/** Сыныптар: мұғалім бекіту және оқушыларды сыныпқа бөлу (тек әкімші). */
export default async function ClassesPage() {
  await requireRole(['admin']);
  const admin = createAdminClient();
  const [{ data: classes }, { data: people }, { data: members }, { data: ta }] = await Promise.all([
    admin.from('classes').select('id, name, grade, academic_year').order('grade').order('name'),
    admin.from('profiles').select('id, username, full_name, role, current_grade, is_active').in('role', ['student', 'teacher', 'admin']).order('full_name').limit(2000),
    admin.from('class_members').select('class_id, student_id').limit(5000),
    admin.from('teacher_assignments').select('class_id, teacher_id'),
  ]);
  const ps = (people ?? []) as (Person & { role: string; is_active: boolean })[];
  const byId = new Map(ps.map((p) => [p.id, p]));
  const mem = (members ?? []) as { class_id: string; student_id: string }[];
  const tas = (ta ?? []) as { class_id: string; teacher_id: string }[];
  const rows: ClassRow[] = ((classes ?? []) as { id: string; name: string; grade: number; academic_year: string }[]).map((c) => ({
    ...c,
    students: mem.filter((m) => m.class_id === c.id).map((m) => byId.get(m.student_id)).filter((p): p is Person & { role: string; is_active: boolean } => !!p),
    teachers: tas.filter((t) => t.class_id === c.id).map((t) => byId.get(t.teacher_id)).filter((p): p is Person & { role: string; is_active: boolean } => !!p),
  }));
  const inClass = new Set(mem.map((m) => m.student_id));
  const teachers = ps.filter((p) => (p.role === 'teacher' || p.role === 'admin') && p.is_active);
  const students = ps.filter((p) => p.role === 'student' && p.is_active);
  const unassigned = students.filter((p) => !inClass.has(p.id));

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Сыныптар</h1>
      <p className="text-sm text-slate-600">Мұғалім тек өзіне бекітілген сыныптардың оқушыларын (жылу картасы, мониторинг, үй тапсырмасы) көреді. Әкімші барлығын көреді.</p>
      <ClassesPanel classes={rows} teachers={teachers} students={students} unassigned={unassigned} />
    </div>
  );
}
