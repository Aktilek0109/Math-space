import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Кесте қайтаратын SQL функциясын толық оқу. PostgREST бір жауапта ең көбі 1000 жол береді,
 * сондықтан тұрақты ретпен (orderBy) бетпе-бет сұраймыз — әйтпесе жылу картасы сияқты беттерде
 * деректердің бір бөлігі білдіртпей жоғалады.
 */
export async function rpcAll<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>, orderBy: string[]): Promise<{ data: T[]; error: Error | null }> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; from < 200_000; from += PAGE) {
    let q = db.rpc(fn, args);
    for (const col of orderBy) q = q.order(col);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) return { data: out, error };
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return { data: out, error: null };
}
