import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Апта сайын: оқушылар суретке түсіріп жіберген жұмыстардың файлдарын (бакет 'homework', 7 күннен ескі) жояды.
 * Балл, тексеру нәтижесі және ЖИ оқыған мәтін базада қалады — тек сурет файлы өшеді.
 * Vercel Cron шақырады: Authorization: Bearer <CRON_SECRET> (CRON_SECRET-ті мұғалім Vercel баптауларына өзі енгізеді).
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const DAYS = 7;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Рұқсат жоқ' }, { status: 401 });
  }
  const admin = createAdminClient();
  let removed = 0, bytes = 0;
  for (let round = 0; round < 10; round++) {
    const { data, error } = await admin.rpc('homework_purge_candidates', { older_than_days: DAYS, max_rows: 500 });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as { name: string; size: number }[];
    if (!rows.length) break;
    const paths = rows.map((r) => r.name);
    const { error: re } = await admin.storage.from('homework').remove(paths);
    if (re) return NextResponse.json({ error: re.message, removed }, { status: 500 });
    removed += rows.length;
    bytes += rows.reduce((s, r) => s + Number(r.size || 0), 0);
    // Белгі: файл тазаланды (қатарлар мен нәтижелер сақталады)
    await admin.from('submission_files').update({ purged_at: new Date().toISOString() }).in('storage_path', paths).is('purged_at', null);
    if (rows.length < 500) break;
  }
  await admin.from('purge_runs').insert({ files_removed: removed, bytes_freed: bytes });
  return NextResponse.json({ removed, bytes });
}
