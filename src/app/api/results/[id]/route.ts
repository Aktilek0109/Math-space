import { createClient } from '@/lib/supabase/server';
import { ApiError, apiUser, handler, json } from '@/lib/api';

/** id = session_id. RLS: оқушы — өзінікі, мұғалім — рұқсатты сыныптар (AC-08). */
export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await apiUser();
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data } = await supabase.from('results').select('*').eq('session_id', id).maybeSingle();
  if (!data) throw new ApiError(404, 'Нәтиже табылмады');
  return json(data);
});
