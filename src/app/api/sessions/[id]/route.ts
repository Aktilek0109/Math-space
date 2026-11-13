import { apiUser, handler, json } from '@/lib/api';
import { loadSessionView } from '@/lib/sessions';

/** Шарттар + өз жауаптары. Кілт тек аяқталған/ашылған тапсырмаларда (SEC-03). */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const profile = await apiUser();
  const { id } = await ctx.params;
  return json(await loadSessionView(id, profile));
});
