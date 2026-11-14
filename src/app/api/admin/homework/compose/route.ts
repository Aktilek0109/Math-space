import { z } from 'zod';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { assignmentStudents } from '@/lib/homework';
import { defaultCriteria, objectiveQuestions, pickVaried, seenQuestionIds, topicObjectives, type BankQuestion, type Objective } from '@/lib/objectives';
import type { RubricLine } from '@/lib/generator/types';

/**
 * ТЗ 14.1 — «Үй жұмысын құрастыру».
 *  suggest: { topic_id, class_id?, per_objective? } → мақсаттар және әрқайсысына ұсынылған есептер
 *  swap:    { objective_id, exclude[], difficulty? } → бір балама есеп
 *  publish: { title, description?, topic_id, class_id?, grade, due_at?, lesson_id?, items:[{question_id, objective_id, criteria[]}] }
 */
const criterion = z.object({ descriptor: z.string().trim().min(2).max(300), marks: z.number().positive().max(10) });
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suggest'), topic_id: z.string().uuid(), class_id: z.string().uuid().nullable().optional(), per_objective: z.number().int().min(1).max(4).default(3) }),
  z.object({ action: z.literal('swap'), objective_id: z.string().uuid(), class_id: z.string().uuid().nullable().optional(), exclude: z.array(z.string().uuid()).max(100), difficulty: z.number().int().min(1).max(3).optional() }),
  z.object({
    action: z.literal('publish'),
    title: z.string().trim().min(2).max(200),
    description: z.string().max(2000).default(''),
    topic_id: z.string().uuid(),
    class_id: z.string().uuid().nullable().optional(),
    grade: z.number().int().min(7).max(12),
    due_at: z.string().datetime({ offset: true }).nullable().optional(),
    lesson_id: z.string().uuid().nullable().optional(),
    items: z.array(z.object({ question_id: z.string().uuid(), objective_id: z.string().uuid(), criteria: z.array(criterion).min(1).max(6) })).min(1).max(15),
  }),
]);

const publicQ = (q: BankQuestion, criteria: { descriptor: string; marks: number }[]) => ({
  id: q.id, question_type: q.question_type, body: q.body_json, marks: q.marks, difficulty: q.difficulty, criteria,
});

async function rubricMap(admin: ReturnType<typeof createAdminClient>, ids: string[]) {
  if (!ids.length) return new Map<string, RubricLine[]>();
  const { data } = await admin.from('question_keys').select('question_id, rubric_json').in('question_id', ids);
  return new Map<string, RubricLine[]>((data ?? []).map((k: { question_id: string; rubric_json: RubricLine[] | null }) => [k.question_id, k.rubric_json ?? []]));
}

async function classStudentIds(admin: ReturnType<typeof createAdminClient>, classId?: string | null) {
  if (!classId) return [];
  const { data } = await admin.from('class_members').select('student_id').eq('class_id', classId);
  return (data ?? []).map((r) => r.student_id as string);
}

export const POST = handler(async (req: Request) => {
  const actor = await apiUser(['teacher', 'admin']);
  const input = await parseBody(req, body);
  const admin = createAdminClient();

  if (input.action === 'suggest') {
    const objectives = await topicObjectives(admin, input.topic_id);
    if (!objectives.length) throw new ApiError(409, 'Бұл тақырыпқа оқу мақсаттары әлі байланбаған (қазір 8 және 9-сыныптың 2-тоқсаны енгізілген). Дайындық/БЖБ тақырыптары аралас — нақты тақырыпты таңдаңыз.');
    // Сынып оқушыларына бұрын көрсетілген есептер соңына ысырылады
    const seen = await seenQuestionIds(admin, await classStudentIds(admin, input.class_id));
    const used = new Set<string>();
    const out: { objective: Objective; available: number; items: ReturnType<typeof publicQ>[] }[] = [];
    for (const o of objectives) {
      const pool = await objectiveQuestions(admin, o.id);
      const picked = pickVaried(pool, input.per_objective, used, seen);
      picked.forEach((q) => used.add(q.id));
      const rub = await rubricMap(admin, picked.map((q) => q.id));
      out.push({ objective: o, available: pool.length, items: picked.map((q) => publicQ(q, defaultCriteria(q.question_type, q.marks, rub.get(q.id)))) });
    }
    return json({ objectives: out });
  }

  if (input.action === 'swap') {
    const pool = await objectiveQuestions(admin, input.objective_id);
    const seen = await seenQuestionIds(admin, await classStudentIds(admin, input.class_id));
    const excl = new Set(input.exclude);
    let cands = pool.filter((q) => !excl.has(q.id));
    if (input.difficulty) {
      const same = cands.filter((q) => q.difficulty === input.difficulty);
      if (same.length) cands = same;
    }
    cands.sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)));
    const q = cands[0];
    if (!q) throw new ApiError(409, 'Бұл мақсатқа банкте басқа есеп жоқ.');
    const rub = await rubricMap(admin, [q.id]);
    return json({ item: publicQ(q, defaultCriteria(q.question_type, q.marks, rub.get(q.id))) });
  }

  // publish
  const ids = input.items.map((i) => i.question_id);
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'Бір есеп екі рет қосылған.');
  const [{ data: qs }, { data: keys }, { data: topic }] = await Promise.all([
    admin.from('questions').select('id, question_type, body_json, marks, difficulty, status, question_topics(topic_id)').in('id', ids),
    admin.from('question_keys').select('question_id, answer_json, solution_json').in('question_id', ids),
    admin.from('topics').select('id, title, units(grade)').eq('id', input.topic_id).maybeSingle(),
  ]);
  if (!topic) throw new ApiError(404, 'Тақырып табылмады');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qMap = new Map<string, any>((qs ?? []).map((q: { id: string }) => [q.id, q]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kMap = new Map<string, any>((keys ?? []).map((k: { question_id: string }) => [k.question_id, k]));
  const { data: links } = await admin.from('question_objectives').select('question_id, objective_id').in('question_id', ids);
  for (const it of input.items) {
    const q = qMap.get(it.question_id);
    if (!q || q.status !== 'published') throw new ApiError(400, 'Есеп табылмады немесе жарияланбаған.');
    if (!(links ?? []).some((l) => l.question_id === it.question_id && l.objective_id === it.objective_id)) throw new ApiError(400, 'Есеп таңдалған оқу мақсатына байланбаған.');
    const sum = it.criteria.reduce((s, c) => s + c.marks, 0);
    if (Math.abs(sum - Number(q.marks)) > 1e-6) throw new ApiError(400, `Бағалау өлшемдерінің қосындысы (${sum}) есептің ұпайына (${Number(q.marks)}) тең болуы керек.`);
  }
  if (input.class_id) {
    const { data: cls } = await admin.from('classes').select('grade').eq('id', input.class_id).maybeSingle();
    if (!cls || cls.grade !== input.grade) throw new ApiError(400, 'Сынып пен параллель сәйкес емес');
  }
  const total = input.items.reduce((s, it) => s + Number(qMap.get(it.question_id)!.marks), 0);
  const { data: a, error } = await admin
    .from('assignments')
    .insert({
      title: input.title,
      description: input.description,
      grade: input.grade,
      class_id: input.class_id ?? null,
      due_at: input.due_at ?? null,
      max_score: total,
      status: 'published',
      created_by: actor.id,
      mode: 'tasks',
      topic_id: input.topic_id,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(500, 'Тапсырманы сақтау қатесі: ' + error.message);
  try {
    const { data: items, error: iErr } = await admin
      .from('homework_items')
      .insert(input.items.map((it, i) => {
        const q = qMap.get(it.question_id)!;
        const qt = (q.question_topics as { topic_id: string }[] | null) ?? [];
        return {
          assignment_id: a.id, position: i + 1, question_id: q.id, objective_id: it.objective_id,
          topic_id: qt[0]?.topic_id ?? input.topic_id, question_type: q.question_type, body_json: q.body_json,
          criteria_json: it.criteria, max_marks: q.marks, difficulty: q.difficulty,
        };
      }))
      .select('id, question_id');
    if (iErr) throw iErr;
    const { error: kErr } = await admin.from('homework_item_keys').insert((items ?? []).map((r) => {
      const k = kMap.get(r.question_id as string);
      return { item_id: r.id, answer_json: k?.answer_json ?? {}, solution_json: k?.solution_json ?? {} };
    }));
    if (kErr) throw kErr;
  } catch (e) {
    await admin.from('assignments').delete().eq('id', a.id);
    throw new ApiError(500, 'Есептерді сақтау қатесі: ' + (e instanceof Error ? e.message : String(e)));
  }
  if (input.lesson_id) await admin.from('lessons').update({ assignment_id: a.id }).eq('id', input.lesson_id);
  const students = await assignmentStudents(admin, { grade: input.grade, class_id: input.class_id ?? null });
  await audit(actor.id, 'homework.compose', 'assignment', a.id, { items: input.items.length, students: students.length });
  return json({ id: a.id, redirect: `/admin/homework/${a.id}`, students: students.length }, 201);
});
