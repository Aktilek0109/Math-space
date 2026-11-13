'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, failureText } from '@/lib/client-api';
import { buildZip, type ZipEntry } from '@/lib/zip';

export function GradeRow(props: { assignmentId: string; studentId: string; max: number; score: number | null; feedback: string; graded: boolean }) {
  const router = useRouter();
  const [score, setScore] = useState(props.score == null ? '' : String(Number(props.score)));
  const [fb, setFb] = useState(props.feedback);
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [err, setErr] = useState('');

  async function save() {
    setState('busy');
    const r = await apiFetch(`/api/admin/homework/${props.assignmentId}/grade`, {
      method: 'POST',
      json: { student_id: props.studentId, score: score.trim() === '' ? null : Number(score.replace(',', '.')), feedback: fb },
    });
    if (!r.ok) { setErr(failureText(r.failure).join(' ')); setState('err'); return; }
    setState('ok');
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label">Баға (/{props.max})</label>
        <input value={score} onChange={(e) => { setScore(e.target.value); setState('idle'); }} inputMode="decimal" className="input w-24" />
      </div>
      <div className="min-w-48 flex-1">
        <label className="label">Түсініктеме</label>
        <input value={fb} onChange={(e) => { setFb(e.target.value); setState('idle'); }} className="input" maxLength={3000} placeholder="Мысалы: №2-де таңба қатесі" />
      </div>
      <button type="button" onClick={save} disabled={state === 'busy'} className="btn btn-secondary">{state === 'busy' ? '…' : 'Сақтау'}</button>
      {state === 'ok' && <span className="text-sm text-green-700">✓</span>}
      {props.graded && state === 'idle' && <span className="text-xs text-green-700">бағаланған</span>}
      {state === 'err' && <span className="text-sm text-red-700">{err}</span>}
    </div>
  );
}

export function ImportGrades({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const csv = await f.text();
    const r = await apiFetch<{ updated: number; errors: { line: number; error: string }[] }>(`/api/admin/homework/${id}/grades`, { method: 'POST', json: { csv } });
    setBusy(false);
    if (!r.ok) return setMsg(failureText(r.failure));
    setMsg([`Жаңартылды: ${r.data.updated}`, ...r.data.errors.map((e) => `• ${e.line}-жол: ${e.error}`)]);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <label className="btn btn-secondary cursor-pointer">
        {busy ? 'Жүктелуде…' : '⬆ Бағаларды кестеден жүктеу (CSV)'}
        <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {msg.length > 0 && <div className="text-sm text-slate-700">{msg.map((m, i) => <div key={i}>{m}</div>)}</div>}
    </div>
  );
}

export function DeleteAssignment({ id }: { id: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" onClick={() => setAsk(true)} className="text-sm text-red-600 hover:underline">Тапсырманы жою</button>;
  return (
    <span className="flex items-center gap-2 text-sm">
      Барлық жұмыстар да өшеді.
      <button type="button" className="btn btn-danger px-3 py-1" onClick={async () => {
        const r = await apiFetch('/api/admin/homework', { method: 'POST', json: { action: 'delete', id } });
        if (r.ok) router.push('/admin/homework');
      }}>Иә, жою</button>
      <button type="button" className="btn btn-secondary px-3 py-1" onClick={() => setAsk(false)}>Жоқ</button>
    </span>
  );
}

/** Барлық жұмысты браузерде zip-ке жинап жүктеу (сервер жауап көлемінің шегіне түспеу үшін). */
export function ExportZip({ id }: { id: string }) {
  const [state, setState] = useState('');
  async function run() {
    setState('Тізім алынуда…');
    const r = await apiFetch<{ filename: string; info: string; csv: string; files: { dir: string; name: string; url: string }[]; notes: { dir: string; text: string }[] }>(`/api/admin/homework/${id}/export`);
    if (!r.ok) return setState(failureText(r.failure).join(' '));
    const enc = new TextEncoder();
    const entries: ZipEntry[] = [
      { name: '00_Тапсырма.txt', data: enc.encode('\ufeff' + r.data.info) },
      { name: 'бағалар.csv', data: enc.encode('\ufeff' + r.data.csv) },
      ...r.data.notes.map((n) => ({ name: `${n.dir}/оқушы_пікірі.txt`, data: enc.encode('\ufeff' + n.text) })),
    ];
    let done = 0;
    for (const f of r.data.files) {
      setState(`Суреттер жүктелуде: ${done} / ${r.data.files.length}`);
      try {
        const res = await fetch(f.url);
        if (res.ok) entries.push({ name: `${f.dir}/${f.name}`, data: new Uint8Array(await res.arrayBuffer()) });
      } catch { /* бір файл өтпесе — қалғанын жалғастырамыз */ }
      done++;
    }
    const zip = buildZip(entries);
    const blob = new Blob([zip as unknown as BlobPart], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.data.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setState(r.data.files.length ? `Дайын: ${r.data.files.length} сурет` : 'Әзірге ешкім жұмыс тапсырмаған — zip-те тек кесте бар.');
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={run} className="btn btn-primary">⬇ Барлық жұмысты zip етіп жүктеу</button>
      {state && <span className="text-sm text-slate-600">{state}</span>}
    </span>
  );
}

export interface AiResult {
  status: 'pending' | 'done' | 'error' | 'quota' | 'skipped';
  score: number | null;
  feedback: string | null;
  details: { items?: { n?: string; student?: string; correct?: boolean; note?: string }[]; readable?: boolean; raw?: string } | null;
  error: string | null;
  model: string | null;
  neurons: number | null;
}

/** Тексерілмеген жұмыстардың бәрін AI-мен тексеру */
export function AiCheckAll({ id }: { id: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setMsg('Тексерілуде… (бір жұмысқа 5–15 секунд)');
    const r = await apiFetch<{ counts: Record<string, number>; left: number; total: number }>(`/api/admin/homework/${id}/ai`, { method: 'POST', json: {} });
    setBusy(false);
    if (!r.ok) return setMsg(failureText(r.failure).join(' '));
    const c = r.data.counts;
    if (!r.data.total) setMsg('Тексерілмеген жұмыс жоқ.');
    else setMsg(`Дайын: ${c.done ?? 0}${c.error ? ` · қате: ${c.error}` : ''}${c.skipped ? ` · сурет емес: ${c.skipped}` : ''}${c.quota ? ' · бүгінгі лимит бітті' : ''}${r.data.left ? ` · қалды: ${r.data.left} (тағы басыңыз)` : ''}`);
    router.refresh();
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={run} disabled={busy} className="btn btn-secondary">{busy ? 'Тексерілуде…' : '🤖 Тексерілмегендерді AI-мен тексеру'}</button>
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
    </span>
  );
}

/** Бір оқушы жұмысының AI ұсынысы: қабылдау / қайта тексеру */
export function AiBox(props: { assignmentId: string; studentId: string; max: number; ai: AiResult | null; graded: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'' | 'accept' | 'recheck'>('');
  const [err, setErr] = useState('');
  const ai = props.ai;

  async function recheck() {
    setBusy('recheck'); setErr('');
    const r = await apiFetch(`/api/admin/homework/${props.assignmentId}/ai`, { method: 'POST', json: { student_id: props.studentId } });
    setBusy('');
    if (!r.ok) setErr(failureText(r.failure).join(' '));
    router.refresh();
  }
  async function accept() {
    if (!ai) return;
    setBusy('accept'); setErr('');
    const r = await apiFetch(`/api/admin/homework/${props.assignmentId}/grade`, {
      method: 'POST',
      json: { student_id: props.studentId, score: ai.score, feedback: ai.feedback ?? '' },
    });
    setBusy('');
    if (!r.ok) return setErr(failureText(r.failure).join(' '));
    router.refresh();
  }

  const recheckBtn = (
    <button type="button" onClick={recheck} disabled={!!busy} className="text-xs text-brand-600 hover:underline">
      {busy === 'recheck' ? 'тексерілуде…' : ai?.status === 'done' ? 'қайта тексеру' : 'AI-мен тексеру'}
    </button>
  );

  if (!ai || ai.status === 'pending') {
    return (
      <div className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
        🤖 {ai ? 'AI тексеріп жатыр… (бетті жаңартыңыз)' : 'AI әлі тексермеген.'} {recheckBtn}
        {err && <div className="text-red-700">{err}</div>}
      </div>
    );
  }
  if (ai.status !== 'done') {
    return (
      <div className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
        🤖 {ai.error ?? 'Тексерілмеді'} {ai.status !== 'skipped' && recheckBtn}
        {err && <div className="text-red-700">{err}</div>}
      </div>
    );
  }
  const items = ai.details?.items ?? [];
  return (
    <div className="space-y-1 rounded-lg bg-violet-50 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>🤖 AI ұсынысы: <b>{ai.score == null ? '—' : `${Number(ai.score)} / ${props.max}`}</b></span>
        {ai.details?.readable === false && <span className="chip bg-amber-100 text-amber-800">сурет анық емес</span>}
        {ai.score != null && (
          <button type="button" onClick={accept} disabled={!!busy} className="btn btn-primary px-3 py-1 text-xs">
            {busy === 'accept' ? '…' : props.graded ? 'Ұсынысты қайта қою' : '✓ Қабылдау'}
          </button>
        )}
        {recheckBtn}
      </div>
      {ai.feedback && <p className="text-slate-700">{ai.feedback}</p>}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((it, i) => (
            <span key={i} title={[it.student && `Оқушы: ${it.student}`, it.note].filter(Boolean).join(' — ')}
              className={`chip ${it.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              №{it.n ?? i + 1} {it.correct ? '✓' : '✗'}{it.student ? ` ${String(it.student).slice(0, 24)}` : ''}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">AI қателесуі мүмкін, суретпен салыстырып шығыңыз.</p>
      {err && <div className="text-red-700">{err}</div>}
    </div>
  );
}
