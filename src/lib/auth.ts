import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';

export type Role = 'student' | 'teacher' | 'admin';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  current_grade: number | null;
  is_active: boolean;
  must_change_password: boolean;
}

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

/** username → Auth-тың техникалық email-і (тек серверде, AUTH-02). */
export function usernameToEmail(username: string) {
  const domain = process.env.AUTH_EMAIL_DOMAIN ?? 'students.eduplatform.local';
  return `${normalizeUsername(username)}@${domain}`;
}

/** Сұрау ішінде бір рет оқылатын ағымдағы профиль. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, current_grade, is_active, must_change_password')
    .eq('id', user.id)
    .single();
  return (data as Profile | null) ?? null;
});

/** Беттер үшін: кірмеген/бұғатталған → /login; пароль ауыстыру міндетті → /change-password. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) redirect('/login?blocked=' + (profile ? '1' : '0'));
  if (profile.must_change_password && !opts.allowPasswordChange) redirect('/change-password');
  return profile;
}

export async function requireRole(roles: Role[]): Promise<Profile> {
  const profile = await requireUser();
  if (!roles.includes(profile.role)) redirect('/dashboard?forbidden=1');
  return profile;
}

export const isStaff = (p: Pick<Profile, 'role'>) => p.role === 'teacher' || p.role === 'admin';
