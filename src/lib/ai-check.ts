import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Үй жұмысының фотосын Cloudflare Workers AI (тегін күндік лимит) арқылы алдын ала тексеру.
 * Нәтиже тек мұғалімге көрінеді (submission_ai, RLS: staff). Бағаны мұғалім растайды.
 *
 * Тегін болып қалу шарты: Cloudflare аккаунты Workers FREE жоспарында. Онда лимиттен асқанда
 * сұраныс қатемен тоқтайды, ақы алынбайды. Біз өзіміз де 9 500 нейроннан кейін тоқтаймыз.
 */

export const AI_DAILY_FREE = 10_000;
const AI_DAILY_STOP = 9_500;
const MAX_IMAGES = 4;

const PRIMARY = '@cf/google/gemma-4-26b-a4b-it';
const FALLBACK = '@cf/meta/llama-4-scout-17b-16e-instruct';
/** нейрон / 1 млн токен: [кіріс, шығыс] — developers.cloudflare.com/workers-ai/platform/pricing */
const RATES: Record<string, [number, number]> = {
  [PRIMARY]: [9091, 27273],
  [FALLBACK]: [24545, 77273],
};

export const aiConfigured = () => !!(process.env.CF_ACCOUNT_ID && process.env.CF_AI_TOKEN);

export async function aiUsageToday(admin: SupabaseClient) {
  const day = new Date().toISOString().slice(0, 10);
  const { data } = await admin.from('ai_usage').select('neurons, calls').eq('day', day).maybeSingle();
  return { neurons: (data?.neurons as number) ?? 0, calls: (data?.calls as number) ?? 0 };
}

type Status = 'pending' | 'done' | 'error' | 'quota' | 'skipped';

async function save(admin: SupabaseClient, submissionId: string, row: Record<string, unknown> & { status: Status }) {
  await admin.from('submission_ai').upsert({ submission_id: submissionId, updated_at: new Date().toISOString(), ...row }, { onConflict: 'submission_id' });
}

const SYSTEM = `You are a careful math teacher's assistant in a Kazakhstan school (grades 7-12).
You receive photos of a student's handwritten homework (Kazakh or Russian, math notation) and the teacher's answer key.
Tasks:
1. Read the handwriting. Identify each problem number and the student's FINAL answer.
2. Compare each final answer with the key (equivalent forms count as correct: 0.5 = 1/2, x=3 = 3).
   If there is no key, solve the problem yourself to judge.
3. Note if a solution is missing or only the answer is written.
4. If the photo is unreadable or not homework, say so and give score null.
Reply with ONLY one JSON object, no markdown:
{"items":[{"n":"1","student":"...","correct":true,"note":"short note in Kazakh"}],
 "score": <number from 0 to MAX, proportional to correct items, or null>,
 "feedback": "1-2 short sentences in Kazakh addressed to the student",
 "readable": true}`;

function parseJson(text: string): Record<string, unknown> | null {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}

class QuotaError extends Error {}

async function callModel(model: string, messages: unknown[]) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 900, temperature: 0.1 }),
  });
  const raw = await res.text();
  if (!res.ok) {
    if (res.status === 429 || /allocation|quota|neurons|3036/i.test(raw)) throw new QuotaError(raw.slice(0, 300));
    throw new Error(`HTTP ${res.status}: ${raw.slice(0, 300)}`);
  }
  const data = JSON.parse(raw) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = data.choices?.[0]?.message?.content ?? '';
  const inTok = data.usage?.prompt_tokens ?? 3000;
  const outTok = data.usage?.completion_tokens ?? Math.ceil(text.length / 3);
  const [ri, ro] = RATES[model] ?? RATES[FALLBACK];
  const neurons = Math.ceil((inTok * ri + outTok * ro) / 1_000_000);
  return { text, neurons };
}

/** Бір жұмысты тексеру. Ешқашан лақтырмайды — нәтиже submission_ai-ға жазылады. */
export async function checkSubmission(admin: SupabaseClient, submissionId: string): Promise<Status> {
  if (!aiConfigured()) return 'pending';
  try {
    const usage = await aiUsageToday(admin);
    if (usage.neurons >= AI_DAILY_STOP) {
      await save(admin, submissionId, { status: 'quota', error: 'Бүгінгі тегін лимит бітті — ертең тексеріледі' });
      return 'quota';
    }

    const { data: sub } = await admin
      .from('submissions')
      .select('id, assignment_id, comment, graded_at, submission_files(storage_path, mime_type, position)')
      .eq('id', submissionId)
      .maybeSingle();
    if (!sub) return 'error';
    const [{ data: a }, { data: key }] = await Promise.all([
      admin.from('assignments').select('title, description, max_score').eq('id', sub.assignment_id).maybeSingle(),
      admin.from('assignment_keys').select('answer_text').eq('assignment_id', sub.assignment_id).maybeSingle(),
    ]);
    if (!a) return 'error';

    const files = ((sub.submission_files ?? []) as { storage_path: string; mime_type: string; position: number }[])
      .filter((f) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.mime_type))
      .sort((x, y) => x.position - y.position)
      .slice(0, MAX_IMAGES);
    if (!files.length) {
      await save(admin, submissionId, { status: 'skipped', error: 'Тексеруге жарамды сурет жоқ (PDF/HEIC — қолмен тексеріңіз)' });
      return 'skipped';
    }

    const images: { type: 'image_url'; image_url: { url: string } }[] = [];
    for (const f of files) {
      const { data: blob } = await admin.storage.from('homework').download(f.storage_path);
      if (!blob) continue;
      const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
      images.push({ type: 'image_url', image_url: { url: `data:${f.mime_type};base64,${b64}` } });
    }
    if (!images.length) {
      await save(admin, submissionId, { status: 'error', error: 'Суреттер оқылмады' });
      return 'error';
    }

    const max = Number(a.max_score);
    const task = [
      `Assignment: ${a.title}`,
      a.description ? `Description: ${a.description}` : '',
      `MAX score: ${max}`,
      key?.answer_text ? `Answer key:\n${key.answer_text}` : 'Answer key: (none — solve yourself)',
      `There are ${images.length} photo page(s), in order.`,
    ].filter(Boolean).join('\n');
    const messages = [
      { role: 'system', content: SYSTEM.replace('MAX', String(max)) },
      { role: 'user', content: [{ type: 'text', text: task }, ...images] },
    ];

    await save(admin, submissionId, { status: 'pending', error: null });
    let model = process.env.CF_AI_MODEL || PRIMARY;
    let out: { text: string; neurons: number };
    try {
      out = await callModel(model, messages);
    } catch (e) {
      if (e instanceof QuotaError || model === FALLBACK) throw e;
      model = FALLBACK; // негізгі модель қолжетімсіз болса
      out = await callModel(model, messages);
    }
    await admin.rpc('ai_usage_add', { p_neurons: out.neurons });

    const j = parseJson(out.text);
    if (!j) {
      await save(admin, submissionId, { status: 'error', model, neurons: out.neurons, error: 'AI жауабы түсініксіз', details: { raw: out.text.slice(0, 2000) } });
      return 'error';
    }
    let score = typeof j.score === 'number' && Number.isFinite(j.score) ? Math.max(0, Math.min(max, j.score)) : null;
    if (score !== null) score = Math.round(score * 2) / 2;
    await save(admin, submissionId, {
      status: 'done',
      score,
      feedback: typeof j.feedback === 'string' ? j.feedback.slice(0, 1000) : '',
      details: { items: Array.isArray(j.items) ? j.items.slice(0, 40) : [], readable: j.readable !== false },
      model,
      neurons: out.neurons,
      error: null,
    });
    return 'done';
  } catch (e) {
    if (e instanceof QuotaError) {
      await save(admin, submissionId, { status: 'quota', error: 'Бүгінгі тегін лимит бітті — ертең тексеріледі' });
      return 'quota';
    }
    await save(admin, submissionId, { status: 'error', error: String((e as Error)?.message ?? e).slice(0, 500) });
    return 'error';
  }
}
