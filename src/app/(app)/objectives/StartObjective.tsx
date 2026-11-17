'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StartObjective({ objectiveId, label }: { objectiveId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function start() {
    setBusy(true); setErr(null);
    const res = await fetch('/api/objective/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objectiveId }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(body.error ?? 'Қате'); setBusy(false); return; }
    router.push(body.redirect);
  }
  return (
    <div className="text-right">
      <button className="btn btn-primary text-sm" onClick={start} disabled={busy}>{busy ? '…' : label}</button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
