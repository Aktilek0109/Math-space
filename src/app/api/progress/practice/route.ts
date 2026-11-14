import { z } from 'zod';
import { ApiError, apiUser, handler, json, parseBody } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { newSeed } from '@/lib/generator';
import { persistSession, questionDrafts, type QuestionRow } from '@/lib/sessions';
import { seenQuestionIds } from '@/lib/objectives';

/**
 * ТЗ 15 «Ұсынысты таңдау»: ұсыныс батырмасы тиісті оқу мақсаты мен күрделілігі таңдалған жаттығуды ашады.
 *  practice — сол дағдыға 4 есеп (жеңілден), harder — күрделі есептер, diagnose — 2 қысқа тексеру есебі.
 */
const body = z.object({ objective_id: z.string().uuid(), kind: z.enum(['practice', 'harder', 'diagnose']) });

export const POST = handler(async (req: Request) => {
  const profile = await apiUser(['student']);
  const input = await parseBody(req, body);
  const admin = createAdminClient();
  const { data: obj } = await admin.from('learning_objectives').select('id, code, grade').eq('id', input.objective_id).maybeSingle();
  if (!obj) throw new ApiError(404, 'Оқу мақсаты табылмады');
  const { data } = await admin
    .from('question_objectives')
    .select('questions(id, unit_id, body_json, question_type, marks, difficulty, status, question_topics(topic_id))')
    .eq('objective_id', obj.id)
    .limit(500);
  const pool = ((data ?? []) as unknown as { questions: (QuestionRow & { status: string }) | null }[])
    .map((r) => r.questions)
    .filter((q): q is QuestionRow & { status: string } => !!q && q.status === 'published');
  if (!pool.length) throw new ApiError(409, `${obj.code} мақсатына банкте есеп әлі жоқ.`);

  const seen = await seenQuestionIds(admin, [profile.id]);
  const fresh = pool.filter((q) => !seen.has(q.id));
  const base = fresh.length ? fresh : pool; // бәрі көрілген болса — қайталау
  const want = input.kind === 'diagnose' ? 2 : 4;
  const order = (q: QuestionRow) => (input.kind === 'harder' ? -q.difficulty : input.kind === 'diagnose' ? Math.abs(q.difficulty - 2) : q.difficulty);
  const picked = [...base].sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id)).slice(0, want);
  const byId = new Map<string, QuestionRow>(picked.map((q) => [q.id, q]));
  const drafts = await questionDrafts(admin, picked.map((q) => q.id), byId);
  const sessionId = await persistSession(admin, {
    owner_id: profile.id,
    exam_type: 'BZhB',
    mode: 'practice',
    grade: obj.grade as number,
    parameters_json: { objective_id: obj.id, objective_code: obj.code, kind: input.kind, repeated: !fresh.length },
    seed: newSeed(),
    time_limit_min: null,
  }, drafts);
  return json({ redirect: `/practice/${sessionId}`, repeated: !fresh.length }, 201);
});
