import { z } from 'zod';
import { apiUser, handler, json, parseBody } from '@/lib/api';
import { gradeAttempt } from '@/lib/hw-tasks';

const body = z.object({ attempt_id: z.string().uuid(), marks: z.number().min(0).max(100), note: z.string().max(1000).nullable().optional() });

export const POST = handler(async (req: Request) => {
  const profile = await apiUser(['teacher', 'admin']);
  const input = await parseBody(req, body);
  return json(await gradeAttempt(profile, input.attempt_id, input.marks, input.note?.trim() || null));
});
