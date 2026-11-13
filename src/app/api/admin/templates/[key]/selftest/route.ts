import { apiUser, audit, handler, json, ApiError } from '@/lib/api';
import { selfTestTemplate, getTemplate, generateFromTemplate, newSeed } from '@/lib/generator';
import { createAdminClient } from '@/lib/supabase/admin';

/** 11-бөлім, 4-қадам: 100 рет генерациялап тексеру; ok болса — жариялауға болады. */
export const POST = handler(async (req: Request, ctx: { params: Promise<{ key: string }> }) => {
  const actor = await apiUser(['admin']);
  const { key } = await ctx.params;
  if (!getTemplate(key)) throw new ApiError(404, 'Үлгі табылмады');
  const publish = new URL(req.url).searchParams.get('publish') === '1';

  const report = selfTestTemplate(key, 100);
  const samples = Array.from({ length: 3 }, () => generateFromTemplate(key, newSeed()));

  if (report.ok) {
    const admin = createAdminClient();
    const patch: Record<string, unknown> = { last_validated_at: new Date().toISOString() };
    if (publish) patch.status = 'published';
    await admin.from('generator_templates').update(patch).eq('template_key', key).eq('generation_code_version', report.version);
  }
  await audit(actor.id, 'template.selftest', 'generator_template', key, { ok: report.ok, failures: report.failures.length, publish });
  return json({ report, samples });
});
