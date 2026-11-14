import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicBody, QuestionType, RubricLine } from './generator/types';

export interface Objective { id: string; code: string; text: string; unit_id: string | null; sort_order: number }
export interface Criterion { descriptor: string; marks: number }

/** Тақырыптың бекітілген оқу мақсаттары (КТП реті бойынша). */
export async function topicObjectives(db: SupabaseClient, topicId: string): Promise<Objective[]> {
  const { data } = await db
    .from('topic_objectives')
    .select('learning_objectives(id, code, text, unit_id, sort_order)')
    .eq('topic_id', topicId);
  return ((data ?? []) as unknown as { learning_objectives: Objective }[])
    .map((r) => r.learning_objectives)
    .filter(Boolean)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Банкте дескриптор жоқ болса — оқушыға түсінікті әдепкі бағалау өлшемдері (14.2).
 * Қосындысы есептің ұпайына тең.
 */
export function defaultCriteria(type: QuestionType, marks: number, rubric: RubricLine[] = []): Criterion[] {
  const fromRubric = rubric.filter((r) => r.descriptor && r.marks > 0);
  if (fromRubric.length && Math.abs(fromRubric.reduce((s, r) => s + r.marks, 0) - marks) < 1e-6) return fromRubric;
  const m = Math.max(1, Math.round(marks));
  if (type === 'single' || type === 'multi') {
    if (m === 1) return [{ descriptor: 'Дұрыс нұсқаны таңдайды және таңдауын бір-екі сөйлеммен негіздейді', marks: 1 }];
    return [
      { descriptor: 'Таңдауын есептеу немесе тексеру арқылы негіздейді', marks: m - 1 },
      { descriptor: 'Дұрыс нұсқаны таңдайды', marks: 1 },
    ];
  }
  if (m === 1) return [{ descriptor: 'Шешу жолын көрсетіп, дұрыс жауап алады', marks: 1 }];
  if (m === 2) return [
    { descriptor: 'Әдісті дұрыс таңдап, шешу қадамдарын жазады', marks: 1 },
    { descriptor: 'Дұрыс жауап алады және шартқа сәйкестігін тексереді', marks: 1 },
  ];
  return [
    { descriptor: 'Есептің моделін құрады немесе әдісті негіздеп таңдайды', marks: 1 },
    { descriptor: 'Шешу қадамдарын қатесіз орындайды', marks: m - 2 },
    { descriptor: 'Дұрыс жауап алады және шартқа сәйкестігін тексереді', marks: 1 },
  ];
}

export interface BankQuestion {
  id: string;
  question_type: QuestionType;
  body_json: PublicBody;
  marks: number;
  difficulty: number;
  topic_id: string | null;
}

/** Оқушыға (немесе сыныпқа) бұрын көрсетілген есептер: үй жұмысы + сессиялар. */
export async function seenQuestionIds(admin: SupabaseClient, studentIds: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  if (!studentIds.length) return seen;
  const [{ data: sess }, { data: hw }] = await Promise.all([
    admin.from('practice_sessions').select('practice_items(question_id)').in('owner_id', studentIds).limit(2000),
    admin.from('homework_attempts').select('homework_items(question_id)').in('student_id', studentIds).limit(5000),
  ]);
  for (const s of (sess ?? []) as unknown as { practice_items: { question_id: string | null }[] }[])
    for (const it of s.practice_items ?? []) if (it.question_id) seen.add(it.question_id);
  for (const a of (hw ?? []) as unknown as { homework_items: { question_id: string | null } | null }[])
    if (a.homework_items?.question_id) seen.add(a.homework_items.question_id);
  return seen;
}

/** Мақсат бойынша банктегі жарияланған есептер (кілтсіз). */
export async function objectiveQuestions(admin: SupabaseClient, objectiveId: string): Promise<BankQuestion[]> {
  const { data } = await admin
    .from('question_objectives')
    .select('questions(id, question_type, body_json, marks, difficulty, status, question_topics(topic_id))')
    .eq('objective_id', objectiveId)
    .limit(500);
  type Row = { questions: (Omit<BankQuestion, 'topic_id'> & { status: string; question_topics: { topic_id: string }[] }) | null };
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.questions)
    .filter((q): q is NonNullable<Row['questions']> => !!q && q.status === 'published')
    .map((q) => ({ id: q.id, question_type: q.question_type, body_json: q.body_json, marks: Number(q.marks), difficulty: q.difficulty, topic_id: q.question_topics?.[0]?.topic_id ?? null }));
}

/**
 * 14.1: әр мақсатқа әртүрлі қырынан тексеретін тапсырмалар — мүмкіндігінше әртүрлі күрделілік
 * (қолдану → негіздеу → өзгерген шарт) және әртүрлі жауап форматы. Бұрын көрілгендер соңына ысырылады.
 */
export function pickVaried(pool: BankQuestion[], n: number, exclude: Set<string>, seen: Set<string>): BankQuestion[] {
  const fresh = pool.filter((q) => !exclude.has(q.id));
  const score = (q: BankQuestion) => (seen.has(q.id) ? 10 : 0);
  const sorted = [...fresh].sort((a, b) => score(a) - score(b) || a.difficulty - b.difficulty || a.id.localeCompare(b.id));
  const out: BankQuestion[] = [];
  for (const d of [1, 2, 3]) {
    if (out.length >= n) break;
    const level = sorted.filter((x) => x.difficulty === d);
    // Жауап форматы әлі жоқ түрін бірінші аламыз
    const q = level.find((x) => !out.some((o) => o.question_type === x.question_type)) ?? level[0];
    if (q) out.push(q);
  }
  for (const q of sorted) if (out.length < n && !out.includes(q)) out.push(q);
  return out.sort((a, b) => a.difficulty - b.difficulty);
}

// ---------------------------------------------------------------------------
// ТЗ 15: меңгеру көрсеткіші
// ---------------------------------------------------------------------------
export interface Evidence {
  objective_id: string;
  topic_id: string | null;
  unit_id: string | null;
  source: 'homework' | 'session';
  source_id: string;
  question_id: string | null;
  earned: number;
  possible: number;
  difficulty: number;
  at: string | null;
}

export interface Stat { earned: number; possible: number; items: number; pct: number | null; last: string | null; prevPct: number | null }

/** Ұпайлар қосындысы / мүмкін ұпайлар қосындысы. Пайыздарды орташаламаймыз. */
export function aggregate(ev: Evidence[]): Stat {
  const earned = ev.reduce((s, e) => s + Number(e.earned), 0);
  const possible = ev.reduce((s, e) => s + Number(e.possible), 0);
  const sources = new Set(ev.map((e) => e.source_id));
  const sorted = [...ev].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  const last = sorted.at(-1)?.at ?? null;
  // Соңғы дерекке дейінгі көрсеткіш (өзгерісті көрсету үшін)
  const lastSrc = sorted.at(-1)?.source_id;
  const before = sorted.filter((e) => e.source_id !== lastSrc);
  const bp = before.reduce((s, e) => s + Number(e.possible), 0);
  const prevPct = bp > 0 && before.length ? Math.round((before.reduce((s, e) => s + Number(e.earned), 0) / bp) * 100) : null;
  return { earned: round2(earned), possible: round2(possible), items: sources.size, pct: possible > 0 ? Math.round((earned / possible) * 100) : null, last, prevPct };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Дерек жеткіліктілігі: бір есептен қорытынды жасамаймыз. */
export const MIN_ITEMS = 2;

export type Advice = { kind: 'practice' | 'harder' | 'diagnose' | 'none'; objective?: Objective; text: string; difficulty?: number };

/** Бір нақты келесі қадам (15 «Ұсынысты таңдау»). Тек тіркелген нәтижелерге сүйенеді. */
export function adviceFor(objectives: Objective[], stats: Map<string, Stat>): Advice {
  const withData = objectives.map((o) => ({ o, s: stats.get(o.id) })).filter((x) => x.s && x.s.items > 0);
  const weak = withData.filter((x) => x.s!.items >= MIN_ITEMS && (x.s!.pct ?? 0) < 60).sort((a, b) => (a.s!.pct ?? 0) - (b.s!.pct ?? 0))[0];
  if (weak) return { kind: 'practice', objective: weak.o, text: `${weak.o.code}: ${weak.s!.items} дербес есепте ${weak.s!.pct}%. Осы дағдыға бағытталған жаттығу орында.` };
  const thin = objectives.find((o) => (stats.get(o.id)?.items ?? 0) > 0 && (stats.get(o.id)?.items ?? 0) < MIN_ITEMS);
  if (thin) return { kind: 'diagnose', objective: thin, text: `${thin.code}: бір ғана есеп бағаланған — қорытындыға дерек аз. Қысқа тексеру есебін орында.` };
  const none = objectives.find((o) => !stats.get(o.id));
  if (none) return { kind: 'diagnose', objective: none, text: `${none.code} мақсаты әлі тексерілмеген. Қысқа тексеру орында.` };
  const strong = withData.filter((x) => x.s!.items >= MIN_ITEMS && (x.s!.pct ?? 0) >= 80).sort((a, b) => (b.s!.pct ?? 0) - (a.s!.pct ?? 0))[0];
  if (strong) return { kind: 'harder', objective: strong.o, difficulty: 3, text: `${strong.o.code}: ${strong.s!.items} есепте өз бетіңше ${strong.s!.pct}%. Енді күрделірек есепке өтіп көр.` };
  const mid = withData[0];
  if (mid) return { kind: 'practice', objective: mid.o, text: `${mid.o.code}: нәтижені бекіту үшін шарты өзгеше тағы бір-екі есеп шығар.` };
  return { kind: 'none', text: 'Дерек жеткіліксіз.' };
}
