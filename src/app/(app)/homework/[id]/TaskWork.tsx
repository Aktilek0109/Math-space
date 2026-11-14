'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { MathText } from '@/components/MathText';
import { apiFetch, failureText } from '@/lib/client-api';
import { shrink } from './SubmitWork';

export interface Criterion { descriptor: string; marks: number }
export interface TaskItem {
  id: string;
  parent_item_id: string | null;
  student_id: string | null;
  position: number;
  question_type: 'single' | 'multi' | 'numeric' | 'short' | 'open' | 'multipart';
  body_json: { text: string; options?: { id: string; text: string }[] };
  criteria_json: Criterion[];
  max_marks: number;
  difficulty: number;
  learning_objectives: { code: string; text: string } | null;
}
interface AttemptFile { path: string; name: string; mime: string; size: number }
interface Answer { value?: string; choice?: string; text?: string }
interface Feedback { source: 'ai' | 'rule'; readable: boolean; unreadable_note?: string; done: string[]; met: number[]; next_step: string; correct: boolean | null; note?: string }
export interface TaskAttempt {
  id: string;
  item_id: string;
  kind: 'first' | 'revised';
  answer_json: Answer;
  files_json: AttemptFile[];
  submitted_at: string | null;
  feedback_json: Feedback | null;
  awarded_marks: number | null;
  marking_state: string;
  teacher_note: string | null;
  graded_at: string | null;
}

const OK_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

type Ctx = { assignmentId: string; locked: boolean; storage: ReturnType<typeof createClient>['storage']; refresh: () => void; showMarks: boolean };

export function TaskWork(props: {
  assignmentId: string;
  items: TaskItem[];
  attempts: TaskAttempt[];
  submittedAt: string | null;
  gradedAt: string | null;
  score: number | null;
  maxScore: number;
  feedback: string | null;
  supabaseUrl: string;
  anonKey: string;
}) {
  const router = useRouter();
  const storage = useMemo(() => createClient(props.supabaseUrl, props.anonKey, { auth: { persistSession: false } }).storage, [props.supabaseUrl, props.anonKey]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const locked = !!props.submittedAt;
  const ctx: Ctx = { assignmentId: props.assignmentId, locked, storage, refresh: () => router.refresh(), showMarks: locked };
  const common = props.items.filter((i) => !i.parent_item_id).sort((a, b) => a.position - b.position);
  const att = (itemId: string, kind: 'first' | 'revised') => props.attempts.find((a) => a.item_id === itemId && a.kind === kind) ?? null;

  async function submitAll() {
    if (!confirm('Жұмысты тапсырасың ба? Тапсырған соң өзгертуге болмайды.')) return;
    setBusy(true);
    const r = await apiFetch(`/api/homework/${props.assignmentId}/tasks`, { method: 'POST', json: { action: 'submit_all' } });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: 'Жұмысың тапсырылды ✓' } : { ok: false, text: failureText(r.failure).join(' ') });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {props.gradedAt && props.score != null && (
        <section className="card border-green-300 bg-green-50">
          <h2 className="font-semibold">Мұғалімнің бағасы</h2>
          <div className="mt-1 text-2xl font-semibold">{Number(props.score)} / {props.maxScore}</div>
          {props.feedback && <p className="mt-1 whitespace-pre-wrap">{props.feedback}</p>}
        </section>
      )}
      {common.map((item, i) => {
        const follow = props.items.find((x) => x.parent_item_id === item.id) ?? null;
        return (
          <div key={item.id} className="space-y-2">
            <ItemCard n={i + 1} item={item} first={att(item.id, 'first')} revised={att(item.id, 'revised')} ctx={ctx} hasFollowup={!!follow} />
            {follow && (
              <div className="ml-3 border-l-4 border-brand-200 pl-3">
                <ItemCard n={i + 1} item={follow} first={att(follow.id, 'first')} revised={att(follow.id, 'revised')} ctx={ctx} isFollowup hasFollowup />
              </div>
            )}
          </div>
        );
      })}
      <section className="card space-y-2">
        {locked ? (
          <p className="text-sm text-slate-700">Жұмыс тапсырылды. {props.gradedAt ? '' : 'Мұғалім тексерген соң ұпайлар осында шығады.'}</p>
        ) : (
          <>
            <p className="text-sm text-slate-600">Барлық есепті орындап болған соң тапсыр. Бекітілмеген жауаптар тапсырғанда автоматты бекітіледі.</p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submitAll}>{busy ? 'Тапсырылуда…' : '✓ Жұмысты тапсыру'}</button>
          </>
        )}
        {msg && <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      </section>
    </div>
  );
}

function ItemCard({ n, item, first, revised, ctx, isFollowup, hasFollowup }: {
  n: number; item: TaskItem; first: TaskAttempt | null; revised: TaskAttempt | null; ctx: Ctx; isFollowup?: boolean; hasFollowup: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = `/api/homework/${ctx.assignmentId}/tasks`;
  // Ашық редактордың жазылғанын әрекет алдында сақтау
  const flush = useRef<(() => Promise<boolean>) | null>(null);

  async function call(json: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    if (json.action !== 'followup' && flush.current && !(await flush.current())) { setBusy(false); return false; }
    const r = await apiFetch<Record<string, unknown>>(url, { method: 'POST', json: { item_id: item.id, ...json } });
    setBusy(false);
    if (!r.ok) { setErr(failureText(r.failure).join(' ')); return false; }
    ctx.refresh();
    return true;
  }

  const firstLocked = !!first?.submitted_at || ctx.locked;
  const revisedOpen = !!first?.feedback_json && !revised?.submitted_at && !ctx.locked;
  const canFeedbackRevised = revisedOpen && !revised?.feedback_json;
  const canFollowup = !isFollowup && !hasFollowup && !!revised?.submitted_at && !ctx.locked;

  return (
    <section className={`card space-y-3 ${isFollowup ? 'bg-brand-50/40' : ''}`}>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{isFollowup ? `${n}-есепке тексеру есебі` : `${n}-есеп`}</h2>
          <span className="chip">{Number(item.max_marks)} ұпай</span>
          {item.learning_objectives && <span className="chip" title={item.learning_objectives.text}>{item.learning_objectives.code}</span>}
        </div>
        {isFollowup && <p className="text-xs text-slate-600">Сол дағдыны шарты өзгеше есепте өз бетіңше тексер. Бұл жолғы алғашқы әрекетің дербес жұмыс болып саналады.</p>}
      </header>
      <MathText text={item.body_json.text} />
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="mb-1 font-medium text-slate-700">Не үшін ұпай беріледі</div>
        <ul className="list-disc space-y-0.5 pl-5">
          {item.criteria_json.map((c, i) => <li key={i}>{c.descriptor} — <b>{c.marks}</b> ұпай</li>)}
        </ul>
      </div>

      <Editor key={`f-${first?.id ?? 'new'}-${first?.submitted_at ?? ''}`} item={item} kind="first" attempt={first} initial={first?.answer_json} readOnly={firstLocked} ctx={ctx} flush={firstLocked ? undefined : flush} label={revised || first?.feedback_json ? 'Алғашқы нұсқа' : 'Менің шешімім'} />
      {first?.feedback_json && <FeedbackBox fb={first.feedback_json} criteria={item.criteria_json} />}
      {ctx.showMarks && first?.awarded_marks != null && <Marks a={first} max={item.max_marks} />}

      {(revisedOpen || revised) && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <div className="text-sm font-medium text-amber-900">Түзетілген нұсқа · көмекпен орындалды</div>
          <Editor key={`r-${revised?.id ?? 'new'}-${revised?.submitted_at ?? ''}`} item={item} kind="revised" attempt={revised} initial={revised?.answer_json ?? first?.answer_json} readOnly={!revisedOpen} ctx={ctx} flush={revisedOpen ? flush : undefined} label="" />
          {revised?.feedback_json && <FeedbackBox fb={revised.feedback_json} criteria={item.criteria_json} />}
        </div>
      )}

      {!ctx.locked && (
        <div className="flex flex-wrap gap-2">
          {!firstLocked && (
            <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => call({ action: 'feedback' })}>{busy ? 'Тексерілуде…' : '💬 Кері байланыс алу'}</button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => call({ action: 'submit_item', kind: 'first' })}>Осы күйінде бекіту</button>
            </>
          )}
          {revisedOpen && (
            <>
              {canFeedbackRevised && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => call({ action: 'feedback' })}>💬 Тағы бір нұсқау</button>}
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => call({ action: 'submit_item', kind: 'revised' })}>Түзетілген нұсқаны бекіту</button>
            </>
          )}
          {canFollowup && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => call({ action: 'followup' })}>🔁 Тексеру есебін алу</button>
          )}
        </div>
      )}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </section>
  );
}

function Marks({ a, max }: { a: TaskAttempt; max: number }) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-sm">
      <b>{Number(a.awarded_marks)} / {Number(max)}</b> ұпай {a.marking_state === 'manual' ? '· мұғалім бағалады' : '· алдын ала (жауап бойынша)'}
      {a.teacher_note && <p className="mt-1">Мұғалім: {a.teacher_note}</p>}
    </div>
  );
}

function FeedbackBox({ fb, criteria }: { fb: Feedback; criteria: Criterion[] }) {
  return (
    <div className="space-y-1 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
      <div className="font-medium text-brand-800">💬 Кері байланыс{fb.source === 'rule' ? ' (қысқа)' : ''}</div>
      {!fb.readable && fb.unreadable_note && <p className="text-amber-800">📷 {fb.unreadable_note}</p>}
      {fb.done.length > 0 && <p>✓ Дұрыс орындалғаны: {fb.done.join('; ')}</p>}
      {fb.met.length > 0 && <p className="text-slate-600">Орындалған өлшем: {fb.met.map((i) => criteria[i - 1]?.descriptor).filter(Boolean).join('; ')}</p>}
      <p>→ <b>Келесі қадам:</b> <MathText text={fb.next_step} /></p>
      {fb.note && <p className="text-xs text-slate-500">{fb.note}</p>}
    </div>
  );
}

function Editor({ item, kind, attempt, initial, readOnly, ctx, label, flush }: {
  item: TaskItem; kind: 'first' | 'revised'; attempt: TaskAttempt | null; initial?: Answer; readOnly: boolean; ctx: Ctx; label: string;
  flush?: { current: (() => Promise<boolean>) | null };
}) {
  const [ans, setAns] = useState<Answer>(initial ?? {});
  const [files, setFiles] = useState<AttemptFile[]>(attempt?.files_json ?? []);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const url = `/api/homework/${ctx.assignmentId}/tasks`;

  async function save(nextFiles = files, nextAns = ans, quiet = false) {
    setState('saving');
    setErr(null);
    const r = await apiFetch(url, { method: 'POST', json: { action: 'save', item_id: item.id, kind, answer: nextAns, files: nextFiles } });
    if (!r.ok) { setState('error'); setErr(failureText(r.failure).join(' ')); return false; }
    setState('saved');
    if (!quiet) ctx.refresh();
    return true;
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    try {
      setState('saving');
      const picked = await Promise.all(Array.from(list).slice(0, 6 - files.length).map(shrink));
      const bad = picked.find((f) => !OK_MIME.includes(f.type) || f.size > 10 * 1024 * 1024 || f.size === 0);
      if (bad) throw new Error(`«${bad.name}»: тек сурет немесе PDF, 10 МБ-тан аспауы керек.`);
      const meta = picked.map((f) => ({ name: f.name, mime: f.type, size: f.size }));
      const prep = await apiFetch<{ items: { path: string; token: string }[] }>(url, { method: 'POST', json: { action: 'prepare_upload', item_id: item.id, files: meta } });
      if (!prep.ok) throw new Error(failureText(prep.failure).join(' '));
      await Promise.all(prep.data.items.map(async (it, i) => {
        const { error } = await ctx.storage.from('homework').uploadToSignedUrl(it.path, it.token, picked[i], { contentType: picked[i].type });
        if (error) throw new Error(`«${picked[i].name}» жүктелмеді: ${error.message}`);
      }));
      const next = [...files, ...prep.data.items.map((it, i) => ({ path: it.path, ...meta[i] }))];
      setFiles(next);
      await save(next);
    } catch (e) {
      setState('error');
      setErr(e instanceof Error ? e.message : 'Қате болды');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  if (flush) flush.current = () => save(files, ans, true);

  const opts = item.body_json.options;
  return (
    <div className="space-y-2">
      {label && <div className="text-sm font-medium text-slate-700">{label}</div>}
      {opts ? (
        <fieldset className="grid gap-1 sm:grid-cols-2" disabled={readOnly}>
          {opts.map((o) => (
            <label key={o.id} className={`flex items-start gap-2 rounded border p-2 text-sm ${ans.choice === o.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <input type="radio" name={`${item.id}-${kind}`} checked={ans.choice === o.id} onChange={() => setAns({ ...ans, choice: o.id })} />
              <span><b>{o.id})</b> <MathText text={o.text} /></span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div>
          <label className="label" htmlFor={`v-${item.id}-${kind}`}>Жауабы</label>
          <input id={`v-${item.id}-${kind}`} className="input max-w-xs" value={ans.value ?? ''} disabled={readOnly} onChange={(e) => setAns({ ...ans, value: e.target.value })} placeholder="мысалы: 3 немесе 5/2" maxLength={200} />
        </div>
      )}
      <div>
        <label className="label" htmlFor={`t-${item.id}-${kind}`}>Шешу жолы {opts ? '/ негіздеме' : ''}</label>
        <textarea id={`t-${item.id}-${kind}`} className="input min-h-24 font-mono text-sm" value={ans.text ?? ''} disabled={readOnly} onChange={(e) => setAns({ ...ans, text: e.target.value })} maxLength={5000} placeholder="Әр қадамды жеке жолға жаз. Дәптерде шығарсаң — бетті суретке түсіріп жүкте." />
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={f.path} className="relative">
              {attempt ? (
                <a href={`/api/homework/attempt-file?a=${attempt.id}&i=${i}`} target="_blank" rel="noopener noreferrer" className="block">
                  {f.mime.startsWith('image/') && f.mime !== 'image/heic' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/homework/attempt-file?a=${attempt.id}&i=${i}`} alt={`${i + 1}-бет`} className="h-24 w-20 rounded border object-cover" />
                  ) : <div className="flex h-24 w-20 items-center justify-center rounded border text-xs">📄 {i + 1}</div>}
                </a>
              ) : <div className="flex h-24 w-20 items-center justify-center rounded border text-xs">{f.name}</div>}
              {!readOnly && (
                <button type="button" className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-xs text-red-700 shadow" onClick={() => { const next = files.filter((_, j) => j !== i); setFiles(next); save(next); }}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <button type="button" className="btn btn-secondary text-sm" disabled={state === 'saving' || files.length >= 6} onClick={() => input.current?.click()}>📷 Дәптер бетін жүктеу</button>
          <button type="button" className="btn btn-secondary text-sm" disabled={state === 'saving'} onClick={() => save()}>💾 Сақтау</button>
          <span className="text-xs text-slate-500">{state === 'saving' ? 'Сақталуда…' : state === 'saved' ? 'Сақталды ✓' : ''}</span>
        </div>
      )}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}
