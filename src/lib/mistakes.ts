/**
 * Қателермен жұмыс (ТЗ М2): қате шыққан есеп түрлерін тіркеу, аралықпен қайталау, қайталау сессиясын құрастыру.
 * Түр (kind_key) = тақырып + оқу мақсаты + қиындық. Қайталауда сол есеп емес, сол түрдегі басқа нұсқа беріледі.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkLines } from './stepcheck.ts';

export const INTERVALS_DAYS = [1, 3, 7, 14];
export const MASTER_STREAK = 3;
export const REVIEW_LIMIT = 10;

export interface MistakeState { stage: number; correct_streak: number }

/** Қайталау нәтижесі бойынша келесі күй */
export function nextReview(m: MistakeState, ok: boolean, now = new Date()) {
  if (!ok) return { stage: 0, correct_streak: 0, status: 'active' as const, due_at: addDays(now, INTERVALS_DAYS[0]).toISOString() };
  const stage = Math.min(m.stage + 1, INTERVALS_DAYS.length - 1);
  const streak = m.correct_streak + 1;
  return { stage, correct_streak: streak, status: streak >= MASTER_STREAK ? ('mastered' as const) : ('active' as const), due_at: addDays(now, INTERVALS_DAYS[stage]).toISOString() };
}
function addDays(d: Date, n: number) { return new Date(d.getTime() + n * 86_400_000); }

export interface Outcome {
  question_id: string | null;
  awarded: number | null;
  max: number;
  hints: number;
  steps?: string[];
}

interface QMeta { id: string; grade: number; difficulty: number; question_topics: { topic_id: string }[]; question_objectives: { objective_id: string; weight: number }[] }

function kindOf(q: QMeta) {
  const topic = q.question_topics[0]?.topic_id ?? null;
  const obj = [...q.question_objectives].sort((a, b) => Number(b.weight) - Number(a.weight))[0]?.objective_id ?? null;
  return { key: `t:${topic ?? '-'}|o:${obj ?? '-'}|d:${q.difficulty}`, topic, obj };
}
function firstError(steps?: string[]) {
  if (!steps || steps.filter((s) => s.trim()).length < 2) return null;
  const c = checkLines(steps).find((x) => x.status === 'error');
  return c?.reason ?? null;
}

/** Сессия нәтижелерін «Қателермен жұмысқа» жазу. purpose='review' болса — қайталау кестесін жаңарту. */
export async function recordOutcomes(admin: SupabaseClient, studentId: string, params: Record<string, unknown> | null, outcomes: Outcome[]) {
  const ids = [...new Set(outcomes.map((o) => o.question_id).filter(Boolean))] as string[];
  if (!ids.length) return;
  const now = new Date();

  if (params?.purpose === 'review') {
    const map = new Map(((params.review ?? []) as { mistake_id: string; question_id: string }[]).map((r) => [r.question_id, r.mistake_id]));
    const mids = [...new Set(outcomes.map((o) => map.get(o.question_id ?? '')).filter(Boolean))] as string[];
    if (!mids.length) return;
    const { data: rows } = await admin.from('mistakes').select('id, stage, correct_streak, times_seen').in('id', mids).eq('student_id', studentId);
    const byId = new Map(((rows ?? []) as { id: string; stage: number; correct_streak: number; times_seen: number }[]).map((r) => [r.id, r]));
    for (const o of outcomes) {
      const mid = map.get(o.question_id ?? '');
      const m = mid ? byId.get(mid) : null;
      if (!m) continue;
      const ok = o.awarded !== null && o.awarded >= o.max - 1e-9 && o.hints === 0;
      const nx = nextReview({ stage: Number(m.stage), correct_streak: Number(m.correct_streak) }, ok, now);
      await admin.from('mistakes').update({ ...nx, times_seen: Number(m.times_seen) + 1, reason: ok ? null : firstError(o.steps), updated_at: now.toISOString() }).eq('id', mid);
    }
    return;
  }

  const wrong = outcomes.filter((o) => o.question_id && (o.awarded === null ? false : o.awarded < o.max - 1e-9));
  if (!wrong.length) return;
  const { data: qs } = await admin
    .from('questions')
    .select('id, grade, difficulty, question_topics(topic_id), question_objectives(objective_id, weight)')
    .in('id', [...new Set(wrong.map((o) => o.question_id!))]);
  const qmap = new Map(((qs ?? []) as unknown as QMeta[]).map((q) => [q.id, q]));
  const rows = new Map<string, Record<string, unknown>>();
  for (const o of wrong) {
    const q = qmap.get(o.question_id!);
    if (!q) continue;
    const k = kindOf(q);
    rows.set(k.key, { student_id: studentId, kind_key: k.key, grade: q.grade, topic_id: k.topic, objective_id: k.obj, difficulty: q.difficulty, source_question_id: q.id, reason: firstError(o.steps) });
  }
  if (!rows.size) return;
  const { data: existing } = await admin.from('mistakes').select('kind_key, times_seen').eq('student_id', studentId).in('kind_key', [...rows.keys()]);
  const seen = new Map(((existing ?? []) as { kind_key: string; times_seen: number }[]).map((e) => [e.kind_key, Number(e.times_seen)]));
  const due = addDays(now, INTERVALS_DAYS[0]).toISOString();
  const payload = [...rows.values()].map((r) => ({
    ...r, stage: 0, correct_streak: 0, status: 'active', due_at: due, updated_at: now.toISOString(),
    times_seen: Number(seen.get(r.kind_key as string) ?? 0) + 1,
  }));
  await admin.from('mistakes').upsert(payload, { onConflict: 'student_id,kind_key' });
}

/** Бүгінгі қайталау үшін есептерді таңдау: әр түрге сол тақырып/мақсат/қиындықтағы, оқушы көрмеген басқа нұсқа. */
export async function pickReviewQuestions(admin: SupabaseClient, studentId: string) {
  const { data: due } = await admin
    .from('mistakes')
    .select('id, grade, topic_id, objective_id, difficulty, source_question_id')
    .eq('student_id', studentId).eq('status', 'active').lte('due_at', new Date().toISOString())
    .order('due_at').limit(REVIEW_LIMIT);
  if (!due?.length) return { picks: [] as { mistake_id: string; question_id: string }[], grade: null as number | null };

  const { data: sess } = await admin.from('practice_sessions').select('id').eq('owner_id', studentId).order('created_at', { ascending: false }).limit(300);
  const seen = new Set<string>();
  if (sess?.length) {
    const { data: its } = await admin.from('practice_items').select('question_id').in('session_id', sess.map((s) => s.id));
    for (const i of its ?? []) if (i.question_id) seen.add(i.question_id as string);
  }

  const picks: { mistake_id: string; question_id: string }[] = [];
  const used = new Set<string>();
  for (const m of due) {
    let q = admin.from('questions').select('id, question_topics!inner(topic_id), question_objectives(objective_id)')
      .eq('status', 'published').eq('difficulty', m.difficulty).is('component', null).limit(200);
    if (m.grade) q = q.eq('grade', m.grade);
    if (m.topic_id) q = q.eq('question_topics.topic_id', m.topic_id);
    const { data: cands } = await q;
    let pool = ((cands ?? []) as unknown as { id: string; question_objectives: { objective_id: string }[] }[])
      .filter((c) => c.id !== m.source_question_id && !used.has(c.id));
    if (m.objective_id) {
      const byObj = pool.filter((c) => c.question_objectives.some((o) => o.objective_id === m.objective_id));
      if (byObj.length) pool = byObj;
    }
    if (!pool.length) continue;
    const fresh = pool.filter((c) => !seen.has(c.id));
    const from = fresh.length ? fresh : pool;
    const pick = from[Math.floor(Math.random() * from.length)];
    used.add(pick.id);
    picks.push({ mistake_id: m.id as string, question_id: pick.id });
  }
  return { picks, grade: (due[0].grade as number) ?? null };
}
