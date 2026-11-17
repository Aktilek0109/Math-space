import 'server-only';
/** М5: мұғалімге сыныптың жылу картасы (оқушылар × оқу мақсаттары). */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';

export type Source = 'all' | 'exam' | 'homework' | 'practice';
export const SOURCE_LABEL: Record<Source, string> = { all: 'Барлығы', exam: 'БЖБ/ТЖБ', homework: 'Үй жұмысы', practice: 'Жаттығу' };
export const PERIODS: Record<string, { label: string; days: number | null }> = {
  all: { label: 'Барлық уақыт', days: null }, '30': { label: 'Соңғы 30 күн', days: 30 }, '90': { label: 'Соңғы 90 күн', days: 90 },
};

export interface Cell { pct: number; n: number; prev: number | null; last: string | null }
export interface HeatStudent { id: string; name: string; username: string }
export interface HeatObjective { id: string; code: string; text: string; term: number | null; unit: string }

export async function loadHeatmap(db: SupabaseClient, opts: { classId?: string; term?: number; source: Source; period: string }) {
  const { data: classes } = await db.from('classes').select('id, name, grade').order('grade').order('name');
  const list = (classes ?? []) as { id: string; name: string; grade: number }[];
  const cls = list.find((c) => c.id === opts.classId) ?? list[0];
  if (!cls) return { classes: list, cls: null };

  const [{ data: members }, { data: objs }, { data: units }] = await Promise.all([
    db.from('class_members').select('profiles(id, full_name, username, is_active)').eq('class_id', cls.id),
    db.from('learning_objectives').select('id, code, text, unit_id, sort_order').eq('grade', cls.grade).order('sort_order'),
    db.from('units').select('id, title, term').eq('grade', cls.grade),
  ]);
  type P = { id: string; full_name: string; username: string; is_active: boolean };
  const students: HeatStudent[] = ((members ?? []) as unknown as { profiles: P | null }[])
    .map((m) => m.profiles).filter((p): p is P => !!p && p.is_active)
    .map((p) => ({ id: p.id, name: p.full_name || p.username, username: p.username }))
    .sort((a, b) => a.name.localeCompare(b.name, 'kk'));
  const unitMap = new Map(((units ?? []) as { id: string; title: string; term: number | null }[]).map((u) => [u.id, u]));
  const terms = [...new Set([...unitMap.values()].map((u) => u.term).filter((t): t is number => t != null))].sort();

  const days = PERIODS[opts.period]?.days ?? null;
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const { data: m, error } = await db.rpc('objective_mastery', { p_students: students.map((s) => s.id), p_source: opts.source, p_since: since });
  if (error) throw error;
  const cells = new Map<string, Cell>();
  for (const r of (m ?? []) as { student_id: string; objective_id: string; pct: number; n: number; prev_pct: number | null; last_at: string | null }[])
    cells.set(`${r.student_id}|${r.objective_id}`, { pct: r.pct, n: r.n, prev: r.prev_pct, last: r.last_at });

  // Мақсаттар: таңдалған тоқсан; дерегі бар немесе банкте есебі бар мақсаттар
  const withData = new Set([...cells.keys()].map((k) => k.split('|')[1]));
  const { data: counts } = await db.rpc('objective_bank_counts', { p_grade: cls.grade });
  const inBank = new Set(((counts ?? []) as { objective_id: string }[]).map((c) => c.objective_id));
  const objectives: HeatObjective[] = ((objs ?? []) as { id: string; code: string; text: string; unit_id: string | null }[])
    .map((o) => { const u = o.unit_id ? unitMap.get(o.unit_id) : undefined; return { id: o.id, code: o.code, text: o.text, term: u?.term ?? null, unit: u?.title ?? '' }; })
    .filter((o) => (withData.has(o.id) || inBank.has(o.id)) && (!opts.term || o.term === opts.term));

  // Сынып бойынша жиі қателер (М2 қателер кестесінен, себебі бар белсенді түрлер)
  const errors = new Map<string, { reason: string; students: number }[]>();
  if (students.length) {
    const { data: mk } = await createAdminClient()
      .from('mistakes').select('student_id, objective_id, reason')
      .in('student_id', students.map((s) => s.id)).not('reason', 'is', null).not('objective_id', 'is', null);
    const tmp = new Map<string, Map<string, Set<string>>>();
    for (const r of (mk ?? []) as { student_id: string; objective_id: string; reason: string }[]) {
      const byR = tmp.get(r.objective_id) ?? new Map<string, Set<string>>();
      const set = byR.get(r.reason) ?? new Set<string>(); set.add(r.student_id); byR.set(r.reason, set); tmp.set(r.objective_id, byR);
    }
    for (const [o, byR] of tmp) errors.set(o, [...byR].map(([reason, s]) => ({ reason, students: s.size })).sort((a, b) => b.students - a.students).slice(0, 3));
  }

  const avg = (vals: number[]) => (vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null);
  const rowAvg = new Map(students.map((s) => [s.id, avg(objectives.map((o) => cells.get(`${s.id}|${o.id}`)?.pct).filter((v): v is number => v != null))]));
  const colAvg = new Map(objectives.map((o) => [o.id, avg(students.map((s) => cells.get(`${s.id}|${o.id}`)?.pct).filter((v): v is number => v != null))]));
  return { classes: list, cls, students, objectives, cells, rowAvg, colAvg, errors, terms };
}
