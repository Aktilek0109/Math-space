'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, failureText } from '@/lib/client-api';

export interface TopicGroup { label: string; topics: { id: string; title: string }[] }

export function LessonForm({ classId, day, groups, suggested, hasLesson }: { classId: string; day: string; groups: TopicGroup[]; suggested: string; hasLesson: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasLesson);
  const [topic, setTopic] = useState(suggested);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [hw, setHw] = useState('');
  const [online, setOnline] = useState(false);
  const [maxScore, setMaxScore] = useState('10');
  const [key, setKey] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:underline">+ Тағы бір сабақ қосу</button>;

  async function save() {
    setBusy(true); setErr('');
    const r = await apiFetch('/api/admin/lessons', {
      method: 'POST',
      json: {
        action: 'create', class_id: classId, lesson_date: day,
        topic_id: topic || null, title, note, homework_text: hw,
        online: online ? { max_score: Number(maxScore) || 10, answer_text: key, due_at: due ? new Date(due).toISOString() : null } : null,
      },
    });
    setBusy(false);
    if (!r.ok) return setErr(failureText(r.failure).join(' '));
    setTitle(''); setNote(''); setHw(''); setKey(''); setDue(''); setOnline(false); setOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <div>
        <label className="label">Тақырып (КТП бойынша)</label>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="input">
          <option value="">— тізімде жоқ (атауын төменде жазыңыз) —</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.topics.map((t) => <option key={t.id} value={t.id}>{t.title}{t.id === suggested ? '  ← келесі' : ''}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">{topic ? 'Қосымша (міндетті емес)' : 'Сабақ атауы'}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" maxLength={200} placeholder={topic ? 'Мысалы: есептер шығару, БЖБ' : 'Мысалы: Қайталау'} />
        </div>
        <div>
          <label className="label">Сабақта не істедік (міндетті емес)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input" maxLength={2000} placeholder="Мысалы: №4.50–4.53 сыныпта шығардық" />
        </div>
      </div>
      <div>
        <label className="label">Үй тапсырмасы</label>
        <input value={hw} onChange={(e) => setHw(e.target.value)} className="input" maxLength={2000} placeholder="Мысалы: №4.54, 4.56 (а, б)" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} />
        Оқушылар сайтқа фото арқылы тапсырсын (AI алдын ала тексереді)
      </label>
      {online && (
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className="label">Ең жоғары баға</label>
            <input value={maxScore} onChange={(e) => setMaxScore(e.target.value)} inputMode="decimal" className="input" />
          </div>
          <div>
            <label className="label">Мерзімі (міндетті емес)</label>
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="input" />
          </div>
          <div className="sm:col-span-3">
            <label className="label">Жауап кілті — тек сізге және AI-ға</label>
            <textarea value={key} onChange={(e) => setKey(e.target.value)} className="input min-h-16" placeholder="1) 12; 2) -3; 3) x=5" />
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={busy} className="btn btn-primary">{busy ? 'Сақталуда…' : 'Сақтау'}</button>
        {hasLesson && <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Бас тарту</button>}
        {err && <span className="text-sm text-red-700">{err}</span>}
      </div>
    </div>
  );
}

export function DeleteLesson({ id }: { id: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" onClick={() => setAsk(true)} className="text-xs text-red-600 hover:underline">өшіру</button>;
  return (
    <span className="flex items-center gap-2 text-xs">
      Өшіру керек пе?
      <button type="button" className="text-red-700 underline" onClick={async () => {
        const r = await apiFetch('/api/admin/lessons', { method: 'POST', json: { action: 'delete', id } });
        if (r.ok) router.refresh();
      }}>иә</button>
      <button type="button" className="underline" onClick={() => setAsk(false)}>жоқ</button>
    </span>
  );
}
