'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MathText } from '@/components/MathText';
import { band, BANDS, isDrop, personalEligible, type Band } from '@/lib/heatmap-rules';

interface Cell { pct: number; n: number; prev: number | null; last: string | null }
interface Obj { id: string; code: string; text: string; term: number | null; unit: string }
interface Stu { id: string; name: string; username: string }

const BG: Record<Band, string> = {
  none: 'bg-slate-100 text-slate-400',
  red: 'bg-red-500 text-white',
  orange: 'bg-orange-400 text-white',
  yellow: 'bg-yellow-300 text-slate-900',
  green: 'bg-emerald-500 text-white',
};

export function HeatTable(props: {
  classId: string; grade: number; sort: 'name' | 'avg'; sortHref: { name: string; avg: string };
  students: Stu[]; objectives: Obj[]; cells: Record<string, Cell>; rowAvg: Record<string, number | null>; colAvg: Record<string, number | null>;
  errors: Record<string, { reason: string; students: number }[]>;
}) {
  const router = useRouter();
  const { students, objectives, cells } = props;
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [col, setCol] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [perObj, setPerObj] = useState(2);
  const [due, setDue] = useState('');

  const rows = useMemo(() => {
    const r = [...students];
    if (props.sort === 'avg') r.sort((a, b) => (props.rowAvg[a.id] ?? 101) - (props.rowAvg[b.id] ?? 101));
    return r;
  }, [students, props.sort, props.rowAvg]);

  const key = (s: string, o: string) => `${s}|${o}`;
  function toggle(s: string, o: string) {
    if (!personalEligible(cells[key(s, o)]?.pct)) return;
    setSel((p) => { const n = new Set(p); const k = key(s, o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  function selectColumn(o: string) {
    setSelecting(true);
    setSel((p) => { const n = new Set(p); for (const s of students) if (personalEligible(cells[key(s.id, o)]?.pct)) n.add(key(s.id, o)); return n; });
  }
  const selStudents = new Set([...sel].map((k) => k.split('|')[0]));

  async function create() {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/admin/heatmap/personal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: props.classId, cells: [...sel].map((k) => { const [student_id, objective_id] = k.split('|'); return { student_id, objective_id }; }), per_objective: perObj, due_at: due ? new Date(due).toISOString() : null }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(body.error ?? 'Қате'); return; }
    setMsg(`Дайын: ${body.created} оқушыға жеке үй жұмысы берілді${body.skipped?.length ? ` (өткізілді: ${body.skipped.length})` : ''}.`);
    setSel(new Set()); setSelecting(false);
    router.refresh();
  }

  const colObj = objectives.find((o) => o.id === col);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {BANDS.slice().reverse().map((b) => <span key={b.band} className="flex items-center gap-1"><span className={`inline-block h-3 w-5 rounded ${BG[b.band]}`} />{b.band === 'red' ? '< 40%' : b.band === 'green' ? '≥ 80%' : b.band === 'orange' ? '40–64%' : '65–79%'} {b.label}</span>)}
        <span className="flex items-center gap-1"><span className={`inline-block h-3 w-5 rounded ${BG.none}`} />дерек жоқ</span>
        <span>↓ — төмендеді</span>
        <span className="ml-auto flex gap-2">
          Сұрыптау: <Link className={props.sort === 'name' ? 'font-semibold' : 'text-brand-600'} href={props.sortHref.name}>аты</Link>
          <Link className={props.sort === 'avg' ? 'font-semibold' : 'text-brand-600'} href={props.sortHref.avg}>орташа ↑</Link>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={`btn text-sm ${selecting ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setSelecting((v) => !v); setMsg(null); }}>
          {selecting ? '✓ Таңдау режимі' : '📝 Жеке үй жұмысы'}
        </button>
        {selecting && <span className="text-sm text-slate-600">Қызыл/қызғылт сары ұяшықтарды басып таңдаңыз немесе баған атауын басып, «бағанды таңдау». Таңдалды: {sel.size} ұяшық, {selStudents.size} оқушы.</span>}
        {msg && <span className="text-sm text-emerald-700">{msg}</span>}
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 p-2 text-left">Оқушы</th>
              <th className="p-2 text-xs">Орт.</th>
              {objectives.map((o) => (
                <th key={o.id} className="p-1 align-bottom">
                  <button title={`${o.code} — ${o.text}`} onClick={() => setCol(col === o.id ? null : o.id)}
                    className={`whitespace-nowrap rounded px-1 font-mono text-[11px] hover:bg-slate-200 ${col === o.id ? 'bg-slate-200' : ''}`}
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    {o.code}{props.errors[o.id]?.length ? ' ⚠' : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white p-2"><Link href={`/results/progress?u=${s.id}`} className="text-brand-600 hover:underline">{s.name}</Link></td>
                <td className="p-1 text-center text-xs font-medium">{props.rowAvg[s.id] ?? '—'}</td>
                {objectives.map((o) => {
                  const c = cells[key(s.id, o.id)];
                  const b = band(c?.pct);
                  const k = key(s.id, o.id);
                  const chosen = sel.has(k);
                  const title = c ? `${s.name} · ${o.code}: ${c.pct}% (${c.n} дәлел${c.prev != null ? `, бұрын ${c.prev}%` : ''})` : `${s.name} · ${o.code}: дерек жоқ`;
                  const inner = (
                    <span className={`flex h-9 w-11 flex-col items-center justify-center rounded text-[11px] leading-tight ${BG[b]} ${c && c.n < 3 ? 'opacity-50' : ''} ${chosen ? 'ring-2 ring-sky-600 ring-offset-1' : ''}`}>
                      {c ? <><span className="font-semibold">{c.pct}{isDrop(c.pct, c.prev) ? '↓' : ''}</span><span className="opacity-80">{c.n}</span></> : '·'}
                    </span>
                  );
                  return (
                    <td key={o.id} className="p-0.5" title={title}>
                      {selecting ? (
                        <button className={personalEligible(c?.pct) ? 'cursor-pointer' : 'cursor-not-allowed'} onClick={() => toggle(s.id, o.id)}>{inner}</button>
                      ) : c ? (
                        <Link href={`/admin/heatmap/cell?class=${props.classId}&s=${s.id}&o=${o.id}`}>{inner}</Link>
                      ) : inner}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-medium">
              <td className="sticky left-0 bg-slate-50 p-2">Сынып орташасы</td>
              <td />
              {objectives.map((o) => { const v = props.colAvg[o.id]; return <td key={o.id} className="p-1 text-center"><span className={`inline-block w-11 rounded py-0.5 ${BG[band(v)]}`}>{v ?? '—'}</span></td>; })}
            </tr>
          </tbody>
        </table>
      </section>

      {colObj && (
        <section className="card space-y-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p><span className="font-mono text-xs text-slate-500">{colObj.code}</span> <MathText text={colObj.text} /> <span className="text-xs text-slate-500">· {colObj.unit}</span></p>
            <button className="btn btn-secondary text-xs" onClick={() => selectColumn(colObj.id)}>Бағанды таңдау (қызыл/қызғылт сары)</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(['red', 'orange', 'yellow', 'green', 'none'] as Band[]).map((b) => {
              const names = students.filter((s) => band(cells[key(s.id, colObj.id)]?.pct) === b);
              return (
                <div key={b} className="rounded-lg border border-slate-200 p-2">
                  <div className="mb-1 flex items-center gap-1 text-xs font-medium"><span className={`inline-block h-3 w-4 rounded ${BG[b]}`} />{b === 'none' ? 'дерек жоқ' : BANDS.find((x) => x.band === b)!.label} · {names.length}</div>
                  <ul className="text-xs text-slate-700">{names.map((s) => <li key={s.id}>{s.name}{cells[key(s.id, colObj.id)] ? ` — ${cells[key(s.id, colObj.id)].pct}%` : ''}</li>)}</ul>
                </div>
              );
            })}
          </div>
          {(props.errors[colObj.id] ?? []).length > 0 && (
            <div>
              <p className="mb-1 font-medium">Сынып бойынша жиі қателер</p>
              <ul className="list-disc pl-5">{props.errors[colObj.id].map((e) => <li key={e.reason}><MathText text={e.reason} /> — {e.students} оқушы</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {selecting && sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 text-sm">
            <span className="mr-auto">{selStudents.size} оқушыға, әрқайсысына өз қиналған мақсаттары бойынша</span>
            <label className="flex items-center gap-1">Мақсатқа <select className="input py-1" value={perObj} onChange={(e) => setPerObj(Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select> есеп</label>
            <label className="flex items-center gap-1">Мерзімі <input type="datetime-local" className="input py-1" value={due} onChange={(e) => setDue(e.target.value)} /></label>
            <button className="btn btn-secondary" onClick={() => setSel(new Set())}>Тазалау</button>
            <button className="btn btn-primary" onClick={create} disabled={busy}>{busy ? 'Құрастырылуда…' : 'Жеке үй жұмысын беру'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
