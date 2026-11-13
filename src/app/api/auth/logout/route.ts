import { createClient } from '@/lib/supabase/server';
import { handler, json } from '@/lib/api';

export const POST = handler(async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return json({ ok: true, redirect: '/login' });
});
