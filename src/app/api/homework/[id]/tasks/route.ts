import { z } from 'zod';
import { ApiError, apiUser, handler, json, parseBody } from '@/lib/api';
import { HW_MAX_BYTES, HW_MIME } from '@/lib/homework';
import { createFollowup, prepareUpload, requestFeedback, saveAttempt, submitAll, submitItem } from '@/lib/hw-tasks';

/** Оқушының мақсат бойынша үй жұмысы (ТЗ 14.2–14.4). */
const answer = z.object({
  value: z.string().max(200).optional(),
  choice: z.string().max(20).optional(),
  text: z.string().max(5000).optional(),
});
const file = z.object({
  path: z.string().min(5).max(400),
  name: z.string().min(1).max(200),
  mime: z.string().refine((m) => m in HW_MIME, 'Тек сурет немесе PDF'),
  size: z.number().int().positive().max(HW_MAX_BYTES),
});
const kind = z.enum(['first', 'revised']);
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), item_id: z.string().uuid(), kind, answer, files: z.array(file).max(6).optional() }),
  z.object({ action: z.literal('prepare_upload'), item_id: z.string().uuid(), files: z.array(file.omit({ path: true })).min(1).max(6) }),
  z.object({ action: z.literal('feedback'), item_id: z.string().uuid() }),
  z.object({ action: z.literal('submit_item'), item_id: z.string().uuid(), kind }),
  z.object({ action: z.literal('followup'), item_id: z.string().uuid() }),
  z.object({ action: z.literal('submit_all') }),
]);

export const maxDuration = 60;

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const profile = await apiUser(['student']);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(404, 'Тапсырма табылмады');
  const input = await parseBody(req, body);
  switch (input.action) {
    case 'save':
      return json(await saveAttempt(profile, id, input));
    case 'prepare_upload':
      return json(await prepareUpload(profile, id, input.item_id, input.files));
    case 'feedback':
      return json(await requestFeedback(profile, id, input.item_id));
    case 'submit_item':
      return json(await submitItem(profile, id, input.item_id, input.kind));
    case 'followup':
      return json(await createFollowup(profile, id, input.item_id));
    case 'submit_all':
      return json(await submitAll(profile, id));
  }
  throw new ApiError(400, 'Белгісіз әрекет');
});
