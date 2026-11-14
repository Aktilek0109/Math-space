'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, failureText } from '@/lib/client-api';

/** Бір әрекетке ұпай мен пікір (мұғалім бекітеді). */
export function GradeAttempt({ assignmentId, attemptId, max, marks, note, manual }: { assignmentId: string; attemptId: string; max: number; marks: number | null; note: string; manual: boolean }) {
  const router = useRouter();
  const [m, setM] = useState(marks == null ? '' : String(marks));
  const [n, setN] = useState(note);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const v = Number(m.replace(',', '.'));
    if (m === '' || !Number.isFinite(v) || v < 0 || v > max) return setMsg(`0–${max}`);
    setBusy(true);
    const r = await apiFetch(`/api/admin/homework/${assignmentId}/attempts`, { method: 'POST', json: { attempt_id: attemptId, marks: v, note: n } });
    setBusy(false);
    setMsg(r.ok ? 'Сақталды ✓' : failureText(r.failure).join(' '));
    if (r.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <input className="input w-20 py-1 text-sm" inputMode="decimal" value={m} onChange={(e) => setM(e.target.value)} aria-label="Ұпай" />
      <span className="text-sm text-slate-500">/ {max}</span>
      <input className="input min-w-40 flex-1 py-1 text-sm" value={n} onChange={(e) => setN(e.target.value)} placeholder="Қысқа пікір (міндетті емес)" maxLength={1000} aria-label="Пікір" />
      <button type="button" className="btn btn-secondary px-3 py-1 text-sm" disabled={busy} onClick={save}>{manual ? 'Жаңарту' : 'Бекіту'}</button>
      {!manual && marks != null && <span className="text-xs text-slate-500">алдын ала ұпай</span>}
      {msg && <span className="text-xs">{msg}</span>}
    </div>
  );
}
