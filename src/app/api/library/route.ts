import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { ApiError, apiUser, handler, json } from '@/lib/api';

const query = z.object({
  grade: z.coerce.number().int().min(7).max(12).optional(),
  unit_id: z.string().uuid().optional(),
  topic_id: z.string().uuid().optional(),
  type: z.string().max(30).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  per_page: z.coerce.number().int().min(1).max(50).default(20),
});

export const GET = handler(async (req: Request) => {
  await apiUser();
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) throw new ApiError(400, 'Сүзгі жарамсыз', parsed.error.flatten());
  const f = parsed.data;

  const supabase = await createClient();
  // RLS: оқушыға тек published қайтады
  let q = supabase
    .from('materials')
    .select('id, title, description, grade, type, language, unit_id, topic_id, published_at, units(title), topics(title)', { count: 'exact' })
    .eq('status', 'published')
    .order('grade')
    .order('sort_order')
    .range((f.page - 1) * f.per_page, f.page * f.per_page - 1);
  if (f.grade) q = q.eq('grade', f.grade);
  if (f.unit_id) q = q.eq('unit_id', f.unit_id);
  if (f.topic_id) q = q.eq('topic_id', f.topic_id);
  if (f.type) q = q.eq('type', f.type);
  if (f.q) q = q.textSearch('search_tsv', f.q, { type: 'websearch', config: 'simple' });

  const { data, count, error } = await q;
  if (error) throw error;
  return json({ items: data, total: count ?? 0, page: f.page, per_page: f.per_page });
});
