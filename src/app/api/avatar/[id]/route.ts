import { apiUser, handler } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Аватар: профильді көруге рұқсаты барларға ғана беріледі (RLS арқылы тексеріледі). */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await apiUser();
  const { id } = await ctx.params;
  const { data: p } = await (await createClient()).from('profiles').select('avatar_path').eq('id', id).maybeSingle();
  if (!p?.avatar_path) return new Response('Not found', { status: 404 });
  const { data: blob } = await createAdminClient().storage.from('avatars').download(p.avatar_path as string);
  if (!blob) return new Response('Not found', { status: 404 });
  return new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg', 'Cache-Control': 'private, max-age=3600' } });
});
