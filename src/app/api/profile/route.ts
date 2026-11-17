import { z } from 'zod';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const str = (n: number) => z.string().trim().max(n).transform((v) => (v === '' ? null : v)).nullable().optional();
const body = z.object({
  user_id: z.string().uuid().optional(),
  about: str(600),
  goal: str(200),
  interests: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  subject: str(120),
  teacher_category: str(120),
  experience_years: z.number().int().min(0).max(60).nullable().optional(),
  office_hours: str(200),
  contacts: z.object({
    phone: str(30), email: z.string().trim().max(120).email().or(z.literal('')).transform((v) => v || null).nullable().optional(),
    parent_name: str(120), parent_phone: str(30),
    parent_email: z.string().trim().max(120).email().or(z.literal('')).transform((v) => v || null).nullable().optional(),
  }).optional(),
});

/**
 * Профильді толықтыру. Өзі: «мен туралы», мақсат, қызығушылық, байланыс; мұғалім/әкімші — өз мұғалім мәліметі.
 * Мұғалім өз оқушысының байланысын (ата-ана) толтыра алады; әкімші — бәрін.
 */
export const PATCH = handler(async (req: Request) => {
  const me = await apiUser();
  const input = await parseBody(req, body);
  const uid = input.user_id ?? me.id;
  const self = uid === me.id;
  const admin = createAdminClient();
  if (!self) {
    if (me.role === 'student') throw new ApiError(403, 'Рұқсат жоқ');
    const { data: ok } = await (await createClient()).rpc('can_view_student', { p_student: uid });
    if (!ok) throw new ApiError(403, 'Бұл оқушыға рұқсат жоқ');
  }
  const { data: target } = await admin.from('profiles').select('id, role').eq('id', uid).maybeSingle();
  if (!target) throw new ApiError(404, 'Профиль табылмады');

  const pub: Record<string, unknown> = {};
  const canPublic = self || me.role === 'admin';
  if (canPublic) {
    for (const k of ['about', 'goal', 'interests'] as const) if (input[k] !== undefined) pub[k] = input[k];
    if (target.role !== 'student') for (const k of ['subject', 'teacher_category', 'experience_years', 'office_hours'] as const) if (input[k] !== undefined) pub[k] = input[k];
  }
  if (Object.keys(pub).length) {
    const { error } = await admin.from('profiles').update(pub).eq('id', uid);
    if (error) throw new ApiError(400, 'Сақтау қатесі: ' + error.message);
  }
  if (input.contacts) {
    const c = { ...input.contacts };
    if (target.role !== 'student') { delete c.parent_name; delete c.parent_phone; delete c.parent_email; }
    const { error } = await admin.from('profile_contacts').upsert({ user_id: uid, ...c, updated_at: new Date().toISOString() });
    if (error) throw new ApiError(400, 'Байланысты сақтау қатесі: ' + error.message);
  }
  if (!self) await audit(me.id, 'profile.update', 'profile', uid, { fields: [...Object.keys(pub), ...(input.contacts ? ['contacts'] : [])] });
  return json({ ok: true });
});
