import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';

/**
 * Сабақ журналы (мұғалім):
 *  create: { class_id, lesson_date, topic_id?, title?, note?, homework_text?, online?: { max_score, answer_text, due_at? } }
 *          online берілсе — сол сыныпқа фото арқылы тапсырылатын үй жұмысы да жасалады
 *  delete: { id }
 */
const createSchema = z.object({
  action: z.literal('create'),
  class_id: z.string().uuid(),
  lesson_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topic_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(200).default(''),
  note: z.string().trim().max(2000).default(''),
  homework_text: z.string().trim().max(2000).default(''),
  online: z
    .object({
      max_score: z.number().positive().max(100).default(10),
      answer_text: z.string().max(10000).default(''),
      due_at: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .nullable()
    .optional(),
});
const body = z.discriminatedUnion('action', [createSchema, z.object({ action: z.literal('delete'), id: z.string().uuid() })]);

export const POST = handler(async (req: Request) => {
  const actor = await apiUser(['teacher', 'admin']);
  const input = await parseBody(req, body);
  const admin = createAdminClient();

  if (input.action === 'delete') {
    const { error } = await admin.from('lessons').delete().eq('id', input.id);
    if (error) throw new ApiError(500, 'Жою қатесі');
    return json({ ok: true });
  }

  if (!input.topic_id && !input.title) throw new ApiError(400, 'Тақырыпты таңдаңыз немесе атауын жазыңыз');
  const { data: cls } = await admin.from('classes').select('id, name, grade').eq('id', input.class_id).maybeSingle();
  if (!cls) throw new ApiError(404, 'Сынып табылмады');
  let topicTitle = input.title;
  if (input.topic_id) {
    const { data: t } = await admin.from('topics').select('title').eq('id', input.topic_id).maybeSingle();
    if (!t) throw new ApiError(404, 'Тақырып табылмады');
    topicTitle = topicTitle || (t.title as string);
  }

  let assignmentId: string | null = null;
  if (input.online) {
    if (!input.homework_text) throw new ApiError(400, 'Онлайн тапсыру үшін үй тапсырмасын жазыңыз');
    const { data: a, error } = await admin
      .from('assignments')
      .insert({
        title: `${topicTitle}: ${input.homework_text}`.slice(0, 200),
        description: input.homework_text,
        grade: cls.grade,
        class_id: cls.id,
        due_at: input.online.due_at ?? null,
        max_score: input.online.max_score,
        status: 'published',
        created_by: actor.id,
      })
      .select('id')
      .single();
    if (error || !a) throw new ApiError(500, 'Үй жұмысын жасау қатесі');
    assignmentId = a.id as string;
    if (input.online.answer_text.trim()) await admin.from('assignment_keys').insert({ assignment_id: assignmentId, answer_text: input.online.answer_text });
  }

  const { data, error } = await admin
    .from('lessons')
    .insert({
      class_id: cls.id,
      lesson_date: input.lesson_date,
      topic_id: input.topic_id ?? null,
      title: input.topic_id ? input.title : topicTitle,
      note: input.note,
      homework_text: input.homework_text,
      assignment_id: assignmentId,
      created_by: actor.id,
    })
    .select('id')
    .single();
  if (error || !data) throw new ApiError(500, 'Сабақты сақтау қатесі');
  await audit(actor.id, 'lesson.create', 'lesson', data.id as string, { class: cls.name, date: input.lesson_date });
  return json({ id: data.id, assignment_id: assignmentId }, 201);
});
