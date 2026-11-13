import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export const HW_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};
export const HW_MAX_FILES = 8;
export const HW_MAX_BYTES = 10 * 1024 * 1024;

export interface Assignment {
  id: string;
  title: string;
  description: string;
  grade: number;
  class_id: string | null;
  material_id: string | null;
  due_at: string | null;
  max_score: number;
  status: string;
  created_at: string;
}

/** Тапсырманы алушы оқушылар: сынып (class) берілсе — оның мүшелері, әйтпесе сол параллельдің барлық белсенді оқушылары. */
export async function assignmentStudents(admin: SupabaseClient, a: Pick<Assignment, 'grade' | 'class_id'>) {
  if (a.class_id) {
    const { data } = await admin
      .from('class_members')
      .select('profiles(id, username, full_name, is_active)')
      .eq('class_id', a.class_id);
    return ((data ?? []) as unknown as { profiles: { id: string; username: string; full_name: string; is_active: boolean } }[])
      .map((r) => r.profiles)
      .filter((p) => p?.is_active)
      .sort((x, y) => (x.full_name || x.username).localeCompare(y.full_name || y.username, 'kk'));
  }
  const { data } = await admin
    .from('profiles')
    .select('id, username, full_name, is_active')
    .eq('role', 'student')
    .eq('current_grade', a.grade)
    .eq('is_active', true)
    .order('full_name');
  return (data ?? []) as { id: string; username: string; full_name: string; is_active: boolean }[];
}

export function fmtDue(iso: string | null) {
  if (!iso) return 'мерзімсіз';
  return new Date(iso).toLocaleString('kk-KZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' });
}

export const isLate = (sub: { submitted_at: string | null }, due: string | null) =>
  !!(due && sub.submitted_at && new Date(sub.submitted_at) > new Date(due));
