'use client';

import { useState } from 'react';
import { apiFetch, failureText } from '@/lib/client-api';
import { ErrorBox } from '@/components/ErrorBox';
import { MathText } from '@/components/MathText';

interface Unit { id: string; grade: number; title: string; topics: { id: string; title: string }[] }
type QType = 'single' | 'multi' | 'numeric' | 'short' | 'open';
const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];

export function QuestionForm({ units }: { units: Unit[] }) {
  const [grade, setGrade] = useState(7);
  const [unitId, setUnitId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [type, setType] = useState<QType>('single');
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState<string[]>([]);
  const [value, setValue] = useState('');
  const [tolerance, setTolerance] = useState('0');
  const [accepted, setAccepted] = useState('');
  const [solution, setSolution] = useState('');
  const [rubric, setRubric] = useState('');
  const [error, setError] = useState<string[] | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const gradeUnits = units.filter((u) => u.grade === grade);
  const topics = gradeUnits.find((u) => u.id === unitId)?.topics ?? [];

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    const opts = options.map((t, i) => ({ id: IDS[i], text: t })).filter((o) => o.text.trim());
    const answer =
      type === 'single' ? { correct: correct[0] }
      : type === 'multi' ? { correct }
      : type === 'numeric' ? { value: Number(value.replace(',', '.')), tolerance: Number(tolerance.replace(',', '.')) || 0 }
      : type === 'short' ? { accepted: accepted.split('|').map((s) => s.trim()).filter(Boolean) }
      : {};
    // Дескриптор: әр жол "мәтін ; ұпай"
    const rubricLines = rubric.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [d, m] = l.split(';');
      return { descriptor: d.trim(), marks: Number(m) || 1 };
    });
    const res = await apiFetch<{ id: string }>('/api/admin/questions', {
      method: 'POST',
      json: {
        grade,
        unit_id: unitId || null,
        topic_ids: topicId ? [topicId] : [],
        question_type: type,
        text,
        options: type === 'single' || type === 'multi' ? opts : [],
        marks: Number(fd.get('marks')),
        difficulty: Number(fd.get('difficulty')),
        exam_types: fd.getAll('exam_types'),
        exam_year: fd.get('exam_year') ? Number(fd.get('exam_year')) : null,
        component: (fd.get('component') as string) || null,
        source_kind: fd.get('source_kind'),
        source: (fd.get('source') as string) || null,
        answer,
        solution,
        rubric: rubricLines,
        status: fd.get('status'),
      },
    });
    setBusy(false);
    if (!res.ok) return setError(failureText(res.failure));
    setOk('Есеп сақталды');
    setText(''); setOptions(['', '', '', '']); setCorrect([]); setValue(''); setAccepted(''); setSolution(''); setRubric('');
  }

  return (
    <form onSubmit={submit} className="card space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <div><label className="label">Сынып</label>
          <select className="input" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setUnitId(''); setTopicId(''); }}>
            {[7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}</option>)}
          </select></div>
        <div className="col-span-2"><label className="label">Бөлім</label>
          <select className="input" value={unitId} onChange={(e) => { setUnitId(e.target.value); setTopicId(''); }}>
            <option value="">—</option>{gradeUnits.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
          </select></div>
      </div>
      <div><label className="label">Тақырып</label>
        <select className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!topics.length}>
          <option value="">—</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select></div>
      <div><label className="label">Түрі</label>
        <select className="input" value={type} onChange={(e) => { setType(e.target.value as QType); setCorrect([]); }}>
          <option value="single">Бір дұрыс жауап</option><option value="multi">Бірнеше дұрыс жауап</option>
          <option value="numeric">Сандық жауап</option><option value="short">Қысқа жауап</option><option value="open">Ашық есеп</option>
        </select></div>
      <div>
        <label className="label">Шарты (формула: $x^2$)</label>
        <textarea className="input font-mono" rows={3} value={text} onChange={(e) => setText(e.target.value)} required />
        {text && <div className="mt-1 rounded bg-slate-50 p-2"><MathText text={text} /></div>}
      </div>

      {(type === 'single' || type === 'multi') && (
        <fieldset className="space-y-1">
          <legend className="label">Нұсқалар (дұрысын белгілеңіз)</legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type={type === 'single' ? 'radio' : 'checkbox'} name="correct" aria-label={`${IDS[i]} дұрыс`}
                checked={correct.includes(IDS[i])}
                onChange={(e) => setCorrect(type === 'single' ? [IDS[i]] : e.target.checked ? [...correct, IDS[i]] : correct.filter((c) => c !== IDS[i]))} />
              <span>{IDS[i]})</span>
              <input className="input" value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
            </div>
          ))}
          {options.length < 6 && <button type="button" className="text-brand-600" onClick={() => setOptions([...options, ''])}>+ нұсқа</button>}
        </fieldset>
      )}
      {type === 'numeric' && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Дұрыс жауап</label><input className="input" value={value} onChange={(e) => setValue(e.target.value)} required /></div>
          <div><label className="label">Дәлдік (±)</label><input className="input" value={tolerance} onChange={(e) => setTolerance(e.target.value)} /></div>
        </div>
      )}
      {type === 'short' && <div><label className="label">Қабылданатын жауаптар ( | арқылы)</label><input className="input" value={accepted} onChange={(e) => setAccepted(e.target.value)} required /></div>}

      <div><label className="label">Толық шешуі</label><textarea className="input font-mono" rows={2} value={solution} onChange={(e) => setSolution(e.target.value)} /></div>
      <div><label className="label">Дескриптор (әр жол: мәтін ; ұпай)</label><textarea className="input" rows={2} value={rubric} onChange={(e) => setRubric(e.target.value)} placeholder="Теңдеу құрады ; 1" /></div>

      <div className="grid grid-cols-3 gap-2">
        <div><label className="label">Ұпай</label><input name="marks" type="number" min={0.5} step={0.5} defaultValue={1} className="input" /></div>
        <div><label className="label">Деңгей</label><select name="difficulty" className="input" defaultValue="2"><option value="1">Жеңіл</option><option value="2">Орташа</option><option value="3">Күрделі</option></select></div>
        <div><label className="label">Мәртебе</label><select name="status" className="input"><option value="draft">Draft</option><option value="published">Жариялау</option></select></div>
      </div>
      <fieldset className="flex gap-3"><legend className="label">Қолданылуы</legend>
        <label><input type="checkbox" name="exam_types" value="BZhB" defaultChecked /> БЖБ</label>
        <label><input type="checkbox" name="exam_types" value="TZhB" defaultChecked /> ТЖБ</label>
        <label><input type="checkbox" name="exam_types" value="MESK" /> МЭСК</label>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">МЭСК компоненті</label><input name="component" className="input" placeholder="Paper 1" /></div>
        <div><label className="label">Жылы</label><input name="exam_year" type="number" className="input" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Дереккөз түрі</label><select name="source_kind" className="input"><option value="authored">Авторлық</option><option value="adapted">Бейімделген</option><option value="past_exam">Өткен емтихан</option></select></div>
        <div><label className="label">Дереккөз</label><input name="source" className="input" /></div>
      </div>
      <ErrorBox lines={error} />
      {ok && <div className="ok-box">{ok}</div>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Сақталуда…' : 'Сақтау'}</button>
    </form>
  );
}
