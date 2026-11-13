'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, failureText } from '@/lib/client-api';

export function NewAssignment({ classes, materials }: { classes: { id: string; name: string; grade: number }[]; materials: { id: string; title: string; grade: number }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState(8);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const due = String(fd.get('due') || '');
    setBusy(true);
    setErr([]);
    const r = await apiFetch<{ id: string }>('/api/admin/homework', {
      method: 'POST',
      json: {
        action: 'create',
        title: String(fd.get('title') || ''),
        description: String(fd.get('description') || ''),
        grade,
        class_id: String(fd.get('class_id') || '') || null,
        material_id: String(fd.get('material_id') || '') || null,
        // datetime-local → Қазақстан уақыты (UTC+5)
        due_at: due ? `${due}:00+05:00` : null,
        max_score: Number(fd.get('max_score') || 10),
        answer_text: String(fd.get('answer_text') || ''),
      },
    });
    setBusy(false);
    if (!r.ok) return setErr(failureText(r.failure));
    router.push(`/admin/homework/${r.data.id}`);
  }

  if (!open) return <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>+ Жаңа тапсырма</button>;

  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="title">Атауы</label>
        <input id="title" name="title" required maxLength={200} className="input" placeholder="Мысалы: §4.6 үй жұмысы — №4.54, №4.56" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="description">Тапсырма (оқушыға көрінеді)</label>
        <textarea id="description" name="description" className="input min-h-24" maxLength={5000} placeholder="Қандай есептерді шығару керек, қалай рәсімдеу керек…" />
      </div>
      <div>
        <label className="label" htmlFor="grade">Сынып</label>
        <select id="grade" className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
          {[7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}-сынып</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="class_id">Кімге</label>
        <select id="class_id" name="class_id" className="input">
          <option value="">{grade}-сыныптың барлық оқушылары</option>
          {classes.filter((c) => c.grade === grade).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="due">Мерзімі</label>
        <input id="due" name="due" type="datetime-local" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="max_score">Ең жоғары баға</label>
        <input id="max_score" name="max_score" type="number" min={1} max={100} step="0.5" defaultValue={10} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="material_id">Материал тіркеу (міндетті емес)</label>
        <select id="material_id" name="material_id" className="input">
          <option value="">—</option>
          {materials.filter((m) => m.grade === grade).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="answer_text">Жауаптар / бағалау критерийі (тек сізге көрінеді)</label>
        <textarea id="answer_text" name="answer_text" className="input min-h-20" maxLength={10000} placeholder="№4.54: а) 1/sin²α … Әр есеп 2 балл…" />
      </div>
      {err.length > 0 && <div className="text-sm text-red-700 sm:col-span-2">{err.map((e) => <div key={e}>{e}</div>)}</div>}
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={busy} className="btn btn-primary">{busy ? 'Сақталуда…' : 'Тапсырманы беру'}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Болдырмау</button>
      </div>
    </form>
  );
}
