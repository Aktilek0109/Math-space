import { z } from 'zod';
import { ApiError, apiUser, handler, json } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { AI_DAILY_STOP, FALLBACK, PRIMARY, QuotaError, aiConfigured, aiUsageToday, callModel, parseJson } from '@/lib/ai-check';

/**
 * М9: дәптердегі шешімнің суреті → ЖИ оқиды → LaTeX жолдары. Оқушы оны дәптерде көріп, түзетіп растайды,
 * содан кейін әдеттегі жол-жолымен тексеру жүреді. Сурет сақталмайды (тек оқу үшін).
 */
const body = z.object({
  image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(2_800_000),
  context: z.string().max(1500).optional(),
});
const DAILY_PER_USER = 40;

const SYSTEM = `You transcribe a photo of a school student's handwritten math solution (grades 7-11, Kazakh/Russian notes possible).
Return the solution as LaTeX lines, top to bottom, exactly as written — do NOT fix mistakes, do NOT solve, do NOT add steps.
One line of the notebook = one array element. Use LaTeX: \\frac{a}{b}, \\sqrt{x}, x^{2}, \\cdot, \\le, \\ge, \\ne, \\pi, \\sin.
Decimal comma as {,}. Plain words (e.g. "жарамсыз", "Жауабы") may stay as \\text{...}.
If something is unreadable, write \\text{?} in its place.
Reply with ONLY JSON: {"lines":["..."],"readable":true}`;

export const POST = handler(async (req: Request) => {
  const profile = await apiUser();
  if (!aiConfigured()) throw new ApiError(503, 'Суретті оқу әзірге қосылмаған — шешімді теріп жазыңыз');
  if (Number(req.headers.get('content-length') ?? 0) > 3_000_000) throw new ApiError(413, 'Сурет тым үлкен');
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError(400, 'Сурет форматы қате (JPEG/PNG)');
  const input = parsed.data;
  const admin = createAdminClient();
  if ((await aiUsageToday(admin)).neurons >= AI_DAILY_STOP) throw new ApiError(429, 'Бүгінгі ЖИ лимиті бітті — шешімді теріп жазыңыз немесе ертең қайталаңыз');
  const { data: ok } = await admin.rpc('ocr_usage_take', { p_user: profile.id, p_max: DAILY_PER_USER });
  if (!ok) throw new ApiError(429, `Бір күнде ${DAILY_PER_USER} суреттен артық оқылмайды`);

  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: [{ type: 'text', text: input.context ? `Problem (for context only): ${input.context}` : 'Transcribe.' }, { type: 'image_url', image_url: { url: input.image } }] },
  ];
  let model = process.env.CF_AI_MODEL || PRIMARY;
  let out: Awaited<ReturnType<typeof callModel>>;
  try {
    out = await callModel(model, messages);
  } catch (e) {
    if (e instanceof QuotaError) throw new ApiError(429, 'ЖИ лимиті бітті — шешімді теріп жазыңыз');
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
  const lines = Array.isArray(j?.lines) ? (j!.lines as unknown[]).filter((l): l is string => typeof l === 'string').map((l) => l.trim().replace(/^\$+|\$+$/g, '')).filter(Boolean).slice(0, 40) : [];
  if (!lines.length) throw new ApiError(422, 'Суреттен шешім оқылмады — анығырақ түсіріп көріңіз немесе теріп жазыңыз');
  return json({ lines, readable: j?.readable !== false });
});
