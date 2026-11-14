import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aggregate, adviceFor, type Advice, type Evidence, type Objective, type Stat } from './objectives';

export interface TopicView { id: string; title: string; stat: Stat; objectiveIds: string[] }
export interface UnitView {
  id: string; title: string; term: number | null; stat: Stat;
  objectives: (Objective & { stat: Stat | null })[];
  checked: number; topics: TopicView[]; advice: Advice;
}
export interface TermView { term: number; stat: Stat; units: UnitView[]; uncovered: string[] }

/**
 * ТЗ 15. Деректі RLS-пен (пайдаланушы клиенті) алады: оқушы — өзін, мұғалім — өз сыныбын.
 * Әр деңгейдегі көрсеткіш — сол деңгейге кіретін бағаланған тапсырмалар ұпайларының қосындысы.
 */
export async function loadProgress(db: SupabaseClient, studentId: string, grade: number) {
  const [{ data: ev, error }, { data: units }, { data: objs }, { data: tobj }] = await Promise.all([
    db.rpc('objective_evidence', { p_student: studentId }),
    db.from('units').select('id, title, term, sort_order, topics(id, title, sort_order)').eq('grade', grade).order('term').order('sort_order'),
    db.from('learning_objectives').select('id, code, text, unit_id, sort_order').eq('grade', grade).order('sort_order'),
    db.from('topic_objectives').select('topic_id, objective_id'),
  ]);
  if (error) throw error;
  const evidence = ((ev ?? []) as Evidence[]).map((e) => ({ ...e, earned: Number(e.earned), possible: Number(e.possible) }));
  const objectives = (objs ?? []) as Objective[];

  const byObjective = new Map<string, Stat>();
  for (const o of objectives) {
    const list = evidence.filter((e) => e.objective_id === o.id);
    if (list.length) byObjective.set(o.id, aggregate(list));
  }

  const unitViews: UnitView[] = ((units ?? []) as { id: string; title: string; term: number | null; topics: { id: string; title: string; sort_order: number }[] }[])
    .map((u) => {
      const uObjs = objectives.filter((o) => o.unit_id === u.id);
      const uEv = evidence.filter((e) => e.unit_id === u.id);
      const topics = [...(u.topics ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((t) => ({
        id: t.id,
        title: t.title,
        stat: aggregate(evidence.filter((e) => e.topic_id === t.id)),
        objectiveIds: (tobj ?? []).filter((x) => x.topic_id === t.id).map((x) => x.objective_id as string),
      }));
      return {
        id: u.id, title: u.title, term: u.term,
        stat: aggregate(uEv),
        objectives: uObjs.map((o) => ({ ...o, stat: byObjective.get(o.id) ?? null })),
        checked: uObjs.filter((o) => byObjective.has(o.id)).length,
        topics,
        advice: adviceFor(uObjs, byObjective),
      };
    })
    .filter((u) => u.objectives.length > 0 || u.stat.items > 0);

  const terms: TermView[] = [...new Set(unitViews.map((u) => u.term ?? 0))].sort().map((term) => {
    const list = unitViews.filter((u) => (u.term ?? 0) === term);
    return {
      term,
      units: list,
      stat: aggregate(evidence.filter((e) => list.some((u) => u.id === e.unit_id))),
      uncovered: list.filter((u) => u.stat.items === 0).map((u) => u.title),
    };
  });
  return { terms, evidenceCount: evidence.length, byObjective };
}

export function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('kk-KZ', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Almaty' });
}
