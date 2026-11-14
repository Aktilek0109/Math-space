import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './api';
import type { Profile } from './auth';
import { createAdminClient } from './supabase/admin';
import { createClient } from './supabase/server';
import { gradeResponse, type ResponseValue } from './grading';
import type { AnswerKey, PublicBody, QuestionType } from './generator/types';
import { AI_DAILY_STOP, FALLBACK, PRIMARY, QuotaError, aiConfigured, aiUsageToday, callModel, parseJson } from './ai-check';
import { HW_MIME } from './homework';
import { defaultCriteria, objectiveQuestions, pickVaried, seenQuestionIds, type Criterion } from './objectives';

/**
 * ТЗ 14: мақсат бойынша үй жұмысы.
 *  first   — алғашқы дербес әрекет. «Кері байланыс алу» немесе «Тапсыру» басылғанда бекітіледі.
 *  revised — кері байланыстан кейінгі түзетілген нұсқа = «көмекпен орындады».
 *  Тексеру есебі — сол мақсатқа шарты өзгеше жеке есеп (homework_items.parent_item_id), оның first әрекеті дербес саналады.
 */

export interface ItemRow {
  id: string;
  assignment_id: string;
  parent_item_id: string | null;
  student_id: string | null;
  position: number;
  question_id: string | null;
  objective_id: string | null;
  topic_id: string | null;
  question_type: QuestionType;
  body_json: PublicBody;
  criteria_json: Criterion[];
  max_marks: number;
  difficulty: number;
}

export interface AttemptFile { path: string; name: string; mime: string; size: number }
export interface Feedback {
  source: 'ai' | 'rule';
  readable: boolean;
  unreadable_note?: string;
  done: string[];
  met: number[];
  next_step: string;
  correct: boolean | null;
  note?: string;
}

export interface AttemptRow {
  id: string;
  item_id: string;
  student_id: string;
  kind: 'first' | 'revised';
  answer_json: ResponseValue;
  files_json: AttemptFile[];
  submitted_at: string | null;
  feedback_json: Feedback | null;
  awarded_marks: number | null;
  auto_marks: number | null;
  marking_state: 'none' | 'auto' | 'pending' | 'manual';
  teacher_note: string | null;
  graded_at: string | null;
}

const ITEM_COLS = 'id, assignment_id, parent_item_id, student_id, position, question_id, objective_id, topic_id, question_type, body_json, criteria_json, max_marks, difficulty';
const ATT_COLS = 'id, item_id, student_id, kind, answer_json, files_json, submitted_at, feedback_json, awarded_marks, auto_marks, marking_state, teacher_note, graded_at';

/** Оқушыға тапсырма көрінетінін RLS арқылы тексеру. */
async function visibleAssignment(assignmentId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('assignments').select('id, grade, mode, status, due_at').eq('id', assignmentId).maybeSingle();
  if (!data || data.mode !== 'tasks') throw new ApiError(404, 'Тапсырма табылмады');
  return data as { id: string; grade: number; mode: string; status: string; due_at: string | null };
}

async function submissionLocked(admin: SupabaseClient, assignmentId: string, studentId: string) {
  const { data } = await admin.from('submissions').select('submitted_at, graded_at').eq('assignment_id', assignmentId).eq('student_id', studentId).maybeSingle();
  return !!data?.submitted_at;
}

async function loadItem(admin: SupabaseClient, assignmentId: string, itemId: string, studentId: string): Promise<ItemRow> {
  const { data } = await admin.from('homework_items').select(ITEM_COLS).eq('id', itemId).eq('assignment_id', assignmentId).maybeSingle();
  const item = data as ItemRow | null;
  if (!item || (item.student_id && item.student_id !== studentId)) throw new ApiError(404, 'Есеп табылмады');
  return item;
}

async function loadAttempt(admin: SupabaseClient, itemId: string, studentId: string, kind: 'first' | 'revised') {
  const { data } = await admin.from('homework_attempts').select(ATT_COLS).eq('item_id', itemId).eq('student_id', studentId).eq('kind', kind).maybeSingle();
  return data as AttemptRow | null;
}

const hasContent = (a: { answer_json?: ResponseValue; files_json?: AttemptFile[] } | null) =>
  !!a && (!!(a.answer_json?.value || a.answer_json?.choice || a.answer_json?.text?.trim()) || (a.files_json?.length ?? 0) > 0);

/** Автоматты тексерілетін бөлік (сан/таңдау) — алдын ала ұпай. Ашық шешімді мұғалім бағалайды. */
function autoMark(item: ItemRow, key: AnswerKey | null, answer: ResponseValue) {
  if (!key || !['single', 'numeric', 'short', 'multi'].includes(item.question_type)) return { auto: null, state: 'pending' as const };
  const has = answer.value || answer.choice || answer.choices?.length;
  if (!has) return { auto: null, state: 'pending' as const };
  const g = gradeResponse(item.question_type, key, answer, Number(item.max_marks));
  return { auto: g.awarded, state: 'auto' as const };
}

// ---------------------------------------------------------------------------
export async function saveAttempt(
  profile: Profile,
  assignmentId: string,
  input: { item_id: string; kind: 'first' | 'revised'; answer: ResponseValue; files?: AttemptFile[] },
) {
  const a = await visibleAssignment(assignmentId);
  const admin = createAdminClient();
  if (await submissionLocked(admin, assignmentId, profile.id)) throw new ApiError(409, 'Жұмыс тапсырылған, енді өзгертуге болмайды.');
  const item = await loadItem(admin, assignmentId, input.item_id, profile.id);
  const prefix = `${a.grade}/${assignmentId}/${profile.id}/items/${item.id}/`;
  const files = (input.files ?? []).slice(0, 6);
  if (files.some((f) => !f.path.startsWith(prefix) || !(f.mime in HW_MIME))) throw new ApiError(400, 'Файл жолы жарамсыз');

  const existing = await loadAttempt(admin, item.id, profile.id, input.kind);
  if (existing?.submitted_at) throw new ApiError(409, input.kind === 'first' ? 'Алғашқы нұсқа бекітілген. Енді түзетілген нұсқаны жаза аласың.' : 'Бұл нұсқа бекітілген.');
  if (input.kind === 'revised') {
    const first = await loadAttempt(admin, item.id, profile.id, 'first');
    if (!first?.feedback_json) throw new ApiError(409, 'Түзетілген нұсқа кері байланыстан кейін ашылады.');
  }
  // Өшірілген файлдарды қоймадан да алып тастау
  const removed = (existing?.files_json ?? []).filter((f) => !files.some((x) => x.path === f.path)).map((f) => f.path);
  if (removed.length) await admin.storage.from('homework').remove(removed);

  const row = { item_id: item.id, student_id: profile.id, kind: input.kind, answer_json: input.answer, files_json: files };
  const { error } = existing
    ? await admin.from('homework_attempts').update(row).eq('id', existing.id)
    : await admin.from('homework_attempts').insert(row);
  if (error) throw new ApiError(500, 'Сақтау қатесі');
  return { ok: true };
}

export async function prepareUpload(profile: Profile, assignmentId: string, itemId: string, files: { name: string; mime: string; size: number }[]) {
  const a = await visibleAssignment(assignmentId);
  const admin = createAdminClient();
  if (await submissionLocked(admin, assignmentId, profile.id)) throw new ApiError(409, 'Жұмыс тапсырылған.');
  await loadItem(admin, assignmentId, itemId, profile.id);
  const out: { path: string; token: string }[] = [];
  for (const f of files) {
    const path = `${a.grade}/${assignmentId}/${profile.id}/items/${itemId}/${randomUUID()}.${HW_MIME[f.mime]}`;
    const { data, error } = await admin.storage.from('homework').createSignedUploadUrl(path);
    if (error || !data) throw new ApiError(500, 'Жүктеу сілтемесі жасалмады');
    out.push({ path, token: data.token });
  }
  return { items: out };
}

/** Нұсқаны бекіту (алдын ала ұпаймен). */
async function lockAttempt(admin: SupabaseClient, item: ItemRow, att: AttemptRow) {
  const { data: key } = await admin.from('homework_item_keys').select('answer_json').eq('item_id', item.id).maybeSingle();
  const m = autoMark(item, (key?.answer_json ?? null) as AnswerKey | null, att.answer_json ?? {});
  const patch: Record<string, unknown> = { submitted_at: new Date().toISOString(), auto_marks: m.auto, marking_state: att.marking_state === 'manual' ? 'manual' : m.state };
  if (att.marking_state !== 'manual') patch.awarded_marks = m.auto; // ашық шешімде null — мұғалім қояды
  await admin.from('homework_attempts').update(patch).eq('id', att.id);
  return m;
}

export async function submitItem(profile: Profile, assignmentId: string, itemId: string, kind: 'first' | 'revised') {
  await visibleAssignment(assignmentId);
  const admin = createAdminClient();
  if (await submissionLocked(admin, assignmentId, profile.id)) throw new ApiError(409, 'Жұмыс тапсырылған.');
  const item = await loadItem(admin, assignmentId, itemId, profile.id);
  const att = await loadAttempt(admin, item.id, profile.id, kind);
  if (!hasContent(att)) throw new ApiError(400, 'Алдымен жауабыңды жаз немесе дәптер бетін жүкте.');
  if (att!.submitted_at) return { ok: true };
  await lockAttempt(admin, item, att!);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 14.3 Кері байланыс
// ---------------------------------------------------------------------------
const FEEDBACK_SYSTEM = `You are a supportive mathematics tutor at a Kazakhstan school (grade GRADE). Reply in Kazakh.
You receive: the problem, the assessment criteria (numbered descriptors), the teacher's CONFIDENTIAL reference solution,
and the student's work (typed text and/or photos of a notebook).
Rules:
- Compare the student's work with the descriptors. Accept any other mathematically valid method.
- NEVER reveal the full solution, the reference solution or the final answer. Give exactly ONE next-step hint:
  a concrete question or a check the student can do (e.g. "Бастапқы теңдеуге x = 0 қойып көр. Екі жақта не шықты?").
- Name what was done correctly (short phrases).
- If a needed line in a photo cannot be read, set readable=false and ask to retake the photo or type that line.
  Do NOT treat unreadable work as wrong.
- If the work is fully correct, set correct=true and suggest one thing to double-check.
Return ONLY one JSON object, no markdown:
{"readable":true,"unreadable_note":"","done":["..."],"met":[1,2],"next_step":"...","correct":false}`;

function ruleFeedback(item: ItemRow, key: AnswerKey | null, answer: ResponseValue, note?: string): Feedback {
  const m = autoMark(item, key, answer);
  if (m.state === 'auto' && m.auto !== null) {
    const ok = m.auto > 0;
    return {
      source: 'rule', readable: true, done: ok ? ['Жауап шартқа сәйкес'] : [], met: [],
      correct: ok,
      next_step: ok
        ? 'Жауабың дұрыс. Енді әр қадамның неге орындалғанын бір сөйлеммен жазып шық — бағалау өлшемдері шешу жолын да сұрайды.'
        : 'Жауабыңды бастапқы шартқа қойып тексер. Барлық шешімді таптың ба, шартқа сәйкес келмейтін (бөгде) шешім жоқ па?',
      note,
    };
  }
  return {
    source: 'rule', readable: true, done: [], met: [], correct: null,
    next_step: 'Бағалау өлшемдерін қайта оқы: әрқайсысы шешіміңде бар ма? Жоқ қадамын қосып, жауабыңды бастапқы шартқа қойып тексер.',
    note,
  };
}

export async function requestFeedback(profile: Profile, assignmentId: string, itemId: string) {
  const a = await visibleAssignment(assignmentId);
  const admin = createAdminClient();
  if (await submissionLocked(admin, assignmentId, profile.id)) throw new ApiError(409, 'Жұмыс тапсырылған.');
  const item = await loadItem(admin, assignmentId, itemId, profile.id);
  const first = await loadAttempt(admin, item.id, profile.id, 'first');
  const revised = await loadAttempt(admin, item.id, profile.id, 'revised');
  // Кері байланыс: алдымен алғашқы нұсқаға, кейін түзетілген нұсқаға бір рет
  let target: AttemptRow | null = first;
  if (first?.feedback_json) {
    if (!revised || revised.feedback_json) throw new ApiError(409, revised?.feedback_json ? 'Бұл есепке кері байланыс алынып болды.' : 'Алдымен түзетілген нұсқаны жаз.');
    target = revised;
  }
  if (!target || !hasContent(target)) throw new ApiError(400, 'Алдымен шешіміңді жаз немесе дәптер бетін жүкте.');
  // Алғашқы нұсқа кері байланыс сұралғанда бекітіледі (дербес әрекет сақталады); түзетілген нұсқаны әрі қарай өңдеуге болады
  if (target.kind === 'first' && !target.submitted_at) await lockAttempt(admin, item, target);

  const { data: keyRow } = await admin.from('homework_item_keys').select('answer_json, solution_json').eq('item_id', item.id).maybeSingle();
  const key = (keyRow?.answer_json ?? null) as AnswerKey | null;
  const solution = (keyRow?.solution_json as { text?: string } | null)?.text ?? '';
  const answer = target.answer_json ?? {};

  let fb: Feedback;
  if (!aiConfigured()) {
    fb = ruleFeedback(item, key, answer, 'ЖИ қосылмаған — қысқа автоматты нұсқау берілді.');
  } else if ((await aiUsageToday(admin)).neurons >= AI_DAILY_STOP) {
    fb = ruleFeedback(item, key, answer, 'Бүгінгі ЖИ лимиті бітті — қысқа автоматты нұсқау берілді.');
  } else {
    try {
      fb = await aiFeedback(admin, a.grade, item, solution, key, target);
    } catch (e) {
      fb = ruleFeedback(item, key, answer, e instanceof QuotaError ? 'Бүгінгі ЖИ лимиті бітті.' : 'ЖИ уақытша жауап бермеді — жұмысың сақталды, тапсыра аласың.');
    }
  }
  await admin.from('homework_attempts').update({ feedback_json: fb, feedback_at: new Date().toISOString() }).eq('id', target.id);
  return { feedback: fb, kind: target.kind };
}

async function aiFeedback(admin: SupabaseClient, grade: number, item: ItemRow, solution: string, key: AnswerKey | null, att: AttemptRow): Promise<Feedback> {
  const images: { type: 'image_url'; image_url: { url: string } }[] = [];
  for (const f of (att.files_json ?? []).filter((x) => ['image/jpeg', 'image/png', 'image/webp'].includes(x.mime)).slice(0, 3)) {
    const { data: blob } = await admin.storage.from('homework').download(f.path);
    if (!blob) continue;
    images.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}` } });
  }
  const crit = (item.criteria_json ?? []).map((c, i) => `${i + 1}. ${c.descriptor} — ${c.marks} ұпай`).join('\n');
  const ans = att.answer_json ?? {};
  const options = item.body_json.options?.map((o) => `${o.id}) ${o.text}`).join('; ');
  const task = [
    `Problem: ${item.body_json.text}`,
    options ? `Options: ${options}` : '',
    `Criteria (max ${Number(item.max_marks)}):\n${crit}`,
    `CONFIDENTIAL reference solution: ${solution || '(none — solve yourself)'}`,
    key ? `CONFIDENTIAL key: ${JSON.stringify(key)}` : '',
    att.kind === 'revised' ? 'This is the student\'s corrected version after an earlier hint.' : '',
    `Student final answer: ${ans.value ?? ans.choice ?? '(not given)'}`,
    `Student typed solution: ${ans.text?.trim() || '(none)'}`,
    images.length ? `Notebook photos: ${images.length}` : 'No photos.',
  ].filter(Boolean).join('\n');
  const messages = [
    { role: 'system', content: FEEDBACK_SYSTEM.replace('GRADE', String(grade)) },
    { role: 'user', content: images.length ? [{ type: 'text', text: task }, ...images] : task },
  ];
  let model = process.env.CF_AI_MODEL || PRIMARY;
  let out;
  try {
    out = await callModel(model, messages);
  } catch (e) {
    if (e instanceof QuotaError || model === FALLBACK) throw e;
    model = FALLBACK;
    out = await callModel(model, messages);
  }
  await admin.rpc('ai_usage_add', { p_neurons: out.neurons });
  let j = parseJson(out.text);
  if (!j && model !== FALLBACK) {
    out = await callModel(FALLBACK, messages);
    await admin.rpc('ai_usage_add', { p_neurons: out.neurons });
    j = parseJson(out.text);
  }
  if (!j || typeof j.next_step !== 'string') throw new Error('AI жауабы түсініксіз');
  const n = (item.criteria_json ?? []).length;
  return {
    source: 'ai',
    readable: j.readable !== false,
    unreadable_note: typeof j.unreadable_note === 'string' ? j.unreadable_note.slice(0, 300) : undefined,
    done: Array.isArray(j.done) ? j.done.filter((x): x is string => typeof x === 'string').slice(0, 5).map((x) => x.slice(0, 200)) : [],
    met: Array.isArray(j.met) ? j.met.map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= n) : [],
    next_step: String(j.next_step).slice(0, 500),
    correct: typeof j.correct === 'boolean' ? j.correct : null,
  };
}

// ---------------------------------------------------------------------------
// 14.4 Тексеру есебі: шарты өзгеше, сол мақсат
// ---------------------------------------------------------------------------
export async function createFollowup(profile: Profile, assignmentId: string, itemId: string) {
  await visibleAssignment(assignmentId);
  const admin = createAdminClient();
  if (await submissionLocked(admin, assignmentId, profile.id)) throw new ApiError(409, 'Жұмыс тапсырылған.');
  const item = await loadItem(admin, assignmentId, itemId, profile.id);
  if (item.parent_item_id) throw new ApiError(400, 'Тексеру есебіне қосымша есеп берілмейді.');
  const { data: exists } = await admin.from('homework_items').select('id').eq('parent_item_id', item.id).eq('student_id', profile.id).maybeSingle();
  if (exists) return { item_id: exists.id as string };
  const revised = await loadAttempt(admin, item.id, profile.id, 'revised');
  if (!revised?.submitted_at) throw new ApiError(409, 'Тексеру есебі түзетілген нұсқа бекітілгеннен кейін ашылады.');
  if (!item.objective_id) throw new ApiError(409, 'Бұл есеп оқу мақсатына байланбаған.');

  const pool = await objectiveQuestions(admin, item.objective_id);
  const seen = await seenQuestionIds(admin, [profile.id]);
  const { data: siblings } = await admin.from('homework_items').select('question_id').eq('assignment_id', assignmentId);
  const exclude = new Set<string>([...seen, ...((siblings ?? []).map((s) => s.question_id as string).filter(Boolean))]);
  // Ұқсас күрделілік, бірақ басқа есеп
  const candidates = pool.filter((q) => !exclude.has(q.id)).sort((x, y) => Math.abs(x.difficulty - item.difficulty) - Math.abs(y.difficulty - item.difficulty));
  const q = candidates[0] ?? pickVaried(pool, 1, new Set(item.question_id ? [item.question_id] : []), seen)[0];
  if (!q) throw new ApiError(409, 'Бұл мақсатқа банкте басқа есеп жоқ — мұғалімге хабарла.');
  const { data: key } = await admin.from('question_keys').select('answer_json, solution_json, rubric_json').eq('question_id', q.id).maybeSingle();

  const { data: ins, error } = await admin
    .from('homework_items')
    .insert({
      assignment_id: assignmentId,
      parent_item_id: item.id,
      student_id: profile.id,
      position: item.position,
      question_id: q.id,
      objective_id: item.objective_id,
      topic_id: q.topic_id ?? item.topic_id,
      question_type: q.question_type,
      body_json: q.body_json,
      criteria_json: defaultCriteria(q.question_type, q.marks, (key?.rubric_json ?? []) as never[]),
      max_marks: q.marks,
      difficulty: q.difficulty,
    })
    .select('id')
    .single();
  if (error) throw new ApiError(500, 'Тексеру есебін жасау қатесі');
  await admin.from('homework_item_keys').insert({ item_id: ins.id, answer_json: key?.answer_json ?? {}, solution_json: key?.solution_json ?? {} });
  return { item_id: ins.id as string };
}

/** Бүкіл жұмысты тапсыру: мазмұны бар бекітілмеген нұсқалар бекітіледі. */
export async function submitAll(profile: Profile, assignmentId: string) {
  await visibleAssignment(assignmentId);
  const admin = createAdminClient();
  if (await submissionLocked(admin, assignmentId, profile.id)) return { ok: true };
  const { data: items } = await admin.from('homework_items').select(ITEM_COLS).eq('assignment_id', assignmentId).or(`student_id.is.null,student_id.eq.${profile.id}`);
  const list = (items ?? []) as ItemRow[];
  const { data: atts } = await admin.from('homework_attempts').select(ATT_COLS).eq('student_id', profile.id).in('item_id', list.map((i) => i.id));
  const byItem = new Map<string, ItemRow>(list.map((i) => [i.id, i]));
  let any = false;
  for (const at of (atts ?? []) as AttemptRow[]) {
    if (hasContent(at)) any = true;
    if (!at.submitted_at && hasContent(at)) await lockAttempt(admin, byItem.get(at.item_id)!, at);
  }
  if (!any) throw new ApiError(400, 'Бірде-бір есепке жауап жоқ.');
  const now = new Date().toISOString();
  const { data: sub } = await admin.from('submissions').select('id').eq('assignment_id', assignmentId).eq('student_id', profile.id).maybeSingle();
  if (sub) await admin.from('submissions').update({ submitted_at: now }).eq('id', sub.id);
  else await admin.from('submissions').insert({ assignment_id: assignmentId, student_id: profile.id, submitted_at: now });
  return { ok: true };
}

/** Мұғалім бір әрекетті бағалайды (ресми ұпайды мұғалім бекітеді). */
export async function gradeAttempt(grader: Profile, attemptId: string, marks: number, note: string | null) {
  const admin = createAdminClient();
  const { data: att } = await admin.from('homework_attempts').select('id, item_id, student_id, homework_items(max_marks, assignment_id)').eq('id', attemptId).maybeSingle();
  if (!att) throw new ApiError(404, 'Жауап табылмады');
  // Мұғалім тек өз оқушысын бағалайды (RLS арқылы тексеру)
  const supabase = await createClient();
  const { data: visible } = await supabase.from('homework_attempts').select('id').eq('id', attemptId).maybeSingle();
  if (!visible) throw new ApiError(403, 'Бұл оқушының жұмысына рұқсат жоқ');
  const it = att.homework_items as unknown as { max_marks: number; assignment_id: string };
  if (marks < 0 || marks > Number(it.max_marks)) throw new ApiError(400, `Ұпай 0 мен ${Number(it.max_marks)} аралығында болуы керек`);
  await admin.from('homework_attempts').update({
    awarded_marks: marks, marking_state: 'manual', teacher_note: note, graded_by: grader.id, graded_at: new Date().toISOString(),
  }).eq('id', attemptId);
  // Жиынтық баға: ортақ есептердің алғашқы әрекеттері бойынша (тексеру есептері кірмейді)
  const { data: common } = await admin.from('homework_items').select('id, max_marks').eq('assignment_id', it.assignment_id).is('student_id', null);
  const ids = (common ?? []).map((c) => c.id as string);
  const { data: firsts } = await admin.from('homework_attempts').select('item_id, awarded_marks').eq('student_id', att.student_id).eq('kind', 'first').in('item_id', ids);
  const allGraded = ids.every((id) => (firsts ?? []).some((f) => f.item_id === id && f.awarded_marks !== null));
  if (allGraded) {
    const total = (firsts ?? []).reduce((s, f) => s + Number(f.awarded_marks ?? 0), 0);
    await admin.from('submissions').update({ score: total, graded_by: grader.id, graded_at: new Date().toISOString() })
      .eq('assignment_id', it.assignment_id).eq('student_id', att.student_id);
  }
  return { ok: true, total_ready: allGraded };
}
