import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Жаппай импорт (Drive папкасынан көшіру).
 * Файлдар серверден өтпейді (Vercel-дің 4,5 МБ шегі): сервер материал жолын жасап,
 * signed upload URL береді, браузер файлды Storage-қа тікелей жүктейді, содан соң finalize.
 *
 *  prepare:  { action:'prepare', items:[{ grade, term?, unit?, topic?, name, mime, size, order }] }
 *            → { items:[{ i, skipped?, material_id?, path?, token? }] }
 *  finalize: { action:'finalize', items:[{ material_id, path, name, mime, size }] }
 */
const MAX_BYTES = 30 * 1024 * 1024;
const MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
] as const;

const prepareItem = z.object({
  grade: z.number().int().min(7).max(12),
  term: z.number().int().min(1).max(4).nullable().optional(),
  unit: z.string().trim().min(1).max(200).nullable().optional(),
  topic: z.string().trim().min(1).max(200).nullable().optional(),
  name: z.string().trim().min(1).max(300),
  mime: z.enum(MIME),
  size: z.number().int().positive().max(MAX_BYTES),
  order: z.number().int().min(0).max(100000).default(0),
  plan: z.boolean().optional(),
});
const finalizeItem = z.object({
  material_id: z.string().uuid(),
  path: z.string().min(5).max(500),
  name: z.string().min(1).max(300),
  mime: z.enum(MIME),
  size: z.number().int().positive().max(MAX_BYTES),
});
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), items: z.array(prepareItem).min(1).max(25) }),
  z.object({ action: z.literal('finalize'), items: z.array(finalizeItem).min(1).max(25) }),
]);

type MaterialType = 'lesson_plan' | 'presentation' | 'worksheet' | 'solution' | 'extra_problems' | 'theory' | 'other';
function guessType(name: string): MaterialType {
  const n = name.toLowerCase();
  if (/^\s*[қк]мж/.test(n)) return 'lesson_plan';
  if (n.includes('жауап')) return 'solution';
  if (n.includes('презентация') || /\.pptx$/.test(n)) return 'presentation';
  if (n.includes('жұмыс парағы')) return 'worksheet';
  if (/(дайындық|жинақ|қайталау|пысықтау|бжб|тжб)/.test(n)) return 'extra_problems';
  if (n.includes('теория') || n.includes('конспект')) return 'theory';
  return 'other';
}
const stripExt = (n: string) => n.replace(/\.(pdf|pptx|docx|png|jpe?g)$/i, '');
const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
const orderOf = (s: string) => Number((s.match(/^\s*(\d+)/) || [])[1] ?? 0);

export const POST = handler(async (req: Request) => {
  const actor = await apiUser(['admin']);
  const input = await parseBody(req, body);
  const admin = createAdminClient();

  if (input.action === 'finalize') {
    const rows = input.items.map((it) => ({
      material_id: it.material_id,
      storage_path: it.path,
      original_name: it.name,
      mime_type: it.mime,
      size_bytes: it.size,
      position: 0,
      uploaded_by: actor.id,
    }));
    const { error } = await admin.from('material_assets').upsert(rows, { onConflict: 'storage_path', ignoreDuplicates: true });
    if (error) throw new ApiError(500, 'Файлдарды тіркеу қатесі: ' + error.message);
    return json({ ok: true, count: rows.length });
  }

  const { data: subject } = await admin.from('subjects').select('id').eq('code', 'math').single();
  if (!subject) throw new ApiError(500, '«math» пәні базада жоқ (seed.sql орындалмаған)');

  const unitCache = new Map<string, string>();
  const topicCache = new Map<string, string>();

  async function unitId(grade: number, term: number | null, title: string) {
    const key = `${grade}|${term ?? ''}|${title}`;
    if (unitCache.has(key)) return unitCache.get(key)!;
    let q = admin.from('units').select('id').eq('subject_id', subject!.id).eq('grade', grade).eq('title', title).limit(1);
    q = term ? q.eq('term', term) : q.is('term', null);
    const { data } = await q;
    let id = data?.[0]?.id as string | undefined;
    if (!id) {
      const { data: ins, error } = await admin
        .from('units')
        .insert({ subject_id: subject!.id, grade, term, title, sort_order: orderOf(title) })
        .select('id')
        .single();
      if (error) throw new ApiError(500, `«${title}» бөлімін жасау қатесі: ${error.message}`);
      id = ins.id as string;
    }
    unitCache.set(key, id);
    return id;
  }

  async function topicId(unit: string, title: string) {
    const key = `${unit}|${title}`;
    if (topicCache.has(key)) return topicCache.get(key)!;
    const { data } = await admin.from('topics').select('id').eq('unit_id', unit).eq('title', title).limit(1);
    let id = data?.[0]?.id as string | undefined;
    if (!id) {
      const { data: ins, error } = await admin.from('topics').insert({ unit_id: unit, title, sort_order: Math.round(parseFloat((title.match(/^\s*(\d+(?:\.\d+)?)/) || [])[1] ?? '0') * 100) }).select('id').single();
      if (error) throw new ApiError(500, `«${title}» тақырыбын жасау қатесі: ${error.message}`);
      id = ins.id as string;
    }
    topicCache.set(key, id);
    return id;
  }

  const out: { i: number; skipped?: boolean; material_id?: string; path?: string; token?: string; error?: string }[] = [];
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    try {
      // Бөлімсіз файл (тоқсан деңгейінде) — тоқсанның «Жалпы» бөліміне
      const uTitle = it.unit ?? (it.term ? 'Жалпы материалдар' : null);
      const u = uTitle ? await unitId(it.grade, it.term ?? null, uTitle) : null;
      const t = u && it.topic ? await topicId(u, it.topic) : null;
      const type: MaterialType = it.plan ? 'lesson_plan' : guessType(it.name);
      const base = stripExt(it.name);
      // ҚМЖ атауы презентациямен бірдей болса дубль деп қалмауы үшін
      const title = type === 'lesson_plan' && !/^\s*[ҚК]МЖ/i.test(base) ? `ҚМЖ — ${base}` : base;

      // Қайта іске қосқанда дубль жасамау
      let dq = admin.from('materials').select('id, material_assets(count)').eq('grade', it.grade).eq('title', title).limit(1);
      dq = u ? dq.eq('unit_id', u) : dq.is('unit_id', null);
      dq = t ? dq.eq('topic_id', t) : dq.is('topic_id', null);
      const { data: dup } = await dq;
      const existing = dup?.[0] as { id: string; material_assets: { count: number }[] } | undefined;
      if (existing && (existing.material_assets?.[0]?.count ?? 0) > 0) {
        out.push({ i, skipped: true });
        continue;
      }

      let materialId = existing?.id;
      if (!materialId) {
        const { data: m, error } = await admin
          .from('materials')
          .insert({
            title,
            description: '',
            subject_id: subject.id,
            grade: it.grade,
            unit_id: u,
            topic_id: t,
            type,
            language: 'kk',
            sort_order: it.order,
            source: 'Мұғалімнің авторлық материалы',
            rights_confirmed: true,
            status: 'published',
            owner_id: actor.id,
          })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        materialId = m.id as string;
      }

      const path = `${it.grade}/${materialId}/${randomUUID()}-${safeName(it.name)}`;
      const { data: signed, error: sErr } = await admin.storage.from('materials').createSignedUploadUrl(path);
      if (sErr || !signed) throw new Error(sErr?.message ?? 'signed URL жоқ');
      out.push({ i, material_id: materialId, path, token: signed.token });
    } catch (e) {
      out.push({ i, error: e instanceof Error ? e.message : String(e) });
    }
  }

  await audit(actor.id, 'material.bulk_prepare', 'material', undefined, {
    prepared: out.filter((o) => o.token).length,
    skipped: out.filter((o) => o.skipped).length,
  });
  return json({ items: out });
});
