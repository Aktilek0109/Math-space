'use client';

import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import { ensureMathLive } from './mathlive';
import { splitRel } from '@/lib/latexnum';
import type { StepCheck } from '@/lib/stepcheck';

/**
 * Калькулятор-дәптер: шешімді жол-жолымен, асты-астына (= белгісі бойынша тураланып) жазу.
 * Бір жол жазылса — жауап, бірнеше жол — шешім; жауап соңғы жолдан алынады (answerFromLines).
 */
export function MathNotebook(props: {
  lines: string[];
  onChange: (lines: string[]) => void;
  disabled?: boolean;
  label?: string;
  maxLines?: number;
  /** Жол-жолымен тексеру нәтижесі (жаттығу режимінде) */
  checks?: StepCheck[];
  /** М9: «📷 Суреттен» — дәптердегі шешімді ЖИ оқиды, оқушы түзетіп растайды (есеп шарты — контекст) */
  photoContext?: string;
}) {
  const { disabled, maxLines = 40 } = props;
  const lines = props.lines.length ? props.lines : [''];
  const [active, setActive] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [ocr, setOcr] = useState<'idle' | 'busy' | 'done'>('idle');
  const [ocrErr, setOcrErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function fromPhoto(file: File) {
    setOcr('busy'); setOcrErr(null);
    try {
      const image = await compressImage(file);
      const res = await fetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, context: props.photoContext?.slice(0, 1500) }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setOcrErr(body.error ?? 'Суретті оқу мүмкін болмады'); setOcr('idle'); return; }
      props.onChange((body.lines as string[]).slice(0, maxLines));
      setOcr('done');
    } catch {
      setOcrErr('Суретті өңдеу мүмкін болмады'); setOcr('idle');
    }
  }

  useEffect(() => {
    if (disabled) return;
    ensureMathLive().then(() => setReady(true), (e: Error) => setLoadErr(e.message));
  }, [disabled]);

  function setLine(i: number, v: string) {
    const next = [...lines];
    next[i] = v;
    props.onChange(next);
  }
  function addLine(after: number, copy = false) {
    if (lines.length >= maxLines) return;
    const next = [...lines];
    next.splice(after + 1, 0, copy ? lines[after] : '');
    props.onChange(next);
    setActive(after + 1);
  }
  function removeLine(i: number) {
    if (lines.length <= 1) { props.onChange(['']); setActive(0); return; }
    const next = lines.filter((_, k) => k !== i);
    props.onChange(next);
    setActive(Math.max(0, i - 1));
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white" aria-label={props.label ?? 'Калькулятор: шешім жолдары'}>
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-xs text-slate-500">
        <span>🧮 Шешім жолдары · соңғы жол — жауап</span>
        <span className="flex items-center gap-2">
          {!disabled && props.photoContext !== undefined && (
            <>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromPhoto(f); }} />
              <button type="button" className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50" onClick={() => fileRef.current?.click()} disabled={ocr === 'busy'} title="Дәптердегі шешімді суретке түсіріп жіберу">
                {ocr === 'busy' ? 'Оқылуда…' : '📷 Суреттен'}
              </button>
            </>
          )}
          {!disabled && <span>↵ — жаңа жол</span>}
        </span>
      </div>
      {ocr === 'done' && !disabled && (
        <div className="flex items-start justify-between gap-2 border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <span>🤖 ЖИ суреттен былай оқыды. Әр жолды тексеріп, қате оқылғанын түзетіңіз — содан кейін ғана тексеріледі.</span>
          <button type="button" className="shrink-0 rounded bg-amber-200 px-2 py-0.5 font-medium" onClick={() => setOcr('idle')}>Дұрыс ✓</button>
        </div>
      )}
      {ocrErr && <div className="border-b border-red-100 bg-red-50 px-3 py-1 text-xs text-red-700">{ocrErr}</div>}
      <div className="divide-y divide-dashed divide-slate-100">
        {lines.map((l, i) => {
          const isActive = !disabled && ready && active === i;
          return (
            <div key={i} className="px-2 py-1">
            <div className="group relative flex items-center gap-1">
              <span className="w-5 shrink-0 select-none text-right text-[10px] text-slate-300">{i + 1}</span>
              <div className="min-w-0 flex-1">
                {isActive ? (
                  <MathFieldLine
                    value={l}
                    onInput={(v) => setLine(i, v)}
                    onEnter={() => addLine(i)}
                    onBackspaceEmpty={() => (l === '' && lines.length > 1 ? removeLine(i) : undefined)}
                  />
                ) : (
                  <button
                    type="button"
                    className="block w-full rounded px-1 py-1.5 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
                    onClick={() => setActive(i)}
                    disabled={disabled}
                    aria-label={`${i + 1}-жол`}
                  >
                    <StaticLine latex={l} placeholder={i === 0 ? (ready || disabled ? 'Жауапты немесе шешімнің бірінші жолын теру үшін басыңыз' : 'Калькулятор жүктелуде…') : ''} />
                  </button>
                )}
              </div>
              <Mark c={ocr === 'done' ? undefined : props.checks?.[i]} show={!!l.trim() && lines.filter((x) => x.trim()).length > 1} />
              {!disabled && (
                <div className={`flex shrink-0 gap-0.5 ${isActive ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                  <button type="button" className="rounded px-1.5 text-slate-400 hover:bg-slate-100" title="Жолды көшіріп астына қою" onClick={() => addLine(i, true)}>⤓</button>
                  <button type="button" className="rounded px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Жолды өшіру" onClick={() => removeLine(i)}>✕</button>
                </div>
              )}
            </div>
            {ocr !== 'done' && props.checks?.[i]?.reason && l.trim() && (
              <p className={`ml-6 mt-0.5 text-xs ${props.checks[i].status === 'error' ? 'text-red-600' : 'text-amber-700'}`}>{props.checks[i].reason}</p>
            )}
            </div>
          );
        })}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-1.5">
          <button type="button" className="text-sm text-brand-600 hover:underline" onClick={() => addLine(lines.length - 1)}>+ жол</button>
          {loadErr && <span className="text-xs text-red-600">{loadErr}</span>}
        </div>
      )}
    </div>
  );
}

/** Белсенді емес жол: KaTeX, қатынас белгісі бойынша үш бағанға тураланған. */
function StaticLine({ latex, placeholder }: { latex: string; placeholder: string }) {
  if (!latex.trim()) return <span className="text-sm text-slate-400">{placeholder || ' '}</span>;
  const [l, rel, r] = splitRel(latex);
  const tex = (s: string) => ({ __html: s ? katex.renderToString(s, { throwOnError: false, strict: 'ignore' }) : '' });
  if (!rel) return <span className="block overflow-x-auto" dangerouslySetInnerHTML={tex(latex)} />;
  return (
    <span className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-x-1 overflow-x-auto">
      <span className="text-right" dangerouslySetInnerHTML={tex(l)} />
      <span dangerouslySetInnerHTML={tex(rel)} />
      <span dangerouslySetInnerHTML={tex(r)} />
    </span>
  );
}

/** Белсенді жол: MathLive <math-field> (элемент бір рет жасалады, мәні тек басында қойылады). */
function MathFieldLine(props: { value: string; onInput: (v: string) => void; onEnter: () => void; onBackspaceEmpty: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    const el = document.createElement('math-field') as HTMLElement & { value: string; mathVirtualKeyboardPolicy?: string; smartFence?: boolean };
    el.value = cb.current.value;
    el.mathVirtualKeyboardPolicy = 'auto';
    el.style.width = '100%';
    el.style.fontSize = '1.15rem';
    el.style.border = 'none';
    el.style.outline = 'none';
    el.style.background = 'transparent';
    const onInput = () => cb.current.onInput(el.value);
    // MathLive ↵ басқанда 'change' жібереді; фокус өрісте қалса — бұл ↵, кетсе — жай фокус жоғалуы
    const onChange = () => { if (document.activeElement === el) cb.current.onEnter(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Backspace' && el.value === '') cb.current.onBackspaceEmpty(); };
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    el.addEventListener('keydown', onKey);
    host.current?.appendChild(el);
    requestAnimationFrame(() => el.focus());
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
      el.removeEventListener('keydown', onKey);
      el.remove();
    };
  }, []);

  return <div ref={host} className="rounded bg-brand-50/40 px-1 ring-1 ring-brand-200" />;
}

function Mark({ c, show }: { c?: StepCheck; show: boolean }) {
  if (!show || !c || c.status === 'unknown') return <span className="w-5 shrink-0" />;
  const m = { ok: ['✓', 'text-emerald-600', 'Дұрыс'], error: ['✗', 'text-red-600', 'Қате'], warn: ['!', 'text-amber-600', 'Назар аударыңыз'] }[c.status];
  return <span className={`w-5 shrink-0 text-center font-bold ${m[1]}`} title={c.reason ?? m[2]} aria-label={c.reason ?? m[2]}>{m[0]}</span>;
}

/** Суретті қысу: ұзын жағы ≤ 1400 px, JPEG ~0.7 (ТЗ М9) */
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.72, out = c.toDataURL('image/jpeg', q);
    while (out.length > 2_500_000 && q > 0.35) { q -= 0.12; out = c.toDataURL('image/jpeg', q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
