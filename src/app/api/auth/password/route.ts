import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, handler, json, parseBody, audit } from '@/lib/api';
import { getCurrentProfile } from '@/lib/auth';
import { passwordSchema } from '@/lib/validation';

export const POST = handler(async (req: Request) => {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) throw new ApiError(401, 'Кіру қажет');
  const { password } = await parseBody(req, passwordSchema);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new ApiError(400, 'Парольді өзгерту мүмкін болмады: ' + error.message);

  await createAdminClient().from('profiles').update({ must_change_password: false }).eq('id', profile.id);
  await audit(profile.id, 'auth.password_changed', 'profile', profile.id);
  return json({ ok: true, redirect: '/dashboard' });
});
