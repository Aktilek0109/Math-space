import { ApiError, apiUser, handler, json } from '@/lib/api';
import { finalizeSession, getVisibleSession } from '@/lib/sessions';

export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const profile = await apiUser();
  const { id } = await ctx.params;
  const session = await getVisibleSession(id);
  if (session.owner_id !== profile.id) throw new ApiError(403, 'Бұл сынақ сіздікі емес');
  const out = await finalizeSession(id, profile.id);
  return json({ ok: true, already_submitted: out.alreadySubmitted, redirect: `/results/${id}` });
});
