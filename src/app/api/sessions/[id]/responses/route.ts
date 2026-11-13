import { apiUser, handler, json, parseBody } from '@/lib/api';
import { saveResponses } from '@/lib/sessions';
import { saveResponsesSchema } from '@/lib/validation';

export const PUT = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const profile = await apiUser();
  const { id } = await ctx.params;
  const { responses } = await parseBody(req, saveResponsesSchema);
  return json(await saveResponses(id, profile, responses));
});
