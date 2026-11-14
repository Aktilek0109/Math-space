import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, handler } from '@/lib/api';

/** Есеп жауабына тіркелген файл. ?a=<attempt_id>&i=<index>. Рұқсатты RLS тексереді (оқушының өзі / мұғалімі). */
export const GET = handler(async (req: Request) => {
  await apiUser();
  const url = new URL(req.url);
  const a = url.searchParams.get('a');
  const i = Number(url.searchParams.get('i') ?? 0);
  if (!a || !/^[0-9a-f-]{36}$/i.test(a) || !Number.isInteger(i) || i < 0) throw new ApiError(400, 'Параметр жарамсыз');
  const supabase = await createClient();
  const { data } = await supabase.from('homework_attempts').select('files_json').eq('id', a).maybeSingle();
  const f = ((data?.files_json ?? []) as { path: string; name: string }[])[i];
  if (!f) throw new ApiError(404, 'Файл табылмады');
  const { data: s, error } = await createAdminClient().storage.from('homework').createSignedUrl(f.path, 300);
  if (error || !s) throw new ApiError(500, 'Сілтеме жасалмады');
  return NextResponse.redirect(s.signedUrl, { status: 302, headers: { 'Cache-Control': 'no-store' } });
});
