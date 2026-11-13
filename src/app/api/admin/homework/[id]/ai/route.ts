import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, handler, json, parseBody } from '@/lib/api';
import { aiConfigured, checkSubmission } from '@/lib/ai-check';

export const maxDuration = 60;

/**
 * AI-мен тексеру (мұғалім):
 *  { student_id } → бір жұмысты қайта тексеру
 *  {}             → тексерілмеген (бағаланбаған) жұмыстардың бәрі, ~50 секунд ішінде үлгергені
 */
const body = z.object({ student_id: z.string().uuid().optional() });

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await apiUser(['teacher', 'admin']);
  if (!aiConfigured()) throw new ApiError(400, 'AI тексеру қосылмаған: Vercel-ге CF_ACCOUNT_ID және CF_AI_TOKEN қосыңыз');
  const { id } = await ctx.params;
  const input = await parseBody(req, body);
  const admin = createAdminClient();

  let q = admin.from('submissions').select('id, graded_at, submitted_at, submission_ai(status)').eq('assignment_id', id).not('submitted_at', 'is', null);
  if (input.student_id) q = q.eq('student_id', input.student_id);
  const { data } = await q;
  type Row = { id: string; graded_at: string | null; submission_ai: { status: string } | { status: string }[] | null };
  const rows = ((data ?? []) as Row[]).filter((r) => {
    if (input.student_id) return true;
    const st = Array.isArray(r.submission_ai) ? r.submission_ai[0]?.status : r.submission_ai?.status;
    return !r.graded_at && st !== 'done' && st !== 'skipped';
  });
  if (input.student_id && !rows.length) throw new ApiError(404, 'Бұл оқушы әлі жұмыс тапсырмаған');

  const started = Date.now();
  const counts: Record<string, number> = {};
  let left = 0;
  for (const r of rows) {
    if (Date.now() - started > 45_000) { left++; continue; }
    const st = await checkSubmission(admin, r.id);
    counts[st] = (counts[st] ?? 0) + 1;
    if (st === 'quota') { left += rows.length - Object.values(counts).reduce((s, n) => s + n, 0); break; }
  }
  return json({ counts, left, total: rows.length });
});
