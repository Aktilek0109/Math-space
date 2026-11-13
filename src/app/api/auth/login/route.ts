import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, handler, json, parseBody, audit } from '@/lib/api';
import { loginSchema } from '@/lib/validation';
import { normalizeUsername, usernameToEmail } from '@/lib/auth';

const WINDOW_MIN = 15;
const MAX_FAILS_PER_USER = 5;
const MAX_FAILS_PER_IP = 30;
const GENERIC = 'Логин немесе пароль қате';

export const POST = handler(async (req: Request) => {
  const { username: rawUser, password } = await parseBody(req, loginSchema);
  const username = normalizeUsername(rawUser);
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const admin = createAdminClient();

  // Rate limit (SEC-05): соңғы 15 минуттағы сәтсіз әрекеттер
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const [{ count: userFails }, { count: ipFails }] = await Promise.all([
    admin.from('login_attempts').select('id', { count: 'exact', head: true }).eq('username', username).eq('success', false).gte('created_at', since),
    admin.from('login_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('success', false).gte('created_at', since),
  ]);
  if ((userFails ?? 0) >= MAX_FAILS_PER_USER || (ipFails ?? 0) >= MAX_FAILS_PER_IP) {
    throw new ApiError(429, `Тым көп сәтсіз әрекет. ${WINDOW_MIN} минуттан кейін қайталаңыз.`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });

  if (error || !data.user) {
    await admin.from('login_attempts').insert({ username, ip, success: false });
    throw new ApiError(401, GENERIC); // қай өріс қате екенін айтпаймыз (user enumeration)
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('is_active, must_change_password, role')
    .eq('id', data.user.id)
    .single();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    await admin.from('login_attempts').insert({ username, ip, success: false });
    throw new ApiError(403, 'Аккаунт бұғатталған. Әкімшіге хабарласыңыз.');
  }

  await admin.from('login_attempts').insert({ username, ip, success: true });
  if (profile.role !== 'student') await audit(data.user.id, 'auth.login', 'profile', data.user.id, { ip });

  return json({ ok: true, redirect: profile.must_change_password ? '/change-password' : '/dashboard' });
});
