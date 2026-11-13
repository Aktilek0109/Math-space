'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MathText } from '@/components/MathText';
import { ErrorBox } from '@/components/ErrorBox';
import { apiFetch, failureText } from '@/lib/client-api';
import type { AnswerKey, PublicBody, QuestionType, RubricLine } from '@/lib/generator/types';
import type { ResponseValue } from '@/lib/grading';

interface Key { answer: AnswerKey; solution: { text: string }; rubric: RubricLine[] }
interface Item {
  id: string;
  sequence_no: number;
  question_type: QuestionType;
  body: PublicBody;
  max_marks: number;
  response: ResponseValue | null;
  revealed: boolean;
  awarded_marks: number | null;
  key: Key | null;
}

const TYPE_HINT: Record<QuestionType, string> = {
  single: 'Бір дұрыс жауап',
  multi: 'Бірнеше дұрыс жауап',
  numeric: 'Сандық жауап (бөлшек: 3/4 немесе 0,75)',
  short: 'Қысқа жауап',
  open: 'Толық шешім жазыңыз',
  multipart: 'Бөліктері бар есеп',
};

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SessionRunner(props: {
  sessionId: string;
  title: string;
  mode: 'practice' | 'exam';
  deadline: string | null;
  totalMarks: number;
  items: Item[];
}) {
  const { sessionId, mode, deadline } = props;
  const [items, setItems] = useState(props.items);
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>(() =>
    Object.fromEntries(props.items.filter((i) => i.response).map((i) => [i.id, i.response!])),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState<number | null>(deadline ? Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)) : null);
  const submittedRef = useRef(false);

  const save = useCallback(
    async (ids?: string[]) => {
      const toSave = (ids ?? [...dirty]).filter((id) => answers[id]);
      if (toSave.length === 0) return true;
      setSaveState('saving');
      const res = await apiFetch('/api/sessions/' + sessionId + '/responses', {
        method: 'PUT',
        json: { responses: toSave.map((id) => ({ item_id: id, response: answers[id] })) },
      });
      if (!res.ok) {
        setSaveState('error');
        if (res.status === 409) window.location.assign(`/results/${sessionId}`);
        return false;
      }
      setDirty((d) => {
        const n = new Set(d);
        toSave.forEach((id) => n.delete(id));
        return n;
      });
      setSaveState('saved');
      return true;
    },
    [answers, dirty, sessionId],
  );

  // Draft жауаптарды автоматты сақтау (6-бөлім, 6-қадам)
  useEffect(() => {
    if (dirty.size === 0) return;
    const t = setTimeout(() => void save(), 1500);
    return () => clearTimeout(t);
  }, [dirty, save]);

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    await save();
    const res = await apiFetch<{ redirect: string }>(`/api/sessions/${sessionId}/submit`, { method: 'POST' });
    if (!res.ok && res.status !== 409) {
      submittedRef.current = false;
      setSubmitting(false);
      setError(failureText(res.failure));
      return;
    }
    window.location.assign(`/results/${sessionId}`);
  }, [save, sessionId]);

  // Таймер; уақыт бітсе — автоматты тапсыру (сервер де мерзімді тексереді)
  useEffect(() => {
    if (!deadline) return;
    const end = new Date(deadline).getTime();
    const t = setInterval(() => {
      const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        clearInterval(t);
        void submit();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, submit]);

  // Беттен кетерде сақталмаған жауап туралы ескерту
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty.size > 0 && !submittedRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  function update(id: string, patch: ResponseValue) {
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
    setDirty((d) => new Set(d).add(id));
  }

  async function reveal(id: string) {
    setError(null);
    if (!(await save([id]))) return;
    const res = await apiFetch<{ correct: boolean | null; awarded: number | null; answer: AnswerKey; solution: { text: string }; rubric: RubricLine[] }>(
      `/api/sessions/${sessionId}/items/${id}/reveal`,
      { method: 'POST' },
    );
    if (!res.ok) {
      setError(failureText(res.failure));
      return;
    }
    setItems((list) =>
      list.map((it) =>
        it.id === id ? { ...it, revealed: true, awarded_marks: res.data.awarded, key: { answer: res.data.answer, solution: res.data.solution, rubric: res.data.rubric } } : it,
      ),
    );
  }

  const answered = items.filter((i) => {
    const a = answers[i.id];
    return a && (a.choice || a.choices?.length || a.value?.trim() || a.text?.trim());
  }).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <header className="sticky top-[49px] z-10 -mx-4 flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur">
        <div>
          <h1 className="font-semibold">{props.title}</h1>
          <p className="text-xs text-slate-500">
            {answered}/{items.length} жауап · {props.totalMarks} ұпай · {mode === 'practice' ? 'жаттығу' : 'емтихан'}
            {' · '}
            <span aria-live="polite">{saveState === 'saving' ? 'сақталуда…' : saveState === 'saved' ? 'сақталды' : saveState === 'error' ? 'сақталмады!' : ''}</span>
          </p>
        </div>
        {left !== null && (
          <div role="timer" aria-label="Қалған уақыт" className={`rounded-lg px-3 py-1 font-mono text-lg ${left < 60 ? 'bg-red-100 text-red-700' : 'bg-white'}`}>
            {fmt(left)}
          </div>
        )}
      </header>

      <ErrorBox lines={error} />

      {items.map((it) => {
        const a = answers[it.id] ?? {};
        const locked = it.revealed;
        return (
          <section key={it.id} className="card space-y-3" aria-labelledby={`q-${it.id}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 id={`q-${it.id}`} className="font-semibold">{it.sequence_no}-тапсырма</h2>
              <span className="chip">{it.max_marks} ұпай</span>
            </div>
            <MathText text={it.body.text} className="block leading-relaxed" />
            <p className="text-xs text-slate-500">{TYPE_HINT[it.question_type]}</p>

            {(it.question_type === 'single' || it.question_type === 'multi') && (
              <div className="space-y-2">
                {(it.body.options ?? []).map((o) => {
                  const checked = it.question_type === 'single' ? a.choice === o.id : (a.choices ?? []).includes(o.id);
                  const isCorrect = it.key && (Array.isArray(it.key.answer.correct) ? it.key.answer.correct.includes(o.id) : it.key.answer.correct === o.id);
                  return (
                    <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${checked ? 'border-brand-500 bg-brand-50' : 'border-slate-200'} ${isCorrect ? 'ring-2 ring-emerald-400' : ''}`}>
                      <input
                        type={it.question_type === 'single' ? 'radio' : 'checkbox'}
                        name={`opt-${it.id}`}
                        checked={checked}
                        disabled={locked}
                        onChange={(e) =>
                          it.question_type === 'single'
                            ? update(it.id, { choice: o.id })
                            : update(it.id, { choices: e.target.checked ? [...(a.choices ?? []), o.id] : (a.choices ?? []).filter((x) => x !== o.id) })
                        }
                      />
                      <span className="font-medium">{o.id})</span>
                      <MathText text={o.text} />
                    </label>
                  );
                })}
              </div>
            )}

            {(it.question_type === 'numeric' || it.question_type === 'short') && (
              <input
                className="input max-w-xs"
                inputMode={it.question_type === 'numeric' ? 'decimal' : 'text'}
                value={a.value ?? ''}
                disabled={locked}
                onChange={(e) => update(it.id, { value: e.target.value })}
                aria-label="Жауап"
                placeholder="Жауабыңыз"
              />
            )}

            {(it.question_type === 'open' || it.question_type === 'multipart') && (
              <textarea
                className="input min-h-32"
                value={a.text ?? ''}
                disabled={locked}
                onChange={(e) => update(it.id, { text: e.target.value })}
                aria-label="Шешім"
                placeholder="Шешу жолын жазыңыз. Формула үшін $x^2$ сияқты жазуға болады."
              />
            )}

            {mode === 'practice' && !it.revealed && (
              <button type="button" className="btn btn-secondary" onClick={() => reveal(it.id)} disabled={!answers[it.id]}>
                Тексеру және шешімін көру
              </button>
            )}

            {it.revealed && it.key && (
              <div className={it.awarded_marks === it.max_marks ? 'ok-box space-y-2' : 'rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2'}>
                <p className="font-medium">
                  {it.awarded_marks === null
                    ? 'Дескриптор бойынша өзіңізді тексеріңіз'
                    : it.awarded_marks === it.max_marks
                      ? `Дұрыс! +${it.awarded_marks}`
                      : 'Қате'}
                  {it.key.answer.value !== undefined && ` · Жауап: ${it.key.answer.value}`}
                </p>
                {it.key.solution?.text && <MathText text={it.key.solution.text} className="block" />}
                {it.key.rubric?.length > 0 && (
                  <ul className="list-disc pl-5">
                    {it.key.rubric.map((r, i) => <li key={i}>{r.descriptor} — {r.marks} ұпай</li>)}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-2">
          {confirming ? (
            <>
              <span className="mr-auto text-sm">
                {answered < items.length ? `${items.length - answered} тапсырма жауапсыз. ` : ''}Тапсырасыз ба?
              </span>
              <button className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={submitting}>Жоқ</button>
              <button className="btn btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Тапсырылуда…' : 'Иә, тапсыру'}</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setConfirming(true)}>Аяқтау</button>
          )}
        </div>
      </div>
    </div>
  );
}
