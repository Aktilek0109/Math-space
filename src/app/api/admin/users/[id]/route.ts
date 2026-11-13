import { z } from 'zod';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';
import { resetPassword, setActive } from '@/lib/users';
import { createAdminClient } from '@/lib/supabase/admin';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reset_password') }),
  z.object({ action: z.literal('set_active'), active: z.boolean() }),
  z.object({ action: z.literal('set_grade'), grade: z.number().int().min(7).max(12).nullable() }),
]);

export const PATCH = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await apiUser(['admin']);
  const { id } = await ctx.params;
  const input = await parseBody(req, body);
  if (id === actor.id && input.action === 'set_active') throw new ApiError(400, 'Өз аккаунтыңызды бұғаттай алмайсыз');

  switch (input.action) {
    case 'reset_password': {
      const password = await resetPassword(id);
      await audit(actor.id, 'user.reset_password', 'profile', id);
      return json({ ok: true, password });
    }
    case 'set_active':
      await setActive(id, input.active);
      await audit(actor.id, input.active ? 'user.unblock' : 'user.block', 'profile', id);
      return json({ ok: true });
    case 'set_grade':
      await createAdminClient().from('profiles').update({ current_grade: input.grade }).eq('id', id);
      await audit(actor.id, 'user.set_grade', 'profile', id, { grade: input.grade });
      return json({ ok: true });
  }
});
