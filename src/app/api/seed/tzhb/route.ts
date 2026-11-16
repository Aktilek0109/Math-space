import { createHash } from 'node:crypto';
import { handler, json, ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import data from '@/data/tzhb-2026-q2.json';

/**
 * ТЖБ слот-есептерін банкке бір рет жүктеу. Қорғаныс — бір реттік токен:
 * оның sha256 хэші seed_tokens кестесінде (тек service role оқиды) тұруы керек, қолданылған соң жабылады.
 */
interface Row {
  slot: string; grade: number; unit: string; topic: string; obj: string; difficulty: number; marks: number;
  type: string; body: Record<string, unknown>; answer: Record<string, unknown>; solution: Record<string, unknown>;
}

const SUBJECT = '00000000-0000-0000-0000-000000000001';

export const GET = handler(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (token.length < 32) throw new ApiError(404, 'Табылмады');
  const hash = createHash('sha256').update(token).digest('hex');
  const admin = createAdminClient();
  const { data: tok } = await admin.from('seed_tokens').select('token_hash, used_at').eq('token_hash', hash).eq('purpose', 'tzhb-2026-q2').maybeSingle();
  if (!tok || tok.used_at) throw new ApiError(404, 'Табылмады');
  await admin.from('seed_tokens').update({ used_at: new Date().toISOString() }).eq('token_hash', hash);

  const rows = data as unknown as Row[];
  const { data: objs, error: oe } = await admin.from('learning_objectives').select('id, code, grade');
  if (oe) throw oe;
  const objId = new Map((objs ?? []).map((o) => [`${o.grade}:${o.code}`, o.id as string]));
  const { data: existing } = await admin.from('questions').select('component, body_json').in('component', [...new Set(rows.map((r) => r.slot))]);
  const seen = new Set((existing ?? []).map((e) => `${e.component}|${JSON.stringify(e.body_json)}`));

  let inserted = 0, skipped = 0;
  for (const r of rows) {
    if (seen.has(`${r.slot}|${JSON.stringify(r.body)}`)) { skipped++; continue; }
    const { data: q, error } = await admin
      .from('questions')
      .insert({
        subject_id: SUBJECT, grade: r.grade, unit_id: r.unit, body_json: r.body, question_type: r.type, marks: r.marks,
        difficulty: r.difficulty, exam_types: ['TZhB'], component: r.slot, status: 'published', source_kind: 'authored',
        source: 'Claude, ТЖБ 2026-11-16',
      })
      .select('id')
      .single();
    if (error || !q) throw error ?? new Error('insert');
    const id = q.id as string;
    const k = await admin.from('question_keys').insert({ question_id: id, answer_json: r.answer, solution_json: r.solution });
    if (k.error) throw k.error;
    await admin.from('question_topics').insert({ question_id: id, topic_id: r.topic });
    const oid = objId.get(`${r.grade}:${r.obj}`);
    if (oid) await admin.from('question_objectives').insert({ question_id: id, objective_id: oid, weight: 1 });
    inserted++;
  }
  return json({ inserted, skipped, total: rows.length });
});
