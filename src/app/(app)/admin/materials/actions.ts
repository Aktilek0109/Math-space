'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/api';

const MAX_BYTES = 30 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

const meta = z.object({
  title: z.string().trim().min(2).max(300),
  description: z.string().max(5000).default(''),
  grade: z.coerce.number().int().min(7).max(12),
  unit_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  topic_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  type: z.enum(['presentation', 'worksheet', 'theory', 'solution', 'extra_problems', 'link', 'other']),
  language: z.enum(['kk', 'ru', 'en']).default('kk'),
  external_url: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  license: z.string().max(200).optional(),
  source: z.string().max(500).optional(),
  rights_confirmed: z.literal('on', { errorMap: () => ({ message: 'Пайдалану құқығын растаңыз (SEC-07)' }) }),
  status: z.enum(['draft', 'review', 'published']).default('draft'),
});

export interface UploadState { ok: boolean; message: string }

function safeName(name: string) {
  return name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || 'file';
}

export async function uploadMaterial(_prev: UploadState | null, fd: FormData): Promise<UploadState> {
  const actor = await requireRole(['teacher', 'admin']);
  const parsed = meta.safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')));
  if (!parsed.success) return { ok: false, message: Object.values(parsed.error.flatten().fieldErrors).flat().join('; ') || 'Деректер жарамсыз' };
  const m = parsed.data;

  const files = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0 && !m.external_url) return { ok: false, message: 'Файл не сілтеме қосыңыз' };
  for (const f of files) {
    if (!ALLOWED[f.type]) return { ok: false, message: `«${f.name}»: тек PDF, PPTX, DOCX, PNG, JPG` };
    if (f.size > MAX_BYTES) return { ok: false, message: `«${f.name}»: 30 МБ-тан үлкен` };
  }

  const admin = createAdminClient();
  const { data: subject } = await admin.from('subjects').select('id').eq('code', 'math').single();
  const { data: material, error } = await admin
    .from('materials')
    .insert({
      title: m.title,
      description: m.description,
      subject_id: subject!.id,
      grade: m.grade,
      unit_id: m.unit_id ?? null,
      topic_id: m.topic_id ?? null,
      type: m.type,
      language: m.language,
      external_url: m.external_url ?? null,
      license: m.license || null,
      source: m.source || null,
      rights_confirmed: true,
      status: m.status,
      owner_id: actor.id,
    })
    .select('id')
    .single();
  if (error) return { ok: false, message: 'Сақтау қатесі: ' + error.message };

  let position = 0;
  for (const f of files) {
    const path = `${m.grade}/${material.id}/${randomUUID()}-${safeName(f.name)}`;
    const { error: upErr } = await admin.storage.from('materials').upload(path, f, { contentType: f.type, upsert: false });
    if (upErr) return { ok: false, message: `«${f.name}» жүктелмеді: ${upErr.message}. Материал draft күйінде қалды.` };
    await admin.from('material_assets').insert({
      material_id: material.id,
      storage_path: path,
      original_name: f.name,
      mime_type: f.type,
      size_bytes: f.size,
      position: position++,
      uploaded_by: actor.id,
    });
  }

  await audit(actor.id, 'material.create', 'material', material.id, { status: m.status, files: files.length });
  revalidatePath('/admin/materials');
  revalidatePath('/library');
  return { ok: true, message: `«${m.title}» сақталды (${m.status === 'published' ? 'жарияланды' : 'draft'})` };
}

export async function setMaterialStatus(fd: FormData) {
  const actor = await requireRole(['teacher', 'admin']);
  const id = z.string().uuid().parse(fd.get('id'));
  const status = z.enum(['draft', 'review', 'published', 'archived']).parse(fd.get('status'));
  await createAdminClient().from('materials').update({ status }).eq('id', id);
  await audit(actor.id, 'material.status', 'material', id, { status });
  revalidatePath('/admin/materials');
  revalidatePath('/library');
}
