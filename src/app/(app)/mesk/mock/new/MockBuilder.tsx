'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, failureText } from '@/lib/client-api';
import { ErrorBox } from '@/components/ErrorBox';

interface Unit { id: string; grade: number; title: string }
interface Blueprint { id: string; title: string; grade: number; component: string | null; duration_min: number | null }
interface Availability { unit_id: string; title: string; count: number; marks: number }
interface Preview { availability: Availability[]; total_available: number; shortages: { message: string }[] }

export function MockBuilder({ units, blueprints, defaultGrade }: { units: Unit[]; blueprints: Blueprint[]; defaultGrade: number }) {
  const [grade, setGrade] = useState(defaultGrade);
  const [source, setSource] = useState<'custom' | string>('custom');
  const [selected, setSelected] = useState<string[]>([]);
  const [by, setBy] = useState<'count' | 'marks'>('count');
  const [amount, setAmount] = useState(10);
  const [difficulty, setDifficulty] = useState(0);
  const [component, setComponent] = useState('');
  const [timeLimit, setTimeLimit] = useState(40);
  const [mode, setMode] = useState<'exam' | 'practice'>('exam');
  const [noRepeat, setNoRepeat] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const gradeUnits = useMemo(() => units.filter((u) => u.grade === grade), [units, grade]);
  const gradeBlueprints = blueprints.filter((b) => b.grade === grade);

  const payload = (previewOnly: boolean) => {
    const base = { grade, mode, no_repeat: noRepeat, preview: previewOnly, time_limit_min: timeLimit || undefined };
    if (source !== 'custom') return { ...base, blueprint_id: source };
    return {
      ...base,
      unit_ids: selected.length ? selected : gradeUnits.map((u) => u.id),
      component: component || undefined,
      difficulty: difficulty || undefined,
      ...(by === 'count' ? { count: amount } : { total_marks: amount }),
    };
  };

  // Параметр өзгерген сайын қолжетімділікті санау (MESK-04)
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await apiFetch<Preview>('/api/mesk/mocks', { method: 'POST', json: payload(true) });
      if (res.ok) setPreview(res.data);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade, source, selected, by, amount, difficulty, component, noRepeat]);

  async function build() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ redirect: string }>('/api/mesk/mocks', { method: 'POST', json: payload(false) });
    if (!res.ok) {
      setError(failureText(res.failure));
      setBusy(false);
      return;
    }
    window.location.assign(res.data.redirect);
  }

  const canBuild = preview ? preview.shortages.length === 0 && preview.total_available > 0 : false;

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="grade">Сынып</label>
            <select id="grade" className="input" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setSelected([]); setSource('custom'); }}>
              {[10, 12].map((g) => <option key={g} value={g}>{g}-сынып</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="source">Формат</label>
            <select id="source" className="input" value={source} onChange={(e) => {
              setSource(e.target.value);
              const bp = blueprints.find((b) => b.id === e.target.value);
              if (bp?.duration_min) setTimeLimit(bp.duration_min);
            }}>
              <option value="custom">Өзім таңдаймын</option>
              {gradeBlueprints.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>
        </div>

        {source === 'custom' && (
          <>
            <fieldset>
              <legend className="label">Бөлімдер {selected.length === 0 && <span className="font-normal text-slate-500">(таңдалмаса — барлығы)</span>}</legend>
              {gradeUnits.map((u) => {
                const av = preview?.availability.find((a) => a.unit_id === u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.includes(u.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id)))} />
                    {u.title}
                    <span className="text-xs text-slate-500">({av ? `${av.count} есеп, ${av.marks} ұпай` : '0 есеп'})</span>
                  </label>
                );
              })}
            </fieldset>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="label" htmlFor="by">Өлшем</label>
                <select id="by" className="input" value={by} onChange={(e) => setBy(e.target.value as 'count' | 'marks')}>
                  <option value="count">Есеп саны</option>
                  <option value="marks">Жалпы ұпай</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="amount">{by === 'count' ? 'Саны' : 'Ұпай'}</label>
                <input id="amount" type="number" min={1} max={200} className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 1)} />
              </div>
              <div>
                <label className="label" htmlFor="difficulty">Деңгей</label>
                <select id="difficulty" className="input" value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
                  <option value={0}>Аралас</option><option value={1}>Жеңіл</option><option value={2}>Орташа</option><option value={3}>Күрделі</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="component">Компонент</label>
                <input id="component" className="input" placeholder="Paper 1" value={component} onChange={(e) => setComponent(e.target.value)} />
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="time">Уақыт шектеуі (мин)</label>
            <input id="time" type="number" min={0} max={300} className="input" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} />
          </div>
          <div>
            <label className="label" htmlFor="mode">Режим</label>
            <select id="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as 'exam' | 'practice')}>
              <option value="exam">Емтихан — жауаптар соңында</option>
              <option value="practice">Жаттығу — әр есептен кейін</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={noRepeat} onChange={(e) => setNoRepeat(e.target.checked)} /> Бұрын шешкен есептерді қоспау
        </label>
      </div>

      <div className="card space-y-2 text-sm" aria-live="polite">
        {preview ? (
          <>
            <p>Қолжетімді есептер: <b>{preview.total_available}</b></p>
            {preview.shortages.length > 0 && (
              <div className="error-box space-y-1">
                <p className="font-medium">Бұл параметрлермен толық пробный жасалмайды:</p>
                {preview.shortages.map((s, i) => <p key={i}>• {s.message}</p>)}
              </div>
            )}
          </>
        ) : (
          <p className="text-slate-500">Есептеліп жатыр…</p>
        )}
      </div>

      <ErrorBox lines={error} />
      <button className="btn btn-primary w-full" onClick={build} disabled={busy || !canBuild}>{busy ? 'Құрастырылуда…' : 'Пробный бастау'}</button>
    </div>
  );
}
