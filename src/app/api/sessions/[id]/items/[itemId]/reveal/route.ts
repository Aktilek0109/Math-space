import { apiUser, handler, json } from '@/lib/api';
import { revealItem } from '@/lib/sessions';

/** Жаттығу режимі: сақталған жауаптан кейін бір тапсырманың шешімін ашу. */
export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) => {
  const profile = await apiUser();
  const { id, itemId } = await ctx.params;
  return json(await revealItem(id, itemId, profile));
});
