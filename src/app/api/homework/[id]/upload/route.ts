import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { after } from 'next/server';
import { aiConfigured, checkSubmission } from '@/lib/ai-check';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, handler, json, parseBody } from '@/lib/api';
import { HW_MAX_BYTES, HW_MAX_FILES, HW_MIME } from '@/lib/homework';

/**
 * Оқушы үй жұмысын жүктейді.
 *  prepare:  { action:'prepare', files:[{ name, mime, size }] } → signed upload URL-дар
 *  finalize: { action:'finalize', comment?, files:[{ path, name, mime, size }] } → файлдарды тіркеу, submitted_at
 *  remove:   { action:'remove', file_id } → тексерілмеген жұмыстан файлды алып тастау
 */
const fileMeta = z.object({
  name: z.string().trim().min(1).max(200),
  mime: z.string().refine((m) => m in HW_MIME, 'Тек сурет (JPG, PNG, WEBP, HEIC) немесе PDF'),
  size: z.number().int().positive().max(HW_MAX_BYTES, 'Файл 10 МБ-тан аспауы керек'),
});
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), files: z.array(fileMeta).min(1).max(HW_MAX_FILES) }),
  z.object({ action: z.literal('finalize'), comment: z.string().max(1000).optional(), files: z.array(fileMeta.extend({ path: z.string().min(5).max(400) })).max(HW_MAX_FILES) }),
  z.object({ action: z.literal('remove'), file_id: z.string().uuid() }),
]);

export const maxDuration = 60;

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const profile = await apiUser(['student']);
  const { id } = await ctx.params;
  const input = await parseBody(req, body);

  // Қолжетімділік RLS арқылы: оқушы тек өзіне берілген тапсырманы көреді
  const supabase = await createClient();
  const { data: a } = await supabase.from('assignments').select('id, grade').eq('id', id).maybeSingle();
  if (!a) throw new ApiError(404, 'Тапсырма табылмады');

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('submissions')
    .select('id, graded_at, submission_files(id)')
    .eq('assignment_id', id)
    .eq('student_id', profile.id)
    .maybeSingle();
  const sub = existing as { id: string; graded_at: string | null; submission_files: { id: string }[] } | null;
  if (sub?.graded_at) throw new ApiError(409, 'Жұмыс тексеріліп қойған. Өзгерту үшін мұғаліммен сөйлесіңіз.');

  if (input.action === 'prepare') {
    const have = sub?.submission_files.length ?? 0;
    if (have + input.files.length > HW_MAX_FILES) throw new ApiError(400, `Барлығы ${HW_MAX_FILES} файлдан аспауы керек (қазір ${have}).`);
    const out: { path: string; token: string }[] = [];
    for (const f of input.files) {
      const path = `${a.grade}/${id}/${profile.id}/${randomUUID()}.${HW_MIME[f.mime]}`;
      const { data, error } = await admin.storage.from('homework').createSignedUploadUrl(path);
      if (error || !data) throw new ApiError(500, 'Жүктеу сілтемесі жасалмады');
      out.push({ path, token: data.token });
    }
    return json({ items: out });
  }

  if (input.action === 'remove') {
    if (!sub) throw new ApiError(404, 'Файл табылмады');
    const { data: f } = await admin.from('submission_files').select('id, storage_path').eq('id', input.file_id).eq('submission_id', sub.id).maybeSingle();
    if (!f) throw new ApiError(404, 'Файл табылмады');
    await admin.storage.from('homework').remove([f.storage_path]);
    await admin.from('submission_files').delete().eq('id', f.id);
    return json({ ok: true });
  }

  // finalize
  const prefix = `${a.grade}/${id}/${profile.id}/`;
  if (input.files.some((f) => !f.path.startsWith(prefix))) throw new ApiError(400, 'Файл жолы жарамсыз');
  let subId = sub?.id;
  if (!subId) {
    const { data: ins, error } = await admin.from('submissions').insert({ assignment_id: id, student_id: profile.id }).select('id').single();
    if (error) throw new ApiError(500, 'Жұмысты сақтау қатесі');
    subId = ins.id as string;
  }
  if (input.files.length) {
    const start = sub?.submission_files.length ?? 0;
    const { error } = await admin.from('submission_files').insert(
      input.files.map((f, i) => ({ submission_id: subId, storage_path: f.path, original_name: f.name, mime_type: f.mime, size_bytes: f.size, position: start + i })),
    );
    if (error) throw new ApiError(500, 'Файлдарды тіркеу қатесі');
  }
  const { count } = await admin.from('submission_files').select('id', { count: 'exact', head: true }).eq('submission_id', subId);
  await admin
    .from('submissions')
    .update({ submitted_at: (count ?? 0) > 0 ? new Date().toISOString() : null, ...(input.comment !== undefined ? { comment: input.comment } : {}) })
    .eq('id', subId);
  // AI алдын ала тексеру — жауап қайтарылғаннан кейін фонда
  if ((count ?? 0) > 0 && aiConfigured()) {
    const sid = subId;
    await admin.from('submission_ai').upsert({ submission_id: sid, status: 'pending', updated_at: new Date().toISOString() }, { onConflict: 'submission_id' });
    after(() => checkSubmission(admin, sid).then(() => undefined));
  }
  return json({ ok: true });
});
