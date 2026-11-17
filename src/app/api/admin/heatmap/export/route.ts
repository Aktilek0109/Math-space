import { apiUser, handler } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';
import { loadHeatmap, PERIODS, type Source } from '@/lib/heatmap';

/** М5.2: жылу картасын CSV (Excel ашады, UTF-8 BOM, «;» бөлгіш). */
export const GET = handler(async (req: Request) => {
  await apiUser(['teacher', 'admin']);
  const u = new URL(req.url);
  const source = (['all', 'exam', 'homework', 'practice'].includes(u.searchParams.get('source') ?? '') ? u.searchParams.get('source') : 'all') as Source;
  const period = PERIODS[u.searchParams.get('period') ?? ''] ? u.searchParams.get('period')! : 'all';
  const h = await loadHeatmap(await createClient(), { classId: u.searchParams.get('class') ?? undefined, term: Number(u.searchParams.get('term')) || undefined, source, period });
  if (!h.cls) return new Response('Сынып жоқ', { status: 404 });
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [
    ['Оқушы', 'Логин', 'Орташа', ...h.objectives!.map((o) => o.code)].map(esc).join(';'),
    ['', '', '', ...h.objectives!.map((o) => o.text)].map(esc).join(';'),
    ...h.students!.map((s) => [s.name, s.username, h.rowAvg!.get(s.id) ?? '', ...h.objectives!.map((o) => h.cells!.get(`${s.id}|${o.id}`)?.pct ?? '')].map(esc).join(';')),
    ['Сынып орташасы', '', '', ...h.objectives!.map((o) => h.colAvg!.get(o.id) ?? '')].map(esc).join(';'),
  ];
  return new Response('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="heatmap-${encodeURIComponent(h.cls.name)}.csv"` },
  });
});
