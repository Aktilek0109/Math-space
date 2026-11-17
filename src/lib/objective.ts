import 'server-only';
/**
 * Оқу мақсаты бойынша дайындық (ТЗ М3): бейімделетін тізбек, меңгеру шегі, меңгеру есебі.
 * Ереже: қатарынан 2 дұрыс → деңгей жоғары; қатарынан 2 қате → төмен. Меңгерілді: ≥6 есеп,
 * соңғы 5-тің орташасы ≥80% және (жоғары деңгей бар болса) олардың ішінде жоғары деңгей дұрыс шыққан. Ең көбі 15 есеп.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import { ApiError } from './api';
import type { Profile } from './auth';
import { newSeed } from './generator';
import { persistSession, questionDrafts, getVisibleSession, type QuestionRow } from './sessions';
import { checkLines } from './stepcheck.ts';
import { OBJ_HINT } from './hints';

import { decide, MASTERY, type Outcome } from './objective-rules.ts';
export { MASTERY, MIN_ITEMS, MAX_ITEMS } from './objective-rules.ts';

export interface Mastery { pct: number; n: number }

/** Оқушының оқу мақсаттары бойынша меңгеруі — ортақ SQL формуласы (М5.3, `objective_mastery`). */
export async function objectiveMastery(admin: SupabaseClient, studentId: string): Promise<Map<string, Mastery>> {
  const { data, error } = await admin.rpc('objective_mastery', { p_students: [studentId], p_source: 'all', p_since: null });
  if (error) throw error;
  return new Map(((data ?? []) as { objective_id: string; pct: number; n: number }[]).map((r) => [r.objective_id, { pct: r.pct, n: r.n }]));
}

async function poolFor(admin: SupabaseClient, objectiveId: string, grade: number) {
  const { data } = await admin
    .from('questions')
    .select('id, unit_id, body_json, question_type, marks, difficulty, question_topics(topic_id), question_objectives!inner(objective_id)')
    .eq('status', 'published').eq('grade', grade).is('component', null)
    .eq('question_objectives.objective_id', objectiveId).limit(1000);
  return (data ?? []) as unknown as QuestionRow[];
}
async function seenIds(admin: SupabaseClient, studentId: string) {
  const { data: sess } = await admin.from('practice_sessions').select('id').eq('owner_id', studentId).order('created_at', { ascending: false }).limit(300);
  const seen = new Set<string>();
  if (sess?.length) {
    const { data: its } = await admin.from('practice_items').select('question_id').in('session_id', sess.map((s) => s.id));
    for (const i of its ?? []) if (i.question_id) seen.add(i.question_id as string);
  }
  return seen;
}
function choose(pool: QuestionRow[], level: number, used: Set<string>, seen: Set<string>) {
  const at = pool.filter((q) => q.difficulty === level && !used.has(q.id));
  if (!at.length) return null;
  const fresh = at.filter((q) => !seen.has(q.id));
  const from = fresh.length ? fresh : at;
  return from[Math.floor(Math.random() * from.length)];
}

export async function startObjectiveSession(profile: Profile, objectiveId: string) {
  const admin = createAdminClient();
  const { data: obj } = await admin.from('learning_objectives').select('id, code, text, grade').eq('id', objectiveId).maybeSingle();
  if (!obj) throw new ApiError(404, 'Оқу мақсаты табылмады');
  const pool = await poolFor(admin, objectiveId, obj.grade as number);
  const levels = [...new Set(pool.map((q) => q.difficulty))].sort();
  if (!levels.length) throw new ApiError(409, 'Бұл мақсат бойынша банкте есеп әлі жоқ');
  const seen = await seenIds(admin, profile.id);
  const first = choose(pool, levels[0], new Set(), seen)!;
  const mastery = (await objectiveMastery(admin, profile.id)).get(objectiveId);
  const drafts = await questionDrafts(admin, [first.id], new Map([[first.id, first]]));
  const sessionId = await persistSession(admin, {
    owner_id: profile.id, exam_type: 'BZhB', mode: 'practice', grade: obj.grade as number, seed: newSeed(),
    parameters_json: { purpose: 'objective', objective_id: obj.id, code: obj.code, text: obj.text, levels, start_pct: mastery?.pct ?? null, start_n: mastery?.n ?? 0 },
  }, drafts);
  return { sessionId };
}

export async function nextObjectiveItem(profile: Profile, sessionId: string) {
  const session = await getVisibleSession(sessionId);
  if (session.owner_id !== profile.id) throw new ApiError(403, 'Бұл сынақ сіздікі емес');
  if (session.status !== 'in_progress') throw new ApiError(409, 'Сынақ аяқталған');
  const params = (session.parameters_json ?? {}) as { purpose?: string; objective_id: string; levels: number[] };
  if (params.purpose !== 'objective') throw new ApiError(400, 'Бұл — мақсат бойынша дайындық емес');
  const admin = createAdminClient();
  const { data: items } = await admin.from('practice_items').select('id, question_id, max_marks, sequence_no').eq('session_id', sessionId).order('sequence_no');
  const list = (items ?? []) as { id: string; question_id: string; max_marks: number; sequence_no: number }[];
  const { data: resp } = await admin.from('responses').select('session_item_id, awarded_marks, revealed, hints_used').in('session_item_id', list.map((i) => i.id));
  const rmap = new Map(((resp ?? []) as { session_item_id: string; awarded_marks: number | null; revealed: boolean; hints_used: number }[]).map((r) => [r.session_item_id, r]));
  if (list.some((i) => !rmap.get(i.id)?.revealed)) throw new ApiError(400, 'Алдымен ағымдағы есепті «Тексеру» батырмасымен тексеріңіз');
  const { data: qd } = await admin.from('questions').select('id, difficulty').in('id', list.map((i) => i.question_id));
  const diff = new Map(((qd ?? []) as { id: string; difficulty: number }[]).map((q) => [q.id, q.difficulty]));
  const outs: Outcome[] = list.map((i) => {
    const r = rmap.get(i.id)!;
    return { level: diff.get(i.question_id) ?? 2, ratio: r.awarded_marks == null ? 0 : Number(r.awarded_marks) / Number(i.max_marks), hints: Number(r.hints_used ?? 0), revealed: r.revealed };
  });
  const d = decide(outs, params.levels);
  if (d.done) return { done: true, reason: d.reason };

  const pool = await poolFor(admin, params.objective_id, session.grade);
  const used = new Set(list.map((i) => i.question_id));
  const seen = await seenIds(admin, profile.id);
  const order = [d.level, ...params.levels.filter((l) => l !== d.level).sort((a, b) => Math.abs(a - d.level) - Math.abs(b - d.level))];
  let q: QuestionRow | null = null;
  for (const l of order) { q = choose(pool, l, used, seen); if (q) break; }
  if (!q) return { done: true, reason: 'exhausted' as const };

  const [draft] = await questionDrafts(admin, [q.id], new Map([[q.id, q]]));
  const seq = (list[list.length - 1]?.sequence_no ?? 0) + 1;
  const { data: it, error } = await admin.from('practice_items').insert({
    session_id: sessionId, question_id: draft.question_id, sequence_no: seq, question_type: draft.question_type,
    public_snapshot_json: draft.public_snapshot_json, max_marks: draft.max_marks, unit_id: draft.unit_id, topic_id: draft.topic_id,
  }).select('id').single();
  if (error) throw error;
  await admin.from('practice_item_keys').insert({ practice_item_id: it.id, private_answer_json: draft.key.answer, private_solution_json: draft.key.solution, private_rubric_json: draft.key.rubric });
  await admin.from('practice_sessions').update({ total_marks: list.reduce((s, i) => s + Number(i.max_marks), 0) + draft.max_marks }).eq('id', sessionId);
  return {
    done: false,
    level: d.level,
    item: { id: it.id as string, sequence_no: seq, question_type: draft.question_type, body: draft.public_snapshot_json, max_marks: draft.max_marks, response: null, revealed: false, awarded_marks: null, key: null },
  };
}


// ---------------------------------------------------------------------------
// Соңғы кері байланыс (нәтиже бетінде)
// ---------------------------------------------------------------------------
export interface ObjectiveFeedback {
  code: string; text: string;
  startPct: number | null; endPct: number | null;
  levels: { level: number; n: number; ok: number }[];
  hintsUsed: number; revealedNoAnswer: number;
  stepErrors: { reason: string; n: number }[];
  mastered: boolean; topLevelReached: number;
  advice: string[];
  next: { id: string; code: string; text: string; pct: number | null } | null;
  objectiveId: string;
}

export async function objectiveFeedback(sessionId: string, studentId: string, params: Record<string, unknown>): Promise<ObjectiveFeedback> {
  const admin = createAdminClient();
  const objectiveId = String(params.objective_id);
  const levelsAvail = (params.levels as number[]) ?? [1, 2, 3];
  const { data: items } = await admin.from('practice_items').select('id, question_id, max_marks, sequence_no').eq('session_id', sessionId).order('sequence_no');
  const list = (items ?? []) as { id: string; question_id: string; max_marks: number }[];
  const [{ data: resp }, { data: qd }] = await Promise.all([
    admin.from('responses').select('session_item_id, awarded_marks, hints_used, response_json').in('session_item_id', list.map((i) => i.id)),
    admin.from('questions').select('id, difficulty').in('id', list.map((i) => i.question_id)),
  ]);
  const rmap = new Map(((resp ?? []) as { session_item_id: string; awarded_marks: number | null; hints_used: number; response_json: { steps?: string[]; partSteps?: Record<string, string[]>; value?: string; choice?: string; parts?: Record<string, string> } | null }[]).map((r) => [r.session_item_id, r]));
  const diff = new Map(((qd ?? []) as { id: string; difficulty: number }[]).map((q) => [q.id, q.difficulty]));

  const lv = new Map<number, { n: number; ok: number }>();
  const errs = new Map<string, number>();
  let hintsUsed = 0, revealedNoAnswer = 0, top = 0;
  const outs: Outcome[] = [];
  for (const it of list) {
    const r = rmap.get(it.id);
    const l = diff.get(it.question_id) ?? 2;
    const ratio = r?.awarded_marks == null ? 0 : Number(r.awarded_marks) / Number(it.max_marks);
    const e = lv.get(l) ?? { n: 0, ok: 0 }; e.n++; if (ratio >= MASTERY) { e.ok++; top = Math.max(top, l); } lv.set(l, e);
    hintsUsed += Number(r?.hints_used ?? 0);
    const rj = r?.response_json;
    if (!rj || !(rj.value?.trim() || rj.choice || rj.steps?.length || Object.values(rj.parts ?? {}).some((v) => String(v).trim()))) revealedNoAnswer++;
    const stepSets = [rj?.steps, ...Object.values(rj?.partSteps ?? {})].filter((x): x is string[] => Array.isArray(x) && x.length > 0);
    for (const st of stepSets) {
      for (const c of checkLines(st)) if (c.status === 'error' && c.reason) errs.set(c.reason, (errs.get(c.reason) ?? 0) + 1);
    }
    outs.push({ level: l, ratio, hints: Number(r?.hints_used ?? 0), revealed: true });
  }
  const mastered = outs.length > 0 && decide(outs, levelsAvail).reason === 'mastered';
  const mastery = await objectiveMastery(admin, studentId);
  const endPct = mastery.get(objectiveId)?.pct ?? null;

  const { data: obj } = await admin.from('learning_objectives').select('grade, sort_order').eq('id', objectiveId).maybeSingle();
  let next: ObjectiveFeedback['next'] = null;
  if (obj) {
    const { data: rest } = await admin.from('learning_objectives').select('id, code, text, sort_order').eq('grade', obj.grade).order('sort_order');
    const { data: counts } = await admin.rpc('objective_bank_counts', { p_grade: obj.grade });
    const has = new Set(((counts ?? []) as { objective_id: string }[]).map((c) => c.objective_id));
    const cand = ((rest ?? []) as { id: string; code: string; text: string; sort_order: number }[]).filter((o) => o.id !== objectiveId && has.has(o.id));
    const weak = cand.filter((o) => (mastery.get(o.id)?.pct ?? -1) < 80);
    const after = weak.filter((o) => o.sort_order > (obj.sort_order as number));
    const pick = after[0] ?? weak[0] ?? null;
    if (pick) next = { id: pick.id, code: pick.code, text: pick.text, pct: mastery.get(pick.id)?.pct ?? null };
  }

  const levels = levelsAvail.map((l) => ({ level: l, ...(lv.get(l) ?? { n: 0, ok: 0 }) }));
  const stepErrors = [...errs].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([reason, n]) => ({ reason, n }));
  const advice: string[] = [];
  const L = (l: number) => (l === 1 ? 'жеңіл' : l === 2 ? 'орта' : 'күрделі');
  if (mastered) advice.push('Мақсат меңгерілді. 3–7 күннен кейін «Бекіту» арқылы қысқа қайталау жасаңыз — білім тұрақтанады.');
  else {
    const weakLv = levels.find((x) => x.n > 0 && x.ok / x.n < 0.6);
    if (weakLv) advice.push(`${L(weakLv.level)} деңгейдегі есептер әлі тұрақсыз (${weakLv.ok}/${weakLv.n}). Шешімдегі дескрипторларды қайта қарап, дайындықты қайта бастаңыз.`);
    if (!levels.some((x) => x.level === 3 && x.ok > 0) && levelsAvail.includes(3)) advice.push('Күрделі деңгейге әлі жетпедіңіз: алдымен орта деңгейді қатарынан 2 рет көмексіз шығарып көріңіз.');
  }
  if (hintsUsed >= Math.max(2, Math.ceil(outs.length / 2))) advice.push(`Көмек жиі қолданылды (${hintsUsed} рет). Келесіде алдымен 2–3 минут өзіңіз ойланыңыз, сосын ғана 💡 басыңыз.`);
  if (revealedNoAnswer > 0) advice.push(`${revealedNoAnswer} есепте жауап жазылмай тексерілді — шешімді көру пайдалы, бірақ меңгеруді бағалау үшін өз жауабыңызды жазыңыз.`);
  if (stepErrors.length) advice.push('Шешім жолындағы жиі қателер төменде көрсетілген — жолдарды тексеріп, әр түрлендіруден кейін нәтижені орнына қойып тексеру әдетін қалыптастырыңыз.');
  const g = OBJ_HINT[String(params.code)];
  if (g && !mastered) advice.push(`Еске сақтаңыз: ${g}`);
  if (outs.some((o) => o.ratio < 1)) advice.push('Толық балл алынбаған есептердің түрлері «Қателермен жұмыс» бөліміне қосылды.');

  return {
    code: String(params.code ?? ''), text: String(params.text ?? ''), objectiveId,
    startPct: (params.start_pct as number | null) ?? null, endPct,
    levels, hintsUsed, revealedNoAnswer, stepErrors, mastered, topLevelReached: top, advice, next,
  };
}
