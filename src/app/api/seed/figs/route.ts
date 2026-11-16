import { createHash } from 'node:crypto';
import { handler, json, ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import bzhbFigs from '@/data/figs-bzhb-2026-11.json';

/**
 * Бар есептерге сызба қосу: GET /api/seed/figs?set=<жинақ>&token=<бір реттік токен>.
 * Есеп мәтіні бойынша табылады; шартта сызба болмаса — қосылады, шешімнің сызбалары ауыстырылады.
 * Токен хэші seed_tokens кестесінде purpose = 'figs:<жинақ>'.
 */
interface Item { text: string; figure: unknown | null; figures: unknown[] | null }
const SETS: Record<string, { items: unknown; source: string }> = {
  'bzhb-2026-11': { items: bzhbFigs, source: 'Claude, БЖБ тақырыптар 2026-11-16' },
};

export const maxDuration = 60;

export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const name = url.searchParams.get('set') ?? '';
  const set = SETS[name];
  const token = url.searchParams.get('token') ?? '';
  if (!set || token.length < 32) throw new ApiError(404, 'Табылмады');
  const hash = createHash('sha256').update(token).digest('hex');
  const admin = createAdminClient();
  const { data: tok } = await admin.from('seed_tokens').select('used_at').eq('token_hash', hash).eq('purpose', `figs:${name}`).maybeSingle();
  if (!tok || tok.used_at) throw new ApiError(404, 'Табылмады');
  await admin.from('seed_tokens').update({ used_at: new Date().toISOString() }).eq('token_hash', hash);

  const byText = new Map<string, { id: string; body: Record<string, unknown> }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('questions').select('id, body_json').eq('source', set.source).range(from, from + 999);
    if (error) throw error;
    for (const q of data ?? []) byText.set((q.body_json as { text: string }).text, { id: q.id as string, body: q.body_json as Record<string, unknown> });
    if (!data || data.length < 1000) break;
  }

  const items = set.items as Item[];
  let bodies = 0, sols = 0, missing = 0;
  const work = items.map((it) => async () => {
    const q = byText.get(it.text);
    if (!q) { missing++; return; }
    if (it.figure && !q.body.figure) {
      const { error } = await admin.from('questions').update({ body_json: { ...q.body, figure: it.figure } }).eq('id', q.id);
      if (error) throw error;
      bodies++;
    }
    if (it.figures?.length) {
      const { data: k } = await admin.from('question_keys').select('solution_json').eq('question_id', q.id).maybeSingle();
      const sol = (k?.solution_json ?? {}) as Record<string, unknown>;
      const { error } = await admin.from('question_keys').update({ solution_json: { ...sol, figures: it.figures } }).eq('question_id', q.id);
      if (error) throw error;
      sols++;
    }
  });
  for (let i = 0; i < work.length; i += 25) await Promise.all(work.slice(i, i + 25).map((w) => w()));
  return json({ items: items.length, bodies, sols, missing });
});
