import 'server-only';
/**
 * ТЗ М4: сессиядан кейінгі кері байланыс — оқу мақсаттары бойынша, жоғалған балдар және себептері,
 * күшті жақтар, бұрынғы нәтижемен салыстыру, ұсыныстар. Нәтиже беті ашылғанда серверде есептеледі.
 */
import { createAdminClient } from './supabase/admin';
import { itemLoss, type ItemLoss } from './feedback-rules.ts';
import type { ResponseValue } from './grading.ts';
import type { AnswerKey, PublicBody, QuestionType, RubricLine } from './generator/types';

export interface ObjRow { id: string; code: string; text: string; earned: number; possible: number; pct: number; levels: number[]; items: number[] }
export interface SessionFeedback {
  byObjective: ObjRow[];
  losses: { seq: number; item_id: string; max: number; awarded: number | null; loss: ItemLoss; objectives: string[] }[];
  strengths: ObjRow[];
  weak: ObjRow[];
  prev: { percent: number; at: string } | null;
  mistakesAdded: number;
  pending: boolean;
  recommendation: 'objective' | 'review' | 'next';
  lostTotal: number;
}

interface ViewItem {
  id: string; sequence_no: number; question_type: QuestionType; body: PublicBody; max_marks: number;
  response: ResponseValue | null; awarded_marks: number | null; marking_state: string | null;
  key: { answer: AnswerKey; solution: { text: string }; rubric: RubricLine[] } | null;
}

export async function sessionFeedback(
  session: { id: string; owner_id: string; exam_type: string; grade: number; submitted_at: string | null; parameters_json?: Record<string, unknown> | null },
  items: ViewItem[],
  percent: number,
): Promise<SessionFeedback> {
  const admin = createAdminClient();
  const ids = items.map((i) => i.id);
  const [{ data: pi }, { data: resp }] = await Promise.all([
    admin.from('practice_items').select('id, question_id').in('id', ids),
    admin.from('responses').select('session_item_id, hints_used').in('session_item_id', ids),
  ]);
  const qOf = new Map(((pi ?? []) as { id: string; question_id: string | null }[]).map((r) => [r.id, r.question_id]));
  const hintsOf = new Map(((resp ?? []) as { session_item_id: string; hints_used: number }[]).map((r) => [r.session_item_id, Number(r.hints_used ?? 0)]));
  const qids = [...new Set([...qOf.values()].filter(Boolean))] as string[];
  const [{ data: qo }, { data: qd }] = await Promise.all([
    qids.length ? admin.from('question_objectives').select('question_id, objective_id, weight, learning_objectives(code, text, sort_order)').in('question_id', qids) : Promise.resolve({ data: [] }),
    qids.length ? admin.from('questions').select('id, difficulty').in('id', qids) : Promise.resolve({ data: [] }),
  ]);
  const diff = new Map(((qd ?? []) as { id: string; difficulty: number }[]).map((q) => [q.id, q.difficulty]));
  const objsOfQ = new Map<string, { id: string; code: string; text: string; sort: number; w: number }[]>();
  for (const r of (qo ?? []) as unknown as { question_id: string; objective_id: string; weight: number; learning_objectives: { code: string; text: string; sort_order: number } | null }[]) {
    if (!r.learning_objectives) continue;
    const l = objsOfQ.get(r.question_id) ?? [];
    l.push({ id: r.objective_id, code: r.learning_objectives.code, text: r.learning_objectives.text, sort: r.learning_objectives.sort_order, w: Number(r.weight) || 1 });
    objsOfQ.set(r.question_id, l);
  }

  const agg = new Map<string, ObjRow & { sort: number }>();
  const losses: SessionFeedback['losses'] = [];
  let pending = false, lostTotal = 0;
  for (const it of items) {
    const qid = qOf.get(it.id);
    const objs = qid ? objsOfQ.get(qid) ?? [] : [];
    const wsum = objs.reduce((s, o) => s + o.w, 0) || 1;
    const isPending = it.marking_state === 'pending';
    if (isPending) pending = true;
    for (const o of objs) {
      const a = agg.get(o.id) ?? { id: o.id, code: o.code, text: o.text, sort: o.sort, earned: 0, possible: 0, pct: 0, levels: [], items: [] };
      if (!isPending) {
        a.earned += (Number(it.awarded_marks ?? 0) * o.w) / wsum;
        a.possible += (it.max_marks * o.w) / wsum;
      }
      const d = qid ? diff.get(qid) : undefined;
      if (d && !a.levels.includes(d)) a.levels.push(d);
      a.items.push(it.sequence_no);
      agg.set(o.id, a);
    }
    const full = !isPending && it.awarded_marks != null && it.awarded_marks >= it.max_marks;
    if (!full && it.key) {
      const loss = itemLoss({
        type: it.question_type, body: it.body, key: it.key.answer, solutionText: it.key.solution?.text ?? '', rubric: it.key.rubric,
        max: it.max_marks, awarded: it.awarded_marks, response: it.response, hints: hintsOf.get(it.id) ?? 0, pending: isPending,
      });
      lostTotal += loss.lost;
      losses.push({ seq: it.sequence_no, item_id: it.id, max: it.max_marks, awarded: it.awarded_marks, loss, objectives: objs.map((o) => o.code) });
    }
  }
  const byObjective = [...agg.values()]
    .map((a) => ({ ...a, earned: Math.round(a.earned * 100) / 100, possible: Math.round(a.possible * 100) / 100, pct: a.possible > 0 ? Math.round((a.earned / a.possible) * 100) : 0, levels: a.levels.sort() }))
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  const scored = byObjective.filter((o) => o.possible > 0);
  const strengths = scored.filter((o) => o.pct >= 80);
  const weak = scored.filter((o) => o.pct < 50).sort((a, b) => a.pct - b.pct);

  // Бұрынғы сол түрдегі нәтиже (сол сынып, сол мақсаттағы сессия)
  const purpose = (session.parameters_json?.purpose as string | undefined) ?? null;
  const { data: prevRows } = await admin
    .from('results')
    .select('percent, created_at, practice_sessions!inner(owner_id, exam_type, grade, parameters_json)')
    .eq('practice_sessions.owner_id', session.owner_id)
    .eq('practice_sessions.exam_type', session.exam_type)
    .eq('practice_sessions.grade', session.grade)
    .neq('session_id', session.id)
    .lt('created_at', session.submitted_at ?? new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10);
  const prevRow = ((prevRows ?? []) as unknown as { percent: number; created_at: string; practice_sessions: { parameters_json: Record<string, unknown> | null } }[])
    .find((r) => ((r.practice_sessions.parameters_json?.purpose as string | undefined) ?? null) === purpose);
  const prev = prevRow ? { percent: Number(prevRow.percent), at: prevRow.created_at } : null;

  // Осы сессиядан «Қателермен жұмысқа» түскендер
  let mistakesAdded = 0;
  if (purpose !== 'review') {
    const lostQ = losses.map((l) => qOf.get(l.item_id)).filter(Boolean) as string[];
    if (lostQ.length) {
      const { count } = await admin.from('mistakes').select('id', { count: 'exact', head: true }).eq('student_id', session.owner_id).eq('status', 'active').in('source_question_id', lostQ);
      mistakesAdded = count ?? 0;
    }
  }

  const recommendation: SessionFeedback['recommendation'] = weak.length ? 'objective' : losses.length ? 'review' : 'next';
  void percent;
  return { byObjective, losses, strengths, weak, prev, mistakesAdded, pending, recommendation, lostTotal: Math.round(lostTotal * 100) / 100 };
}
