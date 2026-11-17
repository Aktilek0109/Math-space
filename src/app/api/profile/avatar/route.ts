import { z } from 'zod';
import { ApiError, apiUser, handler, json } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

const body = z.object({ image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(1_500_000) });

/** Өз аватарын жүктеу (клиентте 400 px-ке дейін қысылады) немесе өшіру. */
export const POST = handler(async (req: Request) => {
  const me = await apiUser();
  if (Number(req.headers.get('content-length') ?? 0) > 1_600_000) throw new ApiError(413, 'Сурет тым үлкен');
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'Сурет форматы қате');
  const [, mime, b64] = /^data:(image\/\w+);base64,(.*)$/.exec(parsed.data.image)!;
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > 1_000_000) throw new ApiError(413, 'Сурет 1 МБ-тан аспауы керек');
  const admin = createAdminClient();
  const path = `${me.id}/${Date.now()}.${mime.split('/')[1]}`;
  const { data: old } = await admin.from('profiles').select('avatar_path').eq('id', me.id).maybeSingle();
  const { error } = await admin.storage.from('avatars').upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new ApiError(500, 'Жүктеу қатесі: ' + error.message);
  await admin.from('profiles').update({ avatar_path: path }).eq('id', me.id);
  if (old?.avatar_path) await admin.storage.from('avatars').remove([old.avatar_path as string]);
  return json({ ok: true, path });
});

export const DELETE = handler(async () => {
  const me = await apiUser();
  const admin = createAdminClient();
  const { data: old } = await admin.from('profiles').select('avatar_path').eq('id', me.id).maybeSingle();
  if (old?.avatar_path) await admin.storage.from('avatars').remove([old.avatar_path as string]);
  await admin.from('profiles').update({ avatar_path: null }).eq('id', me.id);
  return json({ ok: true });
});
