'use client';

import { useState } from 'react';
import { apiFetch, failureText } from '@/lib/client-api';
import { MathText } from '@/components/MathText';

interface Report { report: { ok: boolean; runs: number; failures: { seed: number; errors: string[] }[]; deterministic: boolean }; samples: { body: { text: string; options?: { id: string; text: string }[] }; answer: { value?: number; correct?: string } }[] }

export function TemplateTester({ templateKey, registered }: { templateKey: string; registered: boolean }) {
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(publish: boolean) {
    setBusy(true);
    setErr(null);
    const res = await apiFetch<Report>(`/api/admin/templates/${templateKey}/selftest${publish ? '?publish=1' : ''}`, { method: 'POST' });
    setBusy(false);
    if (res.ok) setData(res.data);
    else setErr(failureText(res.failure).join(' '));
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex gap-2">
        <button className="btn btn-secondary px-3 py-1" onClick={() => run(false)} disabled={busy}>100 рет тексеру</button>
        {registered && <button className="btn btn-primary px-3 py-1" onClick={() => run(true)} disabled={busy}>Тексеріп, жариялау</button>}
      </div>
      {err && <p className="text-red-700">{err}</p>}
      {data && (
        <div className={data.report.ok ? 'ok-box' : 'error-box'}>
          <p className="font-medium">
            {data.report.ok ? `✓ ${data.report.runs} сынақ өтті, детерминирленген` : `✗ ${data.report.failures.length} қате${data.report.deterministic ? '' : ', seed тұрақсыз'}`}
          </p>
          {data.report.failures.slice(0, 5).map((f) => <p key={f.seed}>seed {f.seed}: {f.errors.join(', ')}</p>)}
          <div className="mt-2 space-y-1">
            {data.samples.map((s, i) => (
              <p key={i}>
                <MathText text={s.body.text} /> → <b>{s.answer.value ?? s.answer.correct}</b>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
