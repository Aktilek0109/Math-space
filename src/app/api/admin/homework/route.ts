import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';

/** Мұғалім: тапсырма жасау / жою. */
const createSchema = z.object({
  action: z.literal('create'),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(5000).default(''),
  grade: z.number().int().min(7).max(12),
  class_id: z.string().uuid().nullable().optional(),
  material_id: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  max_score: z.number().positive().max(100).default(10),
  answer_text: z.string().max(10000).default(''),
});
const deleteSchema = z.object({ action: z.literal('delete'), id: z.string().uuid() });
const body = z.discriminatedUnion('action', [createSchema, deleteSchema]);

export const POST = handler(async (req: Request) => {
  const actor = await apiUser(['teacher', 'admin']);
  const input = await parseBody(req, body);
  const admin = createAdminClient();

  if (input.action === 'delete') {
    const { data: files } = await admin
      .from('submission_files')
      .select('storage_path, submissions!inner(assignment_id)')
      .eq('submissions.assignment_id', input.id);
    const paths = (files ?? []).map((f) => f.storage_path as string);
    if (paths.length) await admin.storage.from('homework').remove(paths);
    const { error } = await admin.from('assignments').delete().eq('id', input.id);
    if (error) throw new ApiError(500, 'Жою қатесі');
    await audit(actor.id, 'homework.delete', 'assignment', input.id);
    return json({ ok: true });
  }

  const { data, error } = await admin
    .from('assignments')
    .insert({
      title: input.title,
      description: input.description,
      grade: input.grade,
      class_id: input.class_id ?? null,
      material_id: input.material_id ?? null,
      due_at: input.due_at ?? null,
      max_score: input.max_score,
      status: 'published',
      created_by: actor.id,
    })
    .select('id')
    .single();
  if (error || !data) throw new ApiError(500, 'Тапсырманы сақтау қатесі');
  if (input.answer_text.trim()) await admin.from('assignment_keys').insert({ assignment_id: data.id, answer_text: input.answer_text });
  await audit(actor.id, 'homework.create', 'assignment', data.id as string, { grade: input.grade });
  return json({ id: data.id }, 201);
});
