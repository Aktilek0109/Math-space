import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './supabase/admin';
import { createClient } from './supabase/server';
import { ApiError, audit } from './api';
import type { Profile } from './auth';
import { selectByQuotas, splitEvenly, type Candidate, type Quota, type Shortage } from './assemble';
import { createRng, deriveSeed, newSeed, generateFromTemplate, getTemplate } from './generator';
import type { AnswerKey, PublicBody, QuestionType, RubricLine } from './generator/types';
import { gradeResponse, type ResponseValue } from './grading';
import type { MeskMockInput, PracticeGenerateInput } from './validation';

const GRACE_MS = 30_000; // желі кідірісіне шегініс

interface ItemDraft {
  question_id: string | null;
  template_id: string | null;
  template_seed: number | null;
  question_type: QuestionType;
  public_snapshot_json: PublicBody;
  max_marks: number;
  unit_id: string | null;
  topic_id: string | null;
  key: { answer: AnswerKey; solution: { text: string }; rubric: RubricLine[] };
}

export interface QuestionRow {
  id: string;
  unit_id: string | null;
  body_json: PublicBody;
  question_type: QuestionType;
  marks: number;
  difficulty: number;
  question_topics: { topic_id: string }[];
}

// ---------------------------------------------------------------------------
// Банктен үміткерлерді жүктеу (кілтсіз)
// ---------------------------------------------------------------------------
async function loadCandidates(
  admin: SupabaseClient,
  f: { grade: number; examType: 'BZhB' | 'TZhB' | 'MESK'; unitIds: string[]; topicIds?: string[]; component?: string },
) {
  let q = admin
    .from('questions')
    .select('id, unit_id, body_json, question_type, marks, difficulty, question_topics(topic_id)')
    .eq('status', 'published')
    .eq('grade', f.grade)
    .contains('exam_types', [f.examType])
    .limit(2000);
  if (f.unitIds.length) q = q.in('unit_id', f.unitIds);
  if (f.component) q = q.eq('component', f.component);
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as unknown as QuestionRow[];
  if (f.topicIds?.length) {
    const wanted = new Set(f.topicIds);
    rows = rows.filter((r) => r.question_topics.some((t) => wanted.has(t.topic_id)));
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    unitId: r.unit_id,
    topicIds: r.question_topics.map((t) => t.topic_id),
    marks: Number(r.marks),
    difficulty: r.difficulty,
  }));
  return { candidates, byId };
}

export async function questionDrafts(admin: SupabaseClient, ids: string[], byId: Map<string, QuestionRow>): Promise<ItemDraft[]> {
  if (ids.length === 0) return [];
  const { data: keys, error } = await admin
    .from('question_keys')
    .select('question_id, answer_json, solution_json, rubric_json')
    .in('question_id', ids);
  if (error) throw error;
  const keyMap = new Map<string, any>((keys ?? []).map((k: any) => [k.question_id as string, k]));
  return ids.map((id) => {
    const q = byId.get(id)!;
    const k = keyMap.get(id);
    return {
      question_id: id,
      template_id: null,
      template_seed: null,
      question_type: q.question_type,
      public_snapshot_json: q.body_json,
      max_marks: Number(q.marks),
      unit_id: q.unit_id,
      topic_id: q.question_topics[0]?.topic_id ?? null,
      key: {
        answer: (k?.answer_json ?? {}) as AnswerKey,
        solution: (k?.solution_json ?? { text: '' }) as { text: string },
        rubric: (k?.rubric_json ?? []) as RubricLine[],
      },
    };
  });
}

export async function persistSession(
  admin: SupabaseClient,
  meta: {
    owner_id: string;
    exam_type: 'BZhB' | 'TZhB' | 'MESK';
    mode: 'practice' | 'exam';
    grade: number;
    blueprint_id?: string | null;
    parameters_json: object;
    seed: number;
    time_limit_min?: number | null;
  },
  drafts: ItemDraft[],
) {
  const now = new Date();
  const deadline = meta.time_limit_min ? new Date(now.getTime() + meta.time_limit_min * 60_000) : null;
  const total = drafts.reduce((s, d) => s + d.max_marks, 0);

  const { data: session, error } = await admin
    .from('practice_sessions')
    .insert({
      ...meta,
      started_at: now.toISOString(),
      deadline_at: deadline?.toISOString() ?? null,
      total_marks: total,
    })
    .select('id')
    .single();
  if (error) throw error;

  try {
    const { data: items, error: itemsErr } = await admin
      .from('practice_items')
      .insert(
        drafts.map((d, i) => ({
          session_id: session.id,
          question_id: d.question_id,
          template_id: d.template_id,
          template_seed: d.template_seed,
          sequence_no: i + 1,
          question_type: d.question_type,
          public_snapshot_json: d.public_snapshot_json,
          max_marks: d.max_marks,
          unit_id: d.unit_id,
          topic_id: d.topic_id,
        })),
      )
      .select('id, sequence_no');
    if (itemsErr) throw itemsErr;

    const idBySeq = new Map(items!.map((it) => [it.sequence_no as number, it.id as string]));
    const { error: keysErr } = await admin.from('practice_item_keys').insert(
      drafts.map((d, i) => ({
        practice_item_id: idBySeq.get(i + 1),
        private_answer_json: d.key.answer,
        private_solution_json: d.key.solution,
        private_rubric_json: d.key.rubric,
      })),
    );
    if (keysErr) throw keysErr;
  } catch (e) {
    await admin.from('practice_sessions').delete().eq('id', session.id);
    throw e;
  }

  const templateIds = [...new Set(drafts.map((d) => d.template_id).filter(Boolean))] as string[];
  if (templateIds.length) await admin.rpc('increment_template_usage', { p_ids: templateIds });
  return session.id as string;
}

async function unitTitles(admin: SupabaseClient, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await admin.from('units').select('id, title').in('id', ids);
  return new Map((data ?? []).map((u) => [u.id as string, u.title as string]));
}

async function describeShortages(admin: SupabaseClient, shortages: Shortage[]) {
  const titles = await unitTitles(admin, shortages.map((s) => s.label));
  return shortages.map((s) => ({
    ...s,
    label: titles.get(s.label) ?? s.label,
    message:
      s.unit === 'count'
        ? `«${titles.get(s.label) ?? s.label}»: ${s.needed} есеп керек, қолжетімдісі ${s.available}`
        : `«${titles.get(s.label) ?? s.label}»: ${s.needed} ұпай керек, жинауға болатыны ${s.available}`,
  }));
}

// ---------------------------------------------------------------------------
// БЖБ/ТЖБ (GEN-01..04)
// ---------------------------------------------------------------------------
export async function buildPracticeSession(profile: Profile, input: PracticeGenerateInput) {
  const admin = createAdminClient();
  const seed = newSeed();
  const rng = createRng(seed);

  const { candidates, byId } = await loadCandidates(admin, {
    grade: input.grade,
    examType: input.exam_type,
    unitIds: input.unit_ids,
    topicIds: input.topic_ids,
  });
  const quotas = splitEvenly(input.unit_ids, input.count, 'count', input.difficulty);
  const selection = selectByQuotas(candidates, quotas, rng);
  const drafts = await questionDrafts(admin, selection.picked.map((p) => p.candidate.id), byId);

  // Жетіспегенін тексерілген үлгілерден толтыру
  let remaining: Shortage[] = [];
  if (selection.shortages.length && input.use_templates) {
    let tq = admin
      .from('generator_templates')
      .select('id, template_key, unit_id, topic_id, generation_code_version')
      .eq('status', 'published')
      .eq('grade', input.grade)
      .contains('exam_types', [input.exam_type]);
    if (input.unit_ids.length) tq = tq.in('unit_id', input.unit_ids);
    const { data: templates } = await tq;
    const usable = (templates ?? []).filter((t) => {
      const code = getTemplate(t.template_key as string);
      return code && code.version === t.generation_code_version;
    });

    for (const s of selection.shortages) {
      const forQuota = usable.filter((t) => quotas.find((q) => q.label === s.label)?.unitIds.length === 0 || t.unit_id === s.label);
      let missing = s.needed - s.available;
      for (let i = 0; missing > 0 && forQuota.length > 0; i++, missing--) {
        const t = forQuota[i % forQuota.length];
        const itemSeed = deriveSeed(seed, t.template_key as string, drafts.length);
        const g = generateFromTemplate(t.template_key as string, itemSeed);
        drafts.push({
          question_id: null,
          template_id: t.id as string,
          template_seed: itemSeed,
          question_type: g.questionType,
          public_snapshot_json: g.body,
          max_marks: g.marks,
          unit_id: (t.unit_id as string) ?? null,
          topic_id: (t.topic_id as string) ?? null,
          key: { answer: g.answer, solution: g.solution, rubric: g.rubric },
        });
      }
      if (missing > 0) remaining.push({ ...s, available: s.needed - missing });
    }
  } else {
    remaining = selection.shortages;
  }

  if (remaining.length) {
    throw new ApiError(409, 'Таңдалған шарттарға есеп жеткіліксіз', { shortages: await describeShortages(admin, remaining) });
  }

  const sessionId = await persistSession(
    admin,
    {
      owner_id: profile.id,
      exam_type: input.exam_type,
      mode: input.mode,
      grade: input.grade,
      parameters_json: input,
      seed,
      time_limit_min: input.time_limit_min ?? null,
    },
    drafts,
  );
  return { sessionId };
}

// ---------------------------------------------------------------------------
// МЭСК пробный (MESK-03..05)
// ---------------------------------------------------------------------------
export async function buildMeskMock(profile: Profile, input: MeskMockInput) {
  const admin = createAdminClient();
  let quotas: Quota[];
  let timeLimit = input.time_limit_min ?? null;
  let component = input.component;
  let unitIds = input.unit_ids;

  if (input.blueprint_id) {
    const { data: bp, error } = await admin
      .from('exam_blueprints')
      .select('*')
      .eq('id', input.blueprint_id)
      .eq('is_active', true)
      .single();
    if (error || !bp) throw new ApiError(404, 'Формат (blueprint) табылмады');
    const dist = (bp.distribution_json ?? []) as { unit_ids?: string[]; count?: number; marks?: number; difficulty?: number }[];
    quotas = dist.map((d, i) => ({
      label: d.unit_ids?.length === 1 ? d.unit_ids[0] : `Бөлік ${i + 1}`,
      unitIds: d.unit_ids ?? [],
      count: d.count,
      marks: d.marks,
      difficulty: d.difficulty,
    }));
    timeLimit = input.time_limit_min ?? bp.duration_min ?? null;
    component = bp.component ?? component;
    unitIds = (bp.allowed_unit_ids as string[]) ?? [];
  } else if (input.total_marks) {
    quotas = splitEvenly(unitIds, input.total_marks, 'marks', input.difficulty);
  } else {
    quotas = splitEvenly(unitIds, input.count!, 'count', input.difficulty);
  }

  const { candidates, byId } = await loadCandidates(admin, { grade: input.grade, examType: 'MESK', unitIds, component });

  let exclude = new Set<string>();
  if (input.no_repeat) {
    const { data: seen } = await admin
      .from('practice_items')
      .select('question_id, practice_sessions!inner(owner_id)')
      .eq('practice_sessions.owner_id', profile.id)
      .not('question_id', 'is', null);
    exclude = new Set((seen ?? []).map((r) => r.question_id as string));
  }

  // Қолжетімділікті санау (MESK-04: мүмкін конфигурацияны ғана ұсыну)
  const pool = candidates.filter((c) => !input.no_repeat || !exclude.has(c.id));
  const titles = await unitTitles(admin, [...new Set(pool.map((c) => c.unitId).filter(Boolean))] as string[]);
  const availability = [...titles.entries()].map(([id, title]) => {
    const inUnit = pool.filter((c) => c.unitId === id && (!input.difficulty || c.difficulty === input.difficulty));
    return { unit_id: id, title, count: inUnit.length, marks: inUnit.reduce((s, c) => s + c.marks, 0) };
  });

  const seed = newSeed();
  const selection = selectByQuotas(candidates, quotas, createRng(seed), { excludeIds: exclude, strictExclude: input.no_repeat });

  if (input.preview) {
    return {
      preview: true as const,
      availability,
      total_available: pool.length,
      shortages: await describeShortages(admin, selection.shortages),
    };
  }
  if (selection.shortages.length) {
    throw new ApiError(409, 'Пробный толық құрастырылмады', {
      shortages: await describeShortages(admin, selection.shortages),
      availability,
    });
  }

  const drafts = await questionDrafts(admin, selection.picked.map((p) => p.candidate.id), byId);
  const sessionId = await persistSession(
    admin,
    {
      owner_id: profile.id,
      exam_type: 'MESK',
      mode: input.mode,
      grade: input.grade,
      blueprint_id: input.blueprint_id ?? null,
      parameters_json: { ...input, component },
      seed,
      time_limit_min: timeLimit,
    },
    drafts,
  );
  return { preview: false as const, sessionId };
}

// ---------------------------------------------------------------------------
// Сессияны оқу (кілтсіз), жауап сақтау, ашу, тапсыру
// ---------------------------------------------------------------------------
export interface SessionRow {
  id: string;
  owner_id: string;
  exam_type: 'BZhB' | 'TZhB' | 'MESK';
  mode: 'practice' | 'exam';
  grade: number;
  status: 'in_progress' | 'submitting' | 'submitted' | 'graded';
  started_at: string;
  deadline_at: string | null;
  submitted_at: string | null;
  total_marks: number;
}

/** RLS арқылы қолжетімділікті тексеріп сессияны алу (иесі не рұқсаты бар мұғалім). */
export async function getVisibleSession(sessionId: string): Promise<SessionRow> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('practice_sessions')
    .select('id, owner_id, exam_type, mode, grade, status, started_at, deadline_at, submitted_at, total_marks')
    .eq('id', sessionId)
    .maybeSingle();
  if (!data) throw new ApiError(404, 'Сынақ табылмады');
  return data as SessionRow;
}

const isExpired = (s: Pick<SessionRow, 'deadline_at'>, graceMs = 0) =>
  !!s.deadline_at && Date.now() > new Date(s.deadline_at).getTime() + graceMs;

/** Оқушыға арналған көрініс: шарттар + өз жауаптары. Кілттер тек аяқталғаннан кейін. */
export async function loadSessionView(sessionId: string, profile: Profile) {
  let session = await getVisibleSession(sessionId);

  // Мерзімі өтсе — автоматты тапсыру (MESK-05, 6-бөлім 6-қадам)
  if (session.status === 'in_progress' && isExpired(session, GRACE_MS)) {
    await finalizeSession(session.id, null);
    session = await getVisibleSession(sessionId);
  }

  const supabase = await createClient();
  const { data: items } = await supabase
    .from('practice_items')
    .select('id, sequence_no, question_type, public_snapshot_json, max_marks, unit_id, topic_id')
    .eq('session_id', sessionId)
    .order('sequence_no');
  const { data: responses } = await supabase
    .from('responses')
    .select('id, session_item_id, response_json, revealed, awarded_marks, marking_state')
    .in('session_item_id', (items ?? []).map((i) => i.id as string));

  const respByItem = new Map<string, any>((responses ?? []).map((r: any) => [r.session_item_id as string, r]));
  const finished = session.status === 'submitted' || session.status === 'graded';

  // Кілттер: тапсырылған сессияда барлығы; жаттығуда — тек ашылған тапсырмалар
  const revealIds = (items ?? [])
    .filter((it) => finished || respByItem.get(it.id as string)?.revealed)
    .map((it) => it.id as string);
  let keys = new Map<string, { answer: AnswerKey; solution: { text: string }; rubric: RubricLine[] }>();
  if (revealIds.length) {
    const { data: k } = await createAdminClient()
      .from('practice_item_keys')
      .select('practice_item_id, private_answer_json, private_solution_json, private_rubric_json')
      .in('practice_item_id', revealIds);
    keys = new Map(
      (k ?? []).map((row) => [
        row.practice_item_id as string,
        {
          answer: row.private_answer_json as AnswerKey,
          solution: row.private_solution_json as { text: string },
          rubric: row.private_rubric_json as RubricLine[],
        },
      ]),
    );
  }

  let result = null;
  if (finished) {
    const { data } = await supabase.from('results').select('*').eq('session_id', sessionId).maybeSingle();
    result = data;
  }

  return {
    session,
    isOwner: session.owner_id === profile.id,
    finished,
    result,
    items: (items ?? []).map((it) => {
      const r = respByItem.get(it.id as string);
      return {
        id: it.id as string,
        response_id: (r?.id as string | undefined) ?? null,
        sequence_no: it.sequence_no as number,
        question_type: it.question_type as QuestionType,
        body: it.public_snapshot_json as PublicBody,
        max_marks: Number(it.max_marks),
        response: (r?.response_json ?? null) as ResponseValue | null,
        revealed: !!r?.revealed,
        awarded_marks: r?.awarded_marks == null ? null : Number(r.awarded_marks),
        marking_state: (r?.marking_state as string | null) ?? null,
        key: keys.get(it.id as string) ?? null,
      };
    }),
  };
}

async function ownedOpenSession(sessionId: string, profile: Profile) {
  const session = await getVisibleSession(sessionId);
  if (session.owner_id !== profile.id) throw new ApiError(403, 'Бұл сынақ сіздікі емес');
  if (session.status !== 'in_progress') throw new ApiError(409, 'Сынақ аяқталған');
  if (isExpired(session, GRACE_MS)) {
    await finalizeSession(session.id, null);
    throw new ApiError(409, 'Уақыт бітті, сынақ автоматты тапсырылды');
  }
  return session;
}

export async function saveResponses(sessionId: string, profile: Profile, rows: { item_id: string; response: ResponseValue }[]) {
  await ownedOpenSession(sessionId, profile);
  const admin = createAdminClient();
  const ids = rows.map((r) => r.item_id);
  const [{ data: items }, { data: existing }] = await Promise.all([
    admin.from('practice_items').select('id').eq('session_id', sessionId).in('id', ids),
    admin.from('responses').select('session_item_id, revealed').in('session_item_id', ids),
  ]);
  const valid = new Set((items ?? []).map((i) => i.id as string));
  const locked = new Set<string>((existing ?? []).filter((r: any) => r.revealed).map((r: any) => r.session_item_id as string));
  const toSave = rows.filter((r) => valid.has(r.item_id) && !locked.has(r.item_id));
  if (toSave.length !== rows.length && toSave.length === 0) throw new ApiError(400, 'Тапсырмалар жарамсыз не құлыпталған');
  if (toSave.length) {
    const { error } = await admin.from('responses').upsert(
      toSave.map((r) => ({ session_item_id: r.item_id, user_id: profile.id, response_json: r.response })),
      { onConflict: 'session_item_id' },
    );
    if (error) throw error;
  }
  return { saved: toSave.length, skipped: rows.length - toSave.length };
}

/** Жаттығу режимі: жауап берілгеннен кейін бір тапсырманың кілтін ашу (MESK-05). */
export async function revealItem(sessionId: string, itemId: string, profile: Profile) {
  const session = await ownedOpenSession(sessionId, profile);
  if (session.mode !== 'practice') throw new ApiError(403, 'Емтихан режимінде жауап тапсырғаннан кейін ашылады');
  const admin = createAdminClient();
  const [{ data: item }, { data: resp }, { data: key }] = await Promise.all([
    admin.from('practice_items').select('id, question_type, max_marks').eq('id', itemId).eq('session_id', sessionId).single(),
    admin.from('responses').select('id, response_json, revealed').eq('session_item_id', itemId).maybeSingle(),
    admin.from('practice_item_keys').select('*').eq('practice_item_id', itemId).single(),
  ]);
  if (!item || !key) throw new ApiError(404, 'Тапсырма табылмады');
  if (!resp) throw new ApiError(400, 'Алдымен жауабыңызды сақтаңыз');

  const answer = key.private_answer_json as AnswerKey;
  const g = gradeResponse(item.question_type as QuestionType, answer, resp.response_json as ResponseValue, Number(item.max_marks));
  await admin
    .from('responses')
    .update({ revealed: true, awarded_marks: g.awarded, marking_state: g.state === 'pending' ? 'self' : g.state })
    .eq('id', resp.id);

  return {
    correct: g.correct,
    awarded: g.awarded,
    answer,
    solution: key.private_solution_json,
    rubric: key.private_rubric_json,
  };
}

/**
 * Тапсыру — idempotent (AC-09): status in_progress → submitting атомарлы түрде
 * «ұсталады»; results.session_id UNIQUE қос бағалауға жол бермейді.
 */
export async function finalizeSession(sessionId: string, actorId: string | null) {
  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from('practice_sessions')
    .update({ status: 'submitting' })
    .eq('id', sessionId)
    .eq('status', 'in_progress')
    .select('id, owner_id, deadline_at')
    .maybeSingle();

  if (!claimed) {
    const { data: existing } = await admin.from('results').select('*').eq('session_id', sessionId).maybeSingle();
    if (existing) return { result: existing, alreadySubmitted: true };
    throw new ApiError(409, 'Сынақ тапсырылып жатыр, бір сәттен кейін жаңартыңыз');
  }

  try {
    const [{ data: items }, { data: keys }, { data: responses }] = await Promise.all([
      admin.from('practice_items').select('id, question_type, max_marks, unit_id, topic_id').eq('session_id', sessionId),
      admin
        .from('practice_item_keys')
        .select('practice_item_id, private_answer_json, practice_items!inner(session_id)')
        .eq('practice_items.session_id', sessionId),
      admin
        .from('responses')
        .select('id, session_item_id, response_json, revealed, awarded_marks, marking_state, practice_items!inner(session_id)')
        .eq('practice_items.session_id', sessionId),
    ]);
    const keyMap = new Map<string, AnswerKey>((keys ?? []).map((k: any) => [k.practice_item_id as string, k.private_answer_json as AnswerKey]));
    const respMap = new Map<string, any>((responses ?? []).map((r: any) => [r.session_item_id as string, r]));

    let earned = 0;
    let possible = 0;
    let pending = false;
    const byUnit = new Map<string, { earned: number; possible: number }>();
    const wrongTopics = new Set<string>();
    const itemFeedback: { item_id: string; correct: boolean | null; awarded: number | null; max: number }[] = [];
    const now = new Date().toISOString();
    const upserts: object[] = [];

    for (const it of items ?? []) {
      const max = Number(it.max_marks);
      const r = respMap.get(it.id as string);
      const g = gradeResponse(it.question_type as QuestionType, keyMap.get(it.id as string) ?? {}, r?.response_json as ResponseValue, max);
      // Бос ашық жауап → 0, тексеруді күтпейді
      const emptyOpen = g.state === 'pending' && !(r?.response_json as ResponseValue | undefined)?.text && !(r?.response_json as ResponseValue | undefined)?.parts;
      const awarded = emptyOpen ? 0 : g.awarded;
      const state = emptyOpen ? 'auto' : g.state;
      if (state === 'pending') pending = true;

      possible += max;
      earned += awarded ?? 0;
      const u = byUnit.get((it.unit_id as string) ?? '—') ?? { earned: 0, possible: 0 };
      u.earned += awarded ?? 0;
      u.possible += max;
      byUnit.set((it.unit_id as string) ?? '—', u);
      if (g.correct === false && it.topic_id) wrongTopics.add(it.topic_id as string);
      itemFeedback.push({ item_id: it.id as string, correct: emptyOpen ? false : g.correct, awarded, max });

      upserts.push({
        session_item_id: it.id,
        user_id: claimed.owner_id,
        response_json: r?.response_json ?? {},
        revealed: r?.revealed ?? false,
        awarded_marks: awarded,
        marking_state: state,
        submitted_at: now,
      });
    }

    if (upserts.length) {
      const { error } = await admin.from('responses').upsert(upserts, { onConflict: 'session_item_id' });
      if (error) throw error;
    }

    const titles = await unitTitles(admin, [...byUnit.keys()].filter((k) => k !== '—'));
    const percent = possible > 0 ? Math.round((earned / possible) * 10000) / 100 : 0;
    const { data: result, error: resErr } = await admin
      .from('results')
      .upsert(
        {
          session_id: sessionId,
          user_id: claimed.owner_id,
          marks_earned: earned,
          marks_possible: possible,
          percent,
          pending_manual: pending,
          feedback_json: {
            by_unit: [...byUnit.entries()].map(([id, v]) => ({ unit_id: id, title: titles.get(id) ?? 'Бөлімсіз', ...v })),
            wrong_topic_ids: [...wrongTopics],
            items: itemFeedback,
          },
        },
        { onConflict: 'session_id', ignoreDuplicates: true },
      )
      .select('*')
      .maybeSingle();
    if (resErr) throw resErr;

    await admin
      .from('practice_sessions')
      .update({ status: pending ? 'submitted' : 'graded', submitted_at: now })
      .eq('id', sessionId);
    await audit(actorId, actorId ? 'session.submit' : 'session.auto_submit', 'practice_session', sessionId, { earned, possible });

    return { result, alreadySubmitted: false };
  } catch (e) {
    // Қате болса, қайта тапсыруға мүмкіндік беру
    await admin.from('practice_sessions').update({ status: 'in_progress' }).eq('id', sessionId).eq('status', 'submitting');
    throw e;
  }
}

/** Мұғалім ашық жауапты бағалайды. */
export async function gradeManually(responseId: string, marks: number, grader: Profile) {
  const admin = createAdminClient();
  const { data: resp } = await admin
    .from('responses')
    .select('id, user_id, session_item_id, practice_items!inner(max_marks, session_id)')
    .eq('id', responseId)
    .single();
  if (!resp) throw new ApiError(404, 'Жауап табылмады');
  const item = resp.practice_items as unknown as { max_marks: number; session_id: string };
  if (marks < 0 || marks > Number(item.max_marks)) throw new ApiError(400, 'Ұпай шектен тыс');

  // Мұғалімнің осы оқушыны көру құқығын RLS арқылы тексеру
  const supabase = await createClient();
  const { data: visible } = await supabase.from('profiles').select('id').eq('id', resp.user_id).maybeSingle();
  if (!visible) throw new ApiError(403, 'Бұл оқушыға рұқсат жоқ');

  await admin.from('responses').update({ awarded_marks: marks, marking_state: 'manual' }).eq('id', responseId);

  // Нәтижені қайта есептеу
  const { data: all } = await admin
    .from('responses')
    .select('awarded_marks, marking_state, practice_items!inner(session_id)')
    .eq('practice_items.session_id', item.session_id);
  const earned = (all ?? []).reduce((s, r) => s + Number(r.awarded_marks ?? 0), 0);
  const pending = (all ?? []).some((r) => r.marking_state === 'pending');
  const { data: res } = await admin.from('results').select('marks_possible').eq('session_id', item.session_id).single();
  const possible = Number(res?.marks_possible ?? 0);
  await admin
    .from('results')
    .update({ marks_earned: earned, pending_manual: pending, percent: possible ? Math.round((earned / possible) * 10000) / 100 : 0 })
    .eq('session_id', item.session_id);
  if (!pending) await admin.from('practice_sessions').update({ status: 'graded' }).eq('id', item.session_id);
  await audit(grader.id, 'response.manual_grade', 'response', responseId, { marks });
}
