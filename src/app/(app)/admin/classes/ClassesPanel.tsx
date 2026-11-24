'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, failureText } from '@/lib/client-api';
import { ErrorBox } from '@/components/ErrorBox';

export interface Person { id: string; username: string; full_name: string; current_grade: number | null }
export interface ClassRow { id: string; name: string; grade: number; academic_year: string; students: Person[]; teachers: Person[] }

const label = (p: Person) => `${p.full_name || p.username} (${p.username})`;

export function ClassesPanel({ classes, teachers, students, unassigned }: { classes: ClassRow[]; teachers: Person[]; students: Person[]; unassigned: Person[] }) {
  const router = useRouter();
  const [error, setError] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(json: object) {
    setBusy(true);
    setError(null);
    const res = await apiFetch('/api/admin/classes', { method: 'POST', json });
    setBusy(false);
    if (!res.ok) return setError(failureText(res.failure));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ErrorBox lines={error} />

      {unassigned.length > 0 && (
        <section className="card space-y-2 border-amber-300 bg-amber-50 text-sm">
          <h2 className="font-semibold text-amber-900">Сыныпқа қосылмаған оқушылар ({unassigned.length}) — үй тапсырмасын көрмейді</h2>
          <ul className="space-y-1">
            {unassigned.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span>{label(s)}{s.current_grade ? ` · ${s.current_grade}-сынып` : ''}</span>
                <select className="input w-auto py-1" defaultValue="" disabled={busy} aria-label="Сынып"
                  onChange={(e) => e.target.value && post({ action: 'add_student', class_id: e.target.value, student_id: s.id })}>
                  <option value="">сыныпқа қосу…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {classes.map((c) => (
          <section key={c.id} className="card space-y-3 text-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{c.name}</h2>
              <span className="text-slate-500">{c.grade}-сынып · {c.academic_year} · {c.students.length} оқушы</span>
            </div>

            <div className="space-y-1">
              <div className="font-medium">Мұғалім</div>
              {c.teachers.length === 0 && <p className="text-amber-700">Мұғалім бекітілмеген</p>}
              {c.teachers.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2">
                  <span>{label(t)}</span>
                  <button className="btn btn-secondary px-2 py-0.5 text-xs" disabled={busy} onClick={() => post({ action: 'remove_teacher', class_id: c.id, teacher_id: t.id })}>алып тастау</button>
                </div>
              ))}
              <select className="input py-1" defaultValue="" disabled={busy} aria-label="Мұғалім бекіту"
                onChange={(e) => e.target.value && post({ action: 'add_teacher', class_id: c.id, teacher_id: e.target.value })}>
                <option value="">+ мұғалім бекіту…</option>
                {teachers.filter((t) => !c.teachers.some((x) => x.id === t.id)).map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}
              </select>
            </div>

            <details>
              <summary className="cursor-pointer font-medium">Оқушылар ({c.students.length})</summary>
              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                {c.students.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span>{label(s)}</span>
                    <button className="btn btn-secondary px-2 py-0.5 text-xs" disabled={busy} onClick={() => post({ action: 'remove_student', class_id: c.id, student_id: s.id })}>шығару</button>
                  </li>
                ))}
              </ul>
              <select className="input mt-2 py-1" defaultValue="" disabled={busy} aria-label="Оқушы қосу"
                onChange={(e) => e.target.value && post({ action: 'add_student', class_id: c.id, student_id: e.target.value })}>
                <option value="">+ оқушы қосу (басқа сыныптан ауыстырылады)…</option>
                {students.filter((s) => !c.students.some((x) => x.id === s.id)).map((s) => <option key={s.id} value={s.id}>{label(s)}{s.current_grade ? ` · ${s.current_grade}` : ''}</option>)}
              </select>
            </details>
          </section>
        ))}
      </div>

      <form className="card flex flex-wrap items-end gap-2 text-sm"
        onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); post({ action: 'create_class', name: String(f.get('name') ?? ''), grade: Number(f.get('grade')) }); e.currentTarget.reset(); }}>
        <div><label className="label">Жаңа сынып</label><input name="name" placeholder="мысалы 9А" className="input w-32" required /></div>
        <div><label className="label">Сынып деңгейі</label><select name="grade" className="input w-24">{[7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
        <button className="btn btn-primary" disabled={busy}>Ашу</button>
      </form>
    </div>
  );
}
