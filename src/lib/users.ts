import 'server-only';
import { randomInt } from 'node:crypto';
import { createAdminClient } from './supabase/admin';
import { usernameToEmail } from './auth';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // шатасатын 0/O, 1/l жоқ

export function tempPassword(length = 10) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  // кемінде бір сан болсын (пароль саясаты)
  return /\d/.test(out) ? out : out.slice(0, -1) + String(randomInt(2, 10));
}

export interface NewAccount {
  username: string;
  full_name: string;
  grade?: number;
  role: 'student' | 'teacher' | 'admin';
}

/** Аккаунт жасау (AUTH-01). Profile-ді handle_new_user триггері жасайды. */
export async function createAccount(acc: NewAccount) {
  const admin = createAdminClient();
  const password = tempPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: usernameToEmail(acc.username),
    password,
    email_confirm: true,
    app_metadata: {
      username: acc.username,
      full_name: acc.full_name,
      role: acc.role,
      grade: acc.grade ?? null,
      must_change_password: true,
    },
  });
  if (error) {
    const dup = /already|exists|registered/i.test(error.message);
    return { ok: false as const, username: acc.username, error: dup ? 'Бұл логин бос емес' : error.message };
  }
  return { ok: true as const, username: acc.username, password, id: data.user.id };
}

export async function resetPassword(userId: string) {
  const admin = createAdminClient();
  const password = tempPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) throw error;
  await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
  return password;
}

export async function setActive(userId: string, active: boolean) {
  const admin = createAdminClient();
  await admin.from('profiles').update({ is_active: active }).eq('id', userId);
  // Бұғатталса — белсенді сессияларды да тоқтату
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' });
}
