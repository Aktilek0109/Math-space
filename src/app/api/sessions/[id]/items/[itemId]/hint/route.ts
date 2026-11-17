import { z } from 'zod';
import { apiUser, handler, json, parseBody } from '@/lib/api';
import { hintItem } from '@/lib/sessions';

const Body = z.object({ level: z.number().int().min(1).max(2) }).strict();

/** Сатылы көмек: келесі сатыны ашу (жаттығу режимі, әр саты балдың 25%-ы). */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) => {
  const profile = await apiUser();
  const { id, itemId } = await ctx.params;
  const { level } = await parseBody(req, Body);
  return json(await hintItem(id, itemId, profile, level));
});
