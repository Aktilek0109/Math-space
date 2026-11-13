'use client';

import { useState } from 'react';
import { apiFetch, failureText } from '@/lib/client-api';

export function ManualGrade({ responseId, max }: { responseId: string; max: number }) {
  const [marks, setMarks] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={`m-${responseId}`}>Ұпай қою:</label>
      <input id={`m-${responseId}`} type="number" min={0} max={max} step={0.5} className="input w-24" value={marks} onChange={(e) => setMarks(Number(e.target.value))} />
      <span>/ {max}</span>
      <button
        className="btn btn-primary px-3 py-1"
        onClick={async () => {
          const res = await apiFetch(`/api/admin/responses/${responseId}/grade`, { method: 'POST', json: { marks } });
          if (res.ok) window.location.reload();
          else setMsg(failureText(res.failure).join(' '));
        }}
      >
        Сақтау
      </button>
      {msg && <span className="text-red-700">{msg}</span>}
    </div>
  );
}
