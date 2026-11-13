import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, handler } from '@/lib/api';

/** Файлға қысқа мерзімді signed URL (SEC-02). ?asset=<id>&download=1 */
export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const profile = await apiUser();
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const assetId = url.searchParams.get('asset');
  const download = url.searchParams.get('download') === '1';

  // Қолжетімділікті RLS арқылы тексеру: оқушы тек published материалды көреді
  const supabase = await createClient();
  let q = supabase.from('material_assets').select('id, storage_path, original_name, material_id').eq('material_id', id).eq('is_current', true);
  if (assetId) q = q.eq('id', assetId);
  const { data: asset } = await q.order('position').limit(1).maybeSingle();
  if (!asset) throw new ApiError(404, 'Файл табылмады');

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from('materials')
    .createSignedUrl(asset.storage_path, 60, download ? { download: asset.original_name } : undefined);
  if (error || !signed) throw new ApiError(500, 'Сілтеме жасалмады');

  await admin.from('material_views').upsert({ user_id: profile.id, material_id: id, viewed_at: new Date().toISOString() });
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { 'Cache-Control': 'no-store' } });
});
