import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, handler } from '@/lib/api';

/** Үй жұмысы файлына қысқа мерзімді сілтеме. ?id=<file_id>&download=1. Рұқсатты RLS тексереді. */
export const GET = handler(async (req: Request) => {
  await apiUser();
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) throw new ApiError(400, 'id жоқ');
  const supabase = await createClient();
  const { data: f } = await supabase.from('submission_files').select('storage_path, original_name').eq('id', id).maybeSingle();
  if (!f) throw new ApiError(404, 'Файл табылмады');
  const download = url.searchParams.get('download') === '1';
  const { data, error } = await createAdminClient()
    .storage.from('homework')
    .createSignedUrl(f.storage_path, 300, download ? { download: f.original_name } : undefined);
  if (error || !data) throw new ApiError(500, 'Сілтеме жасалмады');
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { 'Cache-Control': 'no-store' } });
});
