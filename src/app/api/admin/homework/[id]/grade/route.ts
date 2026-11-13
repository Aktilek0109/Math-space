import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, handler, json, parseBody } from '@/lib/api';

/** Мұғалім бір жұмысты бағалайды: { student_id, score|null, feedback } */
const body = z.object({
  student_id: z.string().uuid(),
  score: z.number().min(0).max(100).nullable(),
  feedback: z.string().max(3000).default(''),
});

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await apiUser(['teacher', 'admin']);
  const { id } = await ctx.params;
  const input = await parseBody(req, body);
  const admin = createAdminClient();
  const { data: a } = await admin.from('assignments').select('max_score').eq('id', id).maybeSingle();
  if (!a) throw new ApiError(404, 'Тапсырма табылмады');
  if (input.score !== null && input.score > Number(a.max_score)) throw new ApiError(400, `Баға ${a.max_score}-дан аспауы керек`);

  const graded = input.score !== null || input.feedback.trim() !== '';
  const { error } = await admin.from('submissions').upsert(
    {
      assignment_id: id,
      student_id: input.student_id,
      score: input.score,
      feedback: input.feedback,
      graded_by: graded ? actor.id : null,
      graded_at: graded ? new Date().toISOString() : null,
    },
    { onConflict: 'assignment_id,student_id' },
  );
  if (error) throw new ApiError(500, 'Бағаны сақтау қатесі');
  return json({ ok: true });
});
