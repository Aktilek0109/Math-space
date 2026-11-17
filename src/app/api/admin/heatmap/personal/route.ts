import { z } from 'zod';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { defaultCriteria, objectiveQuestions, seenQuestionIds, type BankQuestion } from '@/lib/objectives';
import { personalEligible, personalLevels } from '@/lib/heatmap-rules';
import type { RubricLine } from '@/lib/generator/types';

const body = z.object({
  class_id: z.string().uuid(),
  cells: z.array(z.object({ student_id: z.string().uuid(), objective_id: z.string().uuid() })).min(1).max(400),
  per_objective: z.number().int().min(1).max(3).default(2),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
});

/** М5.2: жылу картасынан жеке үй жұмысы — әр оқушыға өзі қиналған (қызыл/қызғылт сары) мақсаттар бойынша. */
export const POST = handler(async (req: Request) => {
  const actor = await apiUser(['teacher', 'admin']);
  const input = await parseBody(req, body);
  const db = await createClient();
  const { data: cls } = await db.from('classes').select('id, name, grade').eq('id', input.class_id).maybeSingle();
  if (!cls) throw new ApiError(404, 'Сынып табылмады');
  const { data: mem } = await db.from('class_members').select('student_id').eq('class_id', cls.id);
  const members = new Set((mem ?? []).map((m) => m.student_id as string));
  const studentIds = [...new Set(input.cells.map((c) => c.student_id))].filter((s) => members.has(s));
  if (!studentIds.length) throw new ApiError(400, 'Таңдалған оқушылар бұл сыныпта жоқ');

  // Меңгеруді серверде қайта есептеп, тек қызыл/қызғылт сары ұяшықтарды қалдырамыз
  const { data: m, error } = await db.rpc('objective_mastery', { p_students: studentIds, p_source: 'all', p_since: null });
  if (error) throw error;
  const pctOf = new Map(((m ?? []) as { student_id: string; objective_id: string; pct: number }[]).map((r) => [`${r.student_id}|${r.objective_id}`, r.pct]));
  const admin = createAdminClient();
  const { data: objs } = await admin.from('learning_objectives').select('id, code, grade').in('id', [...new Set(input.cells.map((c) => c.objective_id))]);
  const objMap = new Map(((objs ?? []) as { id: string; code: string; grade: number }[]).map((o) => [o.id, o]));

  const byStudent = new Map<string, { objective_id: string; pct: number }[]>();
  const skipped: string[] = [];
  for (const c of input.cells) {
    const pct = pctOf.get(`${c.student_id}|${c.objective_id}`);
    const o = objMap.get(c.objective_id);
    if (!members.has(c.student_id) || !o || o.grade !== cls.grade || !personalEligible(pct)) { skipped.push(`${c.student_id}|${c.objective_id}`); continue; }
    const l = byStudent.get(c.student_id) ?? [];
    if (!l.some((x) => x.objective_id === c.objective_id)) l.push({ objective_id: c.objective_id, pct: pct! });
    byStudent.set(c.student_id, l);
  }
  if (!byStudent.size) throw new ApiError(400, 'Жеке үй жұмысы тек қызыл және қызғылт сары (< 65%) ұяшықтар бойынша құрастырылады');

  const pools = new Map<string, BankQuestion[]>();
  const pool = async (oid: string) => { if (!pools.has(oid)) pools.set(oid, await objectiveQuestions(admin, oid)); return pools.get(oid)!; };
  let created = 0;
  const ids: string[] = [];
  for (const [sid, list] of byStudent) {
    list.sort((a, b) => a.pct - b.pct);
    const seen = await seenQuestionIds(admin, [sid]);
    const used = new Set<string>();
    const picked: { q: BankQuestion; objective_id: string }[] = [];
    for (const { objective_id, pct } of list.slice(0, 5)) {
      const p = await pool(objective_id);
      const levels = personalLevels(pct).slice(0, input.per_objective);
      while (levels.length < input.per_objective) levels.push(levels[levels.length - 1] ?? 2);
      for (const lv of levels) {
        const cands = p.filter((q) => !used.has(q.id)).sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)) || Math.abs(a.difficulty - lv) - Math.abs(b.difficulty - lv) || Math.random() - 0.5);
        const q = cands[0];
        if (q) { used.add(q.id); picked.push({ q, objective_id }); }
      }
    }
    if (!picked.length) { skipped.push(sid); continue; }
    const qids = picked.map((x) => x.q.id);
    const { data: keys } = await admin.from('question_keys').select('question_id, answer_json, solution_json, rubric_json').in('question_id', qids);
    const kMap = new Map(((keys ?? []) as { question_id: string; answer_json: object; solution_json: object; rubric_json: RubricLine[] | null }[]).map((k) => [k.question_id, k]));
    const codes = [...new Set(picked.map((x) => objMap.get(x.objective_id)!.code))];
    const total = picked.reduce((s, x) => s + Number(x.q.marks), 0);
    const { data: a, error: aErr } = await admin.from('assignments').insert({
      title: `Жеке тапсырма: ${codes.join(', ')}`,
      description: 'Жылу картасы бойынша: сен қиналған оқу мақсаттарына арналған есептер. Шешімді жол-жолымен жаз.',
      grade: cls.grade, class_id: cls.id, student_id: sid, due_at: input.due_at ?? null, max_score: total,
      status: 'published', created_by: actor.id, mode: 'tasks', topic_id: picked[0].q.topic_id,
    }).select('id').single();
    if (aErr) throw new ApiError(500, 'Тапсырманы сақтау қатесі: ' + aErr.message);
    try {
      const { data: items, error: iErr } = await admin.from('homework_items').insert(picked.map((x, i) => ({
        assignment_id: a.id, position: i + 1, question_id: x.q.id, objective_id: x.objective_id, topic_id: x.q.topic_id,
        question_type: x.q.question_type, body_json: x.q.body_json, max_marks: x.q.marks, difficulty: x.q.difficulty,
        criteria_json: defaultCriteria(x.q.question_type, x.q.marks, kMap.get(x.q.id)?.rubric_json ?? []),
      }))).select('id, question_id');
      if (iErr) throw iErr;
      const { error: kErr } = await admin.from('homework_item_keys').insert((items ?? []).map((r) => ({ item_id: r.id, answer_json: kMap.get(r.question_id as string)?.answer_json ?? {}, solution_json: kMap.get(r.question_id as string)?.solution_json ?? {} })));
      if (kErr) throw kErr;
    } catch (e) {
      await admin.from('assignments').delete().eq('id', a.id);
      throw new ApiError(500, 'Есептерді сақтау қатесі: ' + (e instanceof Error ? e.message : String(e)));
    }
    created++; ids.push(a.id as string);
  }
  await audit(actor.id, 'homework.personal', 'class', cls.id, { created, skipped: skipped.length, assignments: ids });
  return json({ created, skipped, assignments: ids }, 201);
});
