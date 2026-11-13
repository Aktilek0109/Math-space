'use client';

import { useMemo, useState } from 'react';
import { apiFetch, failureText } from '@/lib/client-api';
import { ErrorBox } from '@/components/ErrorBox';

interface Unit { id: string; grade: number; term: number | null; title: string }

export function PracticeForm({ units, defaultGrade }: { units: Unit[]; defaultGrade: number }) {
  const [grade, setGrade] = useState(defaultGrade);
  const [examType, setExamType] = useState<'BZhB' | 'TZhB'>('BZhB');
  const [term, setTerm] = useState<number | 0>(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => units.filter((u) => u.grade === grade && (!term || u.term === term)), [units, grade, term]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const timeLimit = Number(fd.get('time_limit_min'));
    const difficulty = Number(fd.get('difficulty'));
    const unitIds = selected.length ? selected : visible.map((u) => u.id);
    const res = await apiFetch<{ redirect: string }>('/api/practice/generate', {
      method: 'POST',
      json: {
        exam_type: examType,
        grade,
        unit_ids: unitIds,
        count: Number(fd.get('count')),
        difficulty: difficulty || undefined,
        time_limit_min: timeLimit || undefined,
        mode: fd.get('mode'),
        use_templates: fd.get('use_templates') === 'on',
      },
    });
    if (!res.ok) {
      setError(failureText(res.failure));
      setBusy(false);
      return;
    }
    window.location.assign(res.data.redirect);
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5">
      <fieldset>
        <legend className="label">Түрі</legend>
        <div className="flex gap-2">
          {(['BZhB', 'TZhB'] as const).map((t) => (
            <button type="button" key={t} onClick={() => setExamType(t)} className={`btn ${examType === t ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={examType === t}>
              {t === 'BZhB' ? 'БЖБ' : 'ТЖБ'}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="grade" className="label">Сынып</label>
          <select id="grade" className="input" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setSelected([]); }}>
            {[7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}-сынып</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="term" className="label">Тоқсан</label>
          <select id="term" className="input" value={term} onChange={(e) => { setTerm(Number(e.target.value)); setSelected([]); }}>
            <option value={0}>Барлығы</option>
            {[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}-тоқсан</option>)}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="label">Бөлімдер {selected.length === 0 && <span className="font-normal text-slate-500">(таңдалмаса — барлығы)</span>}</legend>
        <div className="space-y-1">
          {visible.length === 0 && <p className="text-sm text-slate-500">Бұл сыныпта бөлім жоқ.</p>}
          {visible.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(u.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id)))}
              />
              {u.term ? `${u.term}-тоқсан · ` : ''}{u.title}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="count" className="label">Есеп саны</label>
          <input id="count" name="count" type="number" min={1} max={40} defaultValue={10} className="input" />
        </div>
        <div>
          <label htmlFor="difficulty" className="label">Күрделілік</label>
          <select id="difficulty" name="difficulty" className="input" defaultValue="0">
            <option value="0">Аралас</option>
            <option value="1">Жеңіл</option>
            <option value="2">Орташа</option>
            <option value="3">Күрделі</option>
          </select>
        </div>
        <div>
          <label htmlFor="time_limit_min" className="label">Уақыт (мин)</label>
          <input id="time_limit_min" name="time_limit_min" type="number" min={0} max={240} placeholder="шектеусіз" className="input" />
        </div>
      </div>

      <fieldset>
        <legend className="label">Жауап көрсету</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" value="practice" defaultChecked /> Әр есептен кейін шешімін көру (жаттығу)</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" value="exam" /> Тек соңында (емтихан)</label>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="use_templates" defaultChecked /> Банк жетпесе — параметрленген үлгілерден жаңа есеп жасау
      </label>

      <ErrorBox lines={error} />
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Құрастырылуда…' : 'Нұсқа құрастыру'}</button>
    </form>
  );
}
