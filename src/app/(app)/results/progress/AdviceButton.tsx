'use client';

import { useState } from 'react';
import { apiFetch, failureText } from '@/lib/client-api';

const LABEL = { practice: 'Осы дағдыны жаттықтыру', harder: 'Күрделі есепке өту', diagnose: 'Қысқа тексеру' } as const;

export function AdviceButton({ objectiveId, kind, compact }: { objectiveId: string; kind: keyof typeof LABEL; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    const r = await apiFetch<{ redirect: string }>('/api/progress/practice', { method: 'POST', json: { objective_id: objectiveId, kind } });
    if (!r.ok) { setBusy(false); return setErr(failureText(r.failure).join(' ')); }
    window.location.assign(r.data.redirect);
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={`btn ${compact ? 'btn-secondary px-2 py-1 text-xs' : 'btn-primary'}`} disabled={busy} onClick={go}>
        {busy ? 'Құрастырылуда…' : LABEL[kind]}
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </span>
  );
}
