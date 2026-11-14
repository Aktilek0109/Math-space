import 'server-only';
import { createClient } from './supabase/server';

export const GRADES = [7, 8, 9, 10, 11, 12] as const;
/** МЭСК тек осы сыныптарға арналған */
export const MESK_GRADES = [10, 12] as const;
export const isMeskGrade = (g: number | null | undefined) => g === 10 || g === 12;

export const MATERIAL_TYPES: Record<string, string> = {
  presentation: 'Презентация',
  worksheet: 'Жұмыс парағы',
  theory: 'Теория',
  solution: 'Шешім',
  extra_problems: 'Қосымша есептер',
  link: 'Сілтеме',
  lesson_plan: 'ҚМЖ',
  other: 'Басқа',
};

/** ҚМЖ — тек мұғалім/әкімшіге (RLS оқушыдан жасырады) */
export const STAFF_ONLY_TYPES = ['lesson_plan'];

export interface UnitWithTopics {
  id: string;
  grade: number;
  term: number | null;
  title: string;
  topics: { id: string; title: string; sort_order: number }[];
}

export async function getUnits(grade?: number): Promise<UnitWithTopics[]> {
  const supabase = await createClient();
  let q = supabase.from('units').select('id, grade, term, title, sort_order, topics(id, title, sort_order)').order('grade').order('term').order('sort_order');
  if (grade) q = q.eq('grade', grade);
  const { data } = await q;
  return ((data ?? []) as unknown as UnitWithTopics[]).map((u) => ({
    ...u,
    topics: [...(u.topics ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export const EXAM_LABEL: Record<string, string> = { BZhB: 'БЖБ', TZhB: 'ТЖБ', MESK: 'МЭСК' };
