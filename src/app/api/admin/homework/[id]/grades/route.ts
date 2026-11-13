import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, handler, json, parseBody } from '@/lib/api';
import { assignmentStudents } from '@/lib/homework';

/**
 * Бағаларды кестеден жүктеу. Бағандар: логин; [аты-жөні]; [тапсырды]; баға; түсініктеме.
 * Бөлгіш «;» немесе «,» немесе Tab. Тақырып жолы болса өткізіледі.
 */
const body = z.object({ csv: z.string().min(1).max(200_000) });

function splitRow(line: string, sep: string) {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await apiUser(['teacher', 'admin']);
  const { id } = await ctx.params;
  const { csv } = await parseBody(req, body);
  const admin = createAdminClient();
  const { data: a } = await admin.from('assignments').select('grade, class_id, max_score').eq('id', id).maybeSingle();
  if (!a) throw new ApiError(404, 'Тапсырма табылмады');
  const students = await assignmentStudents(admin, a);
  const byLogin = new Map(students.map((s) => [s.username.toLowerCase(), s.id]));

  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sep = lines[0]?.includes(';') ? ';' : lines[0]?.includes('\t') ? '\t' : ',';
  const header = splitRow(lines[0] ?? '', sep).map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => h.includes('логин') || h.includes('login'));
  const col = (names: string[], fallback: number) => {
    const i = header.findIndex((h) => names.some((n) => h.includes(n)));
    return hasHeader && i >= 0 ? i : fallback;
  };
  const iLogin = col(['логин', 'login'], 0);
  const iScore = col(['баға', 'балл', 'score'], 1);
  const iFb = col(['түсініктеме', 'пікір', 'feedback', 'comment'], 2);

  const errors: { line: number; error: string }[] = [];
  let updated = 0;
  const max = Number(a.max_score);
  for (let n = hasHeader ? 1 : 0; n < lines.length; n++) {
    const cells = splitRow(lines[n], sep);
    const login = (cells[iLogin] ?? '').toLowerCase();
    const sid = byLogin.get(login);
    if (!sid) { errors.push({ line: n + 1, error: `«${login}» логині бұл тапсырманың оқушыларында жоқ` }); continue; }
    const rawScore = (cells[iScore] ?? '').replace(',', '.');
    const feedback = cells[iFb] ?? '';
    if (!rawScore && !feedback) continue;
    const score = rawScore ? Number(rawScore) : null;
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > max)) { errors.push({ line: n + 1, error: `баға 0…${max} аралығында болуы керек` }); continue; }
    const { error } = await admin.from('submissions').upsert(
      { assignment_id: id, student_id: sid, score, feedback, graded_by: actor.id, graded_at: new Date().toISOString() },
      { onConflict: 'assignment_id,student_id' },
    );
    if (error) errors.push({ line: n + 1, error: 'сақтау қатесі' });
    else updated++;
  }
  return json({ updated, errors });
});
