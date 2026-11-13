import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, apiUser, handler, json } from '@/lib/api';
import { assignmentStudents, fmtDue } from '@/lib/homework';

/**
 * Zip жинауға арналған тізім (zip-тің өзін браузер жинайды — Vercel жауап көлемі 4,5 МБ-пен шектелген).
 * Қайтарады: { filename, info, csv, files: [{ dir, name, url }], notes: [{ dir, text }] }
 */
const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await apiUser(['teacher', 'admin']);
  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { data: a } = await admin.from('assignments').select('id, title, description, grade, class_id, due_at, max_score').eq('id', id).maybeSingle();
  if (!a) throw new ApiError(404, 'Тапсырма табылмады');
  const { data: key } = await admin.from('assignment_keys').select('answer_text').eq('assignment_id', id).maybeSingle();
  const students = await assignmentStudents(admin, a);
  const { data: subs } = await admin
    .from('submissions')
    .select('student_id, comment, score, feedback, submission_files(storage_path, position)')
    .eq('assignment_id', id);
  type Sub = { student_id: string; comment: string; score: number | null; feedback: string | null; submission_files: { storage_path: string; position: number }[] };
  const byStudent = new Map(((subs ?? []) as Sub[]).map((s) => [s.student_id, s]));

  const info = [
    `Тапсырма: ${a.title}`,
    `Сынып: ${a.grade}`,
    `Мерзімі: ${fmtDue(a.due_at)}`,
    `Ең жоғары баға: ${a.max_score}`,
    '',
    'Шарты:',
    a.description || '—',
    '',
    'Жауап кілті / критерий (тек мұғалімге):',
    key?.answer_text || '—',
    '',
    'Нұсқау: әр оқушының папкасындағы суреттерді тексеріп, «бағалар.csv» кестесінің «баға» және «түсініктеме» бағандарын толтырыңыз.',
    'Толтырылған кестені сайттағы осы тапсырма бетінде «Бағаларды кестеден жүктеу» арқылы салсаңыз, бағалар оқушыларға шығады.',
  ].join('\r\n');

  const csv = ['логин;аты-жөні;тапсырды;баға;түсініктеме'];
  const files: { dir: string; name: string; url: string }[] = [];
  const notes: { dir: string; text: string }[] = [];
  for (const st of students) {
    const s = byStudent.get(st.id);
    const list = [...(s?.submission_files ?? [])].sort((x, y) => x.position - y.position);
    csv.push([st.username, (st.full_name || '').replace(/;/g, ','), list.length ? 'иә' : 'жоқ', s?.score ?? '', (s?.feedback ?? '').replace(/[;\r\n]+/g, ' ')].join(';'));
    if (!list.length) continue;
    const dir = `${clean(st.username)} — ${clean(st.full_name || st.username)}`;
    if (s?.comment) notes.push({ dir, text: s.comment });
    let n = 1;
    for (const f of list) {
      const { data } = await admin.storage.from('homework').createSignedUrl(f.storage_path, 600);
      if (!data) continue;
      files.push({ dir, name: `${n++}.${f.storage_path.split('.').pop() || 'jpg'}`, url: data.signedUrl });
    }
  }
  return json({ filename: `${clean(a.title)} — жұмыстар.zip`, info, csv: csv.join('\r\n'), files, notes });
});
