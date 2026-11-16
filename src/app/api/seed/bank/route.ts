import { createHash, randomUUID } from 'node:crypto';
import { handler, json, ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import bzhbTopics from '@/data/bzhb-topics-2026-q2.json';
import tzhbV2 from '@/data/tzhb-2026-q2-v2.json';

/**
 * Дайын есептер жинағын банкке бір рет жүктеу: GET /api/seed/bank?set=<жинақ>&token=<бір реттік токен>.
 * Қорғаныс — токеннің sha256 хэші seed_tokens кестесінде purpose = 'seed:<жинақ>' болып тұруы керек
 * (кестені тек service role оқиды), қолданылған соң жабылады. Қайта жүктегенде бар есептер өткізіліп жіберіледі.
 */
interface Row {
  grade: number; unit: string; topic: string; obj: string; difficulty: number; marks: number; type: string;
  body: { text: string } & Record<string, unknown>; answer: Record<string, unknown>; solution: Record<string, unknown>;
  exam_types?: string[]; slot?: string | null;
  /** Бірнеше оқу мақсаты (код, салмақ) — болса, obj орнына қолданылады */
  objs?: [string, number][];
}

const SETS: Record<string, { rows: unknown; source: string }> = {
  'bzhb-topics-2026-q2': { rows: bzhbTopics, source: 'Claude, БЖБ тақырыптар 2026-11-16' },
  'tzhb-2026-q2-v2': { rows: tzhbV2, source: 'Claude, ТЖБ 2026-11-16 v2' },
};

const SUBJECT = '00000000-0000-0000-0000-000000000001';
const CHUNK = 200;

export const maxDuration = 60;

export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const set = SETS[url.searchParams.get('set') ?? ''];
  const token = url.searchParams.get('token') ?? '';
  if (!set || token.length < 32) throw new ApiError(404, 'Табылмады');
  const hash = createHash('sha256').update(token).digest('hex');
  const admin = createAdminClient();
  const { data: tok } = await admin
    .from('seed_tokens').select('token_hash, used_at')
    .eq('token_hash', hash).eq('purpose', `seed:${url.searchParams.get('set')}`).maybeSingle();
  if (!tok || tok.used_at) throw new ApiError(404, 'Табылмады');
  await admin.from('seed_tokens').update({ used_at: new Date().toISOString() }).eq('token_hash', hash);

  const rows = set.rows as Row[];
  const { data: objs, error: oe } = await admin.from('learning_objectives').select('id, code, grade');
  if (oe) throw oe;
  const objId = new Map((objs ?? []).map((o) => [`${o.grade}:${o.code}`, o.id as string]));

  // Бұрын осы жинақтан жүктелгендер (мәтіні бойынша) — қайталамау үшін
  const seen = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data: ex, error } = await admin.from('questions').select('body_json').eq('source', set.source).range(from, from + 999);
    if (error) throw error;
    for (const e of ex ?? []) seen.add((e.body_json as { text?: string })?.text ?? '');
    if (!ex || ex.length < 1000) break;
  }

  const fresh = rows.filter((r) => !seen.has(r.body.text));
  let missingObj = 0;
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const part = fresh.slice(i, i + CHUNK).map((r) => ({ r, id: randomUUID() }));
    const q = await admin.from('questions').insert(part.map(({ r, id }) => ({
      id, subject_id: SUBJECT, grade: r.grade, unit_id: r.unit, body_json: r.body, question_type: r.type, marks: r.marks,
      difficulty: r.difficulty, exam_types: r.exam_types ?? ['TZhB'], component: r.slot ?? null, status: 'published', source_kind: 'authored',
      source: set.source,
    })));
    if (q.error) throw q.error;
    const k = await admin.from('question_keys').insert(part.map(({ r, id }) => ({ question_id: id, answer_json: r.answer, solution_json: r.solution })));
    if (k.error) throw k.error;
    const t = await admin.from('question_topics').insert(part.map(({ r, id }) => ({ question_id: id, topic_id: r.topic })));
    if (t.error) throw t.error;
    const links = part.flatMap(({ r, id }) => (r.objs ?? [[r.obj, 1] as [string, number]]).flatMap(([code, weight]) => {
      const oid = objId.get(`${r.grade}:${code}`);
      if (!oid) { missingObj++; return []; }
      return [{ question_id: id, objective_id: oid, weight }];
    }));
    if (links.length) {
      const o = await admin.from('question_objectives').insert(links);
      if (o.error) throw o.error;
    }
  }
  return json({ inserted: fresh.length, skipped: rows.length - fresh.length, total: rows.length, missingObj });
});
