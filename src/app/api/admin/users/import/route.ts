import { z } from 'zod';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';
import { createAccount } from '@/lib/users';
import { userImportRow } from '@/lib/validation';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * CSV импорт (AUTH-04). Клиент CSV-ді жолдарға бөліп жібереді:
 * { rows: [{ username, full_name, grade, role }] }. Жауапта уақытша парольдер — бір рет.
 */
const body = z.object({ rows: z.array(z.unknown()).min(1).max(500) });

export const POST = handler(async (req: Request) => {
  const actor = await apiUser(['admin']);
  const { rows } = await parseBody(req, body);

  const parsed = rows.map((r, i) => ({ line: i + 2, res: userImportRow.safeParse(r) }));
  const invalid = parsed.filter((p) => !p.res.success).map((p) => ({ line: p.line, error: 'Жол жарамсыз (логин: 3–32 латын әріп/сан)' }));

  // Файл ішіндегі бәсекелес (қайталанған) логиндер
  const seen = new Map<string, number>();
  const dupes: { line: number; error: string }[] = [];
  for (const p of parsed) {
    if (!p.res.success) continue;
    const u = p.res.data.username;
    if (seen.has(u)) dupes.push({ line: p.line, error: `«${u}» ${seen.get(u)}-жолда да бар` });
    else seen.set(u, p.line);
  }
  if (invalid.length || dupes.length) throw new ApiError(400, 'CSV-де қателер бар — ешбір аккаунт жасалмады', { errors: [...invalid, ...dupes] });

  // Сынып тобы (мыс. «8F»): жоқ болса жасалады, оқушы мүше етіледі (бар аккаунт үшін де)
  const admin = createAdminClient();
  const year = (() => { const d = new Date(); const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${y + 1}`; })();
  const classIds = new Map<string, string>();
  async function classId(name: string, grade: number) {
    if (classIds.has(name)) return classIds.get(name)!;
    const { data: found } = await admin.from('classes').select('id').eq('name', name).eq('academic_year', year).maybeSingle();
    let id = found?.id as string | undefined;
    if (!id) {
      const { data: ins } = await admin.from('classes').insert({ name, grade, academic_year: year }).select('id').single();
      id = ins?.id as string | undefined;
    }
    if (id) classIds.set(name, id);
    return id;
  }

  const results: ({ line: number; ok: boolean } & Record<string, unknown>)[] = [];
  for (const p of parsed) {
    if (!p.res.success) continue;
    const out = await createAccount(p.res.data);
    results.push({ line: p.line, ...out });
    const raw = rows[p.line - 2] as { class_name?: unknown };
    const cname = typeof raw?.class_name === 'string' && /^(7|8|9|10|11|12)\S$/u.test(raw.class_name) ? raw.class_name : null;
    if (!cname || !p.res.data.grade) continue;
    let uid = out.ok ? out.id : undefined;
    if (!uid) {
      const { data: prof } = await admin.from('profiles').select('id').eq('username', p.res.data.username).maybeSingle();
      uid = prof?.id as string | undefined;
    }
    const cid = await classId(cname, p.res.data.grade);
    if (uid && cid) await admin.from('class_members').upsert({ class_id: cid, student_id: uid }, { onConflict: 'class_id,student_id', ignoreDuplicates: true });
  }
  const created = results.filter((r) => r.ok).length;
  await audit(actor.id, 'user.import_csv', 'profile', undefined, { created, failed: results.length - created });
  return json({ created, results });
});
