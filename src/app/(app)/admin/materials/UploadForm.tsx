'use client';

import { useActionState, useState } from 'react';
import { uploadMaterial, type UploadState } from './actions';

interface Unit { id: string; grade: number; title: string; topics: { id: string; title: string }[] }

const TYPES: [string, string][] = [
  ['presentation', 'Презентация'], ['worksheet', 'Жұмыс парағы'], ['theory', 'Теория'], ['solution', 'Шешім'],
  ['extra_problems', 'Қосымша есептер'], ['link', 'Сілтеме'], ['other', 'Басқа'],
];

export function UploadForm({ units }: { units: Unit[] }) {
  const [state, action, pending] = useActionState<UploadState | null, FormData>(uploadMaterial, null);
  const [grade, setGrade] = useState(7);
  const [unitId, setUnitId] = useState('');
  const gradeUnits = units.filter((u) => u.grade === grade);
  const topics = gradeUnits.find((u) => u.id === unitId)?.topics ?? [];

  return (
    <form action={action} className="card space-y-3">
      <div><label className="label" htmlFor="title">Атауы</label><input id="title" name="title" className="input" required /></div>
      <div><label className="label" htmlFor="description">Сипаттама</label><textarea id="description" name="description" className="input" rows={2} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="grade">Сынып</label>
          <select id="grade" name="grade" className="input" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setUnitId(''); }}>
            {[7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="type">Түрі</label>
          <select id="type" name="type" className="input">{TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="unit_id">Бөлім</label>
        <select id="unit_id" name="unit_id" className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">—</option>
          {gradeUnits.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="topic_id">Тақырып</label>
        <select id="topic_id" name="topic_id" className="input" disabled={!topics.length}>
          <option value="">—</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="language">Тіл</label><select id="language" name="language" className="input"><option value="kk">Қазақша</option><option value="ru">Орысша</option><option value="en">English</option></select></div>
        <div><label className="label" htmlFor="status">Мәртебе</label><select id="status" name="status" className="input"><option value="draft">Draft</option><option value="published">Бірден жариялау</option></select></div>
      </div>
      <div>
        <label className="label" htmlFor="files">Файлдар (PDF, PPTX, DOCX, PNG, JPG · ≤30 МБ)</label>
        <input id="files" name="files" type="file" multiple accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg" className="block w-full text-sm" />
      </div>
      <div><label className="label" htmlFor="external_url">немесе сілтеме</label><input id="external_url" name="external_url" type="url" className="input" placeholder="https://" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label" htmlFor="source">Дереккөз</label><input id="source" name="source" className="input" placeholder="Авторлық" /></div>
        <div><label className="label" htmlFor="license">Лицензия</label><input id="license" name="license" className="input" /></div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="rights_confirmed" required className="mt-1" />
        Бұл материалды платформада пайдалануға/таратуға құқығым бар екенін растаймын.
      </label>
      {state && <div className={state.ok ? 'ok-box' : 'error-box'} role="status">{state.message}</div>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? 'Жүктелуде…' : 'Сақтау'}</button>
    </form>
  );
}
