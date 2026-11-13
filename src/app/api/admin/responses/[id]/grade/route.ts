import { z } from 'zod';
import { apiUser, handler, json, parseBody } from '@/lib/api';
import { gradeManually } from '@/lib/sessions';

const body = z.object({ marks: z.number().min(0).max(100) });

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const grader = await apiUser(['teacher', 'admin']);
  const { id } = await ctx.params;
  const { marks } = await parseBody(req, body);
  await gradeManually(id, marks, grader);
  return json({ ok: true });
});
