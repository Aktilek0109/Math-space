'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MathText } from '@/components/MathText';
import { ErrorBox } from '@/components/ErrorBox';
import { apiFetch, failureText } from '@/lib/client-api';

interface Unit { id: string; grade: number; term: number | null; title: string; topics: { id: string; title: string }[] }
interface Criterion { descriptor: string; marks: number }
interface Q {
  id: string;
  question_type: string;
  body: { text: string; options?: { id: string; text: string }[] };
  marks: number;
  difficulty: number;
  criteria: Criterion[];
}
interface Obj { id: string; code: string; text: string }
interface Group { objective: Obj; available: number; items: Q[] }

const LEVEL = ['', 'Жеңіл', 'Орташа', 'Күрделі'];

export function Composer({ classes, units, initial }: {
  classes: { id: string; name: string; grade: number }[];
  units: Unit[];
  initial: { grade: number; classId: string; topicId: string; lessonId: string };
}) {
  const router = useRouter();
  const [grade, setGrade] = useState(initial.grade);
  const [classId, setClassId] = useState(initial.classId);
  const [topicId, setTopicId] = useState(initial.topicId);
  const [groups, setGroups] = useState<Group[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [desc, setDesc] = useState('');

  const gradeUnits = useMemo(() => units.filter((u) => u.grade === grade), [units, grade]);
  const topic = gradeUnits.flatMap((u) => u.topics).find((t) => t.id === topicId);
  const gradeClasses = classes.filter((c) => c.grade === grade);

  async function suggest(tid = topicId) {
    if (!tid) return;
    setBusy(true);
    setErr(null);
    const r = await apiFetch<{ objectives: Group[] }>('/api/admin/homework/compose', { method: 'POST', json: { action: 'suggest', topic_id: tid, class_id: classId || null } });
    setBusy(false);
    if (!r.ok) { setGroups([]); return setErr(failureText(r.failure)); }
    setGroups(r.data.objectives);
    const t = gradeUnits.flatMap((u) => u.topics).find((x) => x.id === tid);
    if (t && !title) setTitle(`Үй жұмысы: ${t.title}`);
  }

  useEffect(() => {
    if (initial.topicId) suggest(initial.topicId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allIds = groups.flatMap((g) => g.items.map((q) => q.id));

  async function swap(gi: number, qi: number) {
    const g = groups[gi];
    setBusy(true);
    const r = await apiFetch<{ item: Q }>('/api/admin/homework/compose', {
      method: 'POST',
      json: { action: 'swap', objective_id: g.objective.id, class_id: classId || null, exclude: allIds, difficulty: g.items[qi].difficulty },
    });
    setBusy(false);
    if (!r.ok) return setErr(failureText(r.failure));
    setGroups((gs) => gs.map((x, i) => (i !== gi ? x : { ...x, items: x.items.map((q, j) => (j === qi ? r.data.item : q)) })));
  }

  async function add(gi: number) {
    const g = groups[gi];
    setBusy(true);
    const r = await apiFetch<{ item: Q }>('/api/admin/homework/compose', { method: 'POST', json: { action: 'swap', objective_id: g.objective.id, class_id: classId || null, exclude: allIds } });
    setBusy(false);
    if (!r.ok) return setErr(failureText(r.failure));
    setGroups((gs) => gs.map((x, i) => (i !== gi ? x : { ...x, items: [...x.items, r.data.item] })));
  }

  const remove = (gi: number, qi: number) => setGroups((gs) => gs.map((x, i) => (i !== gi ? x : { ...x, items: x.items.filter((_, j) => j !== qi) })));
  const setCrit = (gi: number, qi: number, ci: number, patch: Partial<Criterion>) =>
    setGroups((gs) => gs.map((x, i) => (i !== gi ? x : { ...x, items: x.items.map((q, j) => (j !== qi ? q : { ...q, criteria: q.criteria.map((c, k) => (k === ci ? { ...c, ...patch } : c)) })) })));

  const total = groups.reduce((s, g) => s + g.items.reduce((t, q) => t + q.marks, 0), 0);
  const count = groups.reduce((s, g) => s + g.items.length, 0);
  const badSum = groups.flatMap((g) => g.items).find((q) => Math.abs(q.criteria.reduce((s, c) => s + Number(c.marks || 0), 0) - q.marks) > 1e-6);

  async function publish() {
    setBusy(true);
    setErr(null);
    const r = await apiFetch<{ redirect: string }>('/api/admin/homework/compose', {
      method: 'POST',
      json: {
        action: 'publish',
        title, description: desc, topic_id: topicId, grade,
        class_id: classId || null,
        due_at: due ? `${due}:00+05:00` : null,
        lesson_id: initial.lessonId || null,
        items: groups.flatMap((g) => g.items.map((q) => ({ question_id: q.id, objective_id: g.objective.id, criteria: q.criteria.map((c) => ({ descriptor: c.descriptor, marks: Number(c.marks) })) }))),
      },
    });
    setBusy(false);
    if (!r.ok) return setErr(failureText(r.failure));
    router.push(r.data.redirect);
  }

  return (
    <div className="space-y-4">
      <section className="card grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="g">Сынып (параллель)</label>
          <select id="g" className="input" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setClassId(''); setTopicId(''); setGroups([]); }}>
            {[...new Set(units.map((u) => u.grade))].map((g) => <option key={g} value={g}>{g}-сынып</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="c">Кімге</label>
          <select id="c" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">{grade}-сыныптың барлығы</option>
            {gradeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="t">Тақырып</label>
          <select id="t" className="input" value={topicId} onChange={(e) => { setTopicId(e.target.value); setGroups([]); suggest(e.target.value); }}>
            <option value="">— таңдаңыз —</option>
            {gradeUnits.map((u) => (
              <optgroup key={u.id} label={`${u.term ? `${u.term}-тоқсан · ` : ''}${u.title}`}>
                {u.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </section>

      <ErrorBox lines={err} />
      {busy && !groups.length && <div className="card text-slate-500">Банктен есептер іріктелуде…</div>}

      {groups.map((g, gi) => (
        <section key={g.objective.id} className="card space-y-3">
          <header>
            <div className="text-xs font-semibold text-brand-700">{g.objective.code}</div>
            <h2 className="font-semibold">{g.objective.text}</h2>
            <p className="text-xs text-slate-500">Банкте осы мақсатқа {g.available} есеп бар</p>
          </header>
          {g.items.length === 0 && <p className="text-sm text-slate-500">Бұл мақсатқа есеп таңдалмаған — үй жұмысына кірмейді.</p>}
          {g.items.map((q, qi) => {
            const sum = q.criteria.reduce((s, c) => s + Number(c.marks || 0), 0);
            return (
              <div key={q.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="chip">{LEVEL[q.difficulty]}</span>
                  <span className="chip">{q.marks} ұпай</span>
                  <span className="chip">{q.question_type === 'single' ? 'Таңдау + негіздеу' : 'Шешу жолы + жауап'}</span>
                  <span className="ml-auto flex gap-2">
                    <button type="button" className="btn btn-secondary px-2 py-1 text-xs" disabled={busy} onClick={() => swap(gi, qi)}>↻ Ауыстыру</button>
                    <button type="button" className="btn btn-secondary px-2 py-1 text-xs text-red-700" disabled={busy} onClick={() => remove(gi, qi)}>✕</button>
                  </span>
                </div>
                <MathText text={q.body.text} />
                {q.body.options && (
                  <ul className="grid gap-1 text-sm sm:grid-cols-2">
                    {q.body.options.map((o) => <li key={o.id}><b>{o.id})</b> <MathText text={o.text} /></li>)}
                  </ul>
                )}
                <details className="text-sm" open={Math.abs(sum - q.marks) > 1e-6}>
                  <summary className="cursor-pointer text-slate-600">Бағалау өлшемдері (оқушыға көрінеді) · {sum}/{q.marks}</summary>
                  <div className="mt-2 space-y-2">
                    {q.criteria.map((c, ci) => (
                      <div key={ci} className="flex gap-2">
                        <input className="input text-sm" value={c.descriptor} onChange={(e) => setCrit(gi, qi, ci, { descriptor: e.target.value })} aria-label="Дескриптор" />
                        <input className="input w-20 text-sm" type="number" min={0.5} step={0.5} value={c.marks} onChange={(e) => setCrit(gi, qi, ci, { marks: Number(e.target.value) })} aria-label="Ұпай" />
                      </div>
                    ))}
                    {Math.abs(sum - q.marks) > 1e-6 && <p className="text-xs text-red-700">Өлшемдер қосындысы {q.marks} ұпайға тең болуы керек.</p>}
                  </div>
                </details>
              </div>
            );
          })}
          {g.items.length < g.available && (
            <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => add(gi)}>+ Тағы есеп</button>
          )}
        </section>
      ))}

      {groups.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Бекіту</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="title">Атауы</label>
              <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <div>
              <label className="label" htmlFor="due">Мерзімі</label>
              <input id="due" type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="desc">Оқушыға ескерту (міндетті емес)</label>
              <input id="desc" className="input" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} />
            </div>
          </div>
          <p className="text-sm text-slate-600">
            {topic?.title} · {count} есеп · барлығы {total} ұпай · {classId ? gradeClasses.find((c) => c.id === classId)?.name : `${grade}-сыныптың барлығы`}
          </p>
          <button type="button" className="btn btn-primary" disabled={busy || !count || !title.trim() || !!badSum} onClick={publish}>
            {busy ? 'Сақталуда…' : 'Бекітіп, тағайындау'}
          </button>
        </section>
      )}
    </div>
  );
}
