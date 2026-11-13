import { z } from 'zod';
import { ApiError, apiUser, audit, handler, json, parseBody } from '@/lib/api';
import { createAccount } from '@/lib/users';
import { userImportRow } from '@/lib/validation';

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

  const results: ({ line: number; ok: boolean } & Record<string, unknown>)[] = [];
  for (const p of parsed) {
    if (p.res.success) results.push({ line: p.line, ...(await createAccount(p.res.data)) });
  }
  const created = results.filter((r) => r.ok).length;
  await audit(actor.id, 'user.import_csv', 'profile', undefined, { created, failed: results.length - created });
  return json({ created, results });
});
