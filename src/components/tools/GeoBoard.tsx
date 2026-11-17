'use client';

import { useRef, useState } from 'react';
import type { GeometryFigure } from '@/lib/figure/types';
import type { GeoObj, GeoPoint, GeoSketch, ToolCheck, XY } from '@/lib/tools/types';
import { recognize } from '@/lib/tools/geocheck';
import { ToolChecks } from './ToolChecks';

/**
 * М7: геометрия тақтасы 2D. Қолмен эскиз → автоматты түзету (түзу кесінді, шеңбер), нүктелер жалғанады.
 * Дайын «перпендикуляр/биссектриса» батырмалары жоқ: не салу керегін оқушы өзі шешеді, белгілерді өзі қояды.
 * Салу есептері үшін тек сызғыш (екі нүкте арқылы түзу) және циркуль. Әр әрекет журналға жазылады.
 */
type Tool = 'sketch' | 'point' | 'ruler' | 'compass' | 'right' | 'tick' | 'len' | 'label' | 'move' | 'erase';
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'sketch', label: '✍ Эскиз', hint: 'Қолмен сызыңыз: сызық түзу кесіндіге, дөңгелек шеңберге айналады; бір штрихпен үшбұрыш та салуға болады' },
  { id: 'point', label: '• Нүкте', hint: 'Басыңыз; кесінді үстінде болса — сол кесіндіге қойылады' },
  { id: 'ruler', label: '📏 Сызғыш', hint: 'Екі нүкте арқылы түзу' },
  { id: 'compass', label: '⊙ Циркуль', hint: 'Центрі, сосын радиус нүктесі' },
  { id: 'right', label: '∟ Тік бұрыш', hint: 'Төбесін, сосын екі жағындағы нүктелерді басыңыз' },
  { id: 'tick', label: '＝ Тең', hint: 'Кесіндіні басыңыз: 1, 2, 3 сызықша' },
  { id: 'len', label: 'a Ұзындық', hint: 'Мәтінді жазып, кесіндіні басыңыз (мыс. 5, 2x)' },
  { id: 'label', label: 'А Әріп', hint: 'Әріпті жазып, нүктені басыңыз' },
  { id: 'move', label: '✥ Жылжыту', hint: 'Нүктені сүйреңіз' },
  { id: 'erase', label: '⌫ Өшіру', hint: 'Нүктені немесе сызықты басыңыз' },
];
const W = 600, H = 420, SNAP = 14;
const LETTERS = 'ABCDEFGHKLMNOPQRSTXYZ'.split('');

export function GeoBoard(props: {
  value?: GeoSketch | null;
  onChange?: (s: GeoSketch) => void;
  readOnly?: boolean;
  /** Шарттағы сызба — «толықтыру» сатысы үшін негізге алуға болады */
  base?: GeometryFigure | null;
  checks?: ToolCheck[];
}) {
  const points = props.value?.points ?? [];
  const objs = props.value?.objs ?? [];
  const log = props.value?.log ?? [];
  const [tool, setTool] = useState<Tool>('sketch');
  const [pending, setPending] = useState<string[]>([]);
  const [stroke, setStroke] = useState<XY[] | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [hist, setHist] = useState<GeoSketch[]>([]);
  const svg = useRef<SVGSVGElement>(null);

  const P = (id: string) => points.find((p) => p.id === id);
  function emit(pts: GeoPoint[], os: GeoObj[], entry?: string, keepHist = false) {
    if (!keepHist && props.value) setHist((h) => [...h.slice(-30), props.value!]);
    props.onChange?.({ kind: 'board', points: pts, objs: os, log: entry ? [...log, entry].slice(-200) : log });
  }
  const at = (e: React.PointerEvent): XY => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const nearPoint = (m: XY, pts = points) => pts.reduce<GeoPoint | null>((best, p) => (d(p.p, m) < SNAP && (!best || d(p.p, m) < d(best.p, m)) ? p : best), null);
  const nextLabel = (pts: GeoPoint[], prefer?: string) => {
    const used = new Set(pts.map((p) => p.label));
    if (prefer && !used.has(prefer)) return prefer;
    return LETTERS.find((l) => !used.has(l)) ?? `P${pts.length + 1}`;
  };
  const segNear = (m: XY) => {
    let best: { o: GeoObj; i: number; dist: number } | null = null;
    objs.forEach((o, i) => {
      if (o.t !== 'seg' && o.t !== 'line') return;
      const a = P(o.a)?.p, b = P(o.b)?.p; if (!a || !b) return;
      const dd = o.t === 'seg' ? segDist(m, a, b) : lineDist(m, a, b);
      if (dd < SNAP && (!best || dd < best.dist)) best = { o, i, dist: dd };
    });
    return best as { o: GeoObj; i: number; dist: number } | null;
  };
  /** Нүктені табу не жасау (кесінді үстінде болса — проекциялау) */
  function ensure(m: XY, pts: GeoPoint[], prefer?: string): [string, GeoPoint[]] {
    const n = nearPoint(m, pts);
    if (n) return [n.id, pts];
    let p = m;
    const s = segNear(m);
    if (s) { const a = P((s.o as { a: string }).a)!.p, b = P((s.o as { b: string }).b)!.p; p = project(m, a, b, s.o.t === 'seg'); }
    const np: GeoPoint = { id: rid(), label: nextLabel(pts, prefer), p: [Math.round(p[0]), Math.round(p[1])] };
    return [np.id, [...pts, np]];
  }

  function down(e: React.PointerEvent) {
    if (props.readOnly) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const m = at(e);
    if (tool === 'sketch') { setStroke([m]); return; }
    if (tool === 'move') { const n = nearPoint(m); if (n) { setDrag(n.id); setHist((h) => [...h.slice(-30), props.value!]); } return; }
    if (tool === 'erase') return erase(m);
    if (tool === 'point') { const [id, pts] = ensure(m, points); if (pts !== points) emit(pts, objs, `нүкте ${pts.find((p) => p.id === id)!.label}`); return; }
    if (tool === 'tick' || tool === 'len') {
      const s = segNear(m); if (!s || s.o.t !== 'seg') return;
      const { a, b } = s.o;
      const name = `${P(a)!.label}${P(b)!.label}`;
      if (tool === 'tick') {
        const cur = objs.find((o) => o.t === 'tick' && sameSeg(o, a, b)) as { n: number } | undefined;
        const rest = objs.filter((o) => !(o.t === 'tick' && sameSeg(o, a, b)));
        const n = (cur?.n ?? 0) + 1;
        emit(points, n > 3 ? rest : [...rest, { t: 'tick', a, b, n }], `тең белгісі ${name}`);
      } else {
        if (!text.trim()) return;
        const rest = objs.filter((o) => !(o.t === 'len' && sameSeg(o, a, b)));
        emit(points, [...rest, { t: 'len', a, b, text: text.trim().slice(0, 12) }], `${name} = ${text.trim()}`);
      }
      return;
    }
    if (tool === 'label') {
      const n = nearPoint(m); const v = text.trim().slice(0, 4);
      if (!n || !v) return;
      if (points.some((p) => p.label === v && p.id !== n.id)) return;
      emit(points.map((p) => (p.id === n.id ? { ...p, label: v } : p)), objs, `${n.label} → ${v}`);
      return;
    }
    // ruler / compass / right: нүктелерді жинау
    let pts = points, id: string;
    if (tool === 'right') { const n = nearPoint(m); if (!n) return; id = n.id; }
    else [id, pts] = ensure(m, points);
    const next = [...pending, id];
    const need = tool === 'right' ? 3 : 2;
    if (next.length < need) { setPending(next); if (pts !== points) emit(pts, objs, undefined); return; }
    setPending([]);
    const L = (i: string) => pts.find((p) => p.id === i)!.label;
    if (new Set(next).size < need) return;
    if (tool === 'ruler') emit(pts, [...objs, { t: 'line', a: next[0], b: next[1] }], `сызғыш: ${L(next[0])}${L(next[1])} түзуі`);
    if (tool === 'compass') emit(pts, [...objs, { t: 'circle', c: next[0], through: next[1] }], `циркуль: центр ${L(next[0])}, радиус ${L(next[0])}${L(next[1])}`);
    if (tool === 'right') emit(pts, [...objs.filter((o) => !(o.t === 'right' && o.at === next[0])), { t: 'right', at: next[0], a: next[1], b: next[2] }], `∠${L(next[1])}${L(next[0])}${L(next[2])} = 90°`);
  }
  function move(e: React.PointerEvent) {
    const m = at(e);
    if (stroke) { const l = stroke[stroke.length - 1]; if (d(l, m) > 3) setStroke([...stroke, m]); }
    if (drag) emit(points.map((p) => (p.id === drag ? { ...p, p: [Math.round(m[0]), Math.round(m[1])] } : p)), objs, undefined, true);
  }
  function up() {
    if (drag) { const p = P(drag); emit(points, objs, p ? `${p.label} жылжытылды` : undefined, true); setDrag(null); }
    if (!stroke) return;
    const s = stroke; setStroke(null);
    const r = recognize(s);
    if (!r) return;
    let pts = points; const os = [...objs];
    if (r.kind === 'circle') {
      const n = nearPoint(r.c);
      let cid: string;
      if (n) cid = n.id; else { const np: GeoPoint = { id: rid(), label: nextLabel(pts, 'O'), p: [Math.round(r.c[0]), Math.round(r.c[1])] }; pts = [...pts, np]; cid = np.id; }
      os.push({ t: 'circle', c: cid, r: Math.round(r.r) });
      emit(pts, os, `шеңбер (центр ${pts.find((p) => p.id === cid)!.label})`);
      return;
    }
    const ids: string[] = [];
    for (const v of r.pts) { let id: string; [id, pts] = ensure(v, pts); if (ids[ids.length - 1] !== id) ids.push(id); }
    if (r.closed && ids.length >= 3 && ids[0] !== ids[ids.length - 1]) ids.push(ids[0]);
    const names: string[] = [];
    for (let i = 0; i + 1 < ids.length; i++) {
      const [a, b] = [ids[i], ids[i + 1]];
      if (a === b || os.some((o) => o.t === 'seg' && sameSeg(o, a, b))) continue;
      os.push({ t: 'seg', a, b });
      names.push(`${pts.find((p) => p.id === a)!.label}${pts.find((p) => p.id === b)!.label}`);
    }
    if (pts !== points || names.length) emit(pts, os, names.length ? `кесінді ${names.join(', ')}` : 'нүкте');
  }
  function erase(m: XY) {
    const n = nearPoint(m);
    if (n) {
      emit(points.filter((p) => p.id !== n.id), objs.filter((o) => !refs(o).includes(n.id)), `${n.label} өшірілді`);
      return;
    }
    const s = segNear(m);
    if (s) { emit(points, objs.filter((_, i) => i !== s.i), 'сызық өшірілді'); return; }
    const ci = objs.findIndex((o) => o.t === 'circle' && Math.abs(d(P(o.c)?.p ?? [0, 0], m) - radius(o)) < SNAP);
    if (ci >= 0) emit(points, objs.filter((_, i) => i !== ci), 'шеңбер өшірілді');
  }
  function radius(o: Extract<GeoObj, { t: 'circle' }>) { return o.r ?? (o.through && P(o.through) && P(o.c) ? d(P(o.c)!.p, P(o.through)!.p) : 0); }
  function undo() { const prev = hist[hist.length - 1]; if (!prev) return; setHist((h) => h.slice(0, -1)); props.onChange?.(prev); }
  function loadBase() {
    const b = props.base; if (!b) return;
    const ks = Object.entries(b.points);
    const xs = ks.map(([, p]) => p[0]), ys = ks.map(([, p]) => p[1]);
    const [mx, Mx, my, My] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min((W - 120) / (Mx - mx || 1), (H - 100) / (My - my || 1));
    const pts: GeoPoint[] = ks.filter(([n]) => !(b.hideLabels ?? []).includes(n)).map(([n, p]) => ({ id: rid(), label: n, p: [Math.round(60 + (p[0] - mx) * k), Math.round(H - 50 - (p[1] - my) * k)] }));
    const id = (n: string) => pts.find((p) => p.label === n)?.id;
    const os: GeoObj[] = [];
    for (const poly of b.polygons ?? []) poly.forEach((v, i) => { const a = id(v), c = id(poly[(i + 1) % poly.length]); if (a && c) os.push({ t: 'seg', a, b: c }); });
    emit(pts, os, 'шарттағы сызба негізге алынды');
  }

  const lines = objs.map((o, i) => {
    if (o.t === 'seg') { const a = P(o.a)?.p, b = P(o.b)?.p; if (!a || !b) return null; return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#0f172a" strokeWidth={2} strokeDasharray={o.dashed ? '6 4' : undefined} />; }
    if (o.t === 'line') { const a = P(o.a)?.p, b = P(o.b)?.p; if (!a || !b) return null; const [p, q] = extend(a, b); return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#475569" strokeWidth={1.3} />; }
    if (o.t === 'circle') { const c = P(o.c)?.p; if (!c) return null; return <circle key={i} cx={c[0]} cy={c[1]} r={radius(o)} fill="none" stroke="#2563eb" strokeWidth={1.8} />; }
    if (o.t === 'right') { const v = P(o.at)?.p, a = P(o.a)?.p, b = P(o.b)?.p; if (!v || !a || !b) return null; const u = unitv(v, a), w = unitv(v, b), s = 12; return <path key={i} d={`M${v[0] + u[0] * s},${v[1] + u[1] * s} L${v[0] + (u[0] + w[0]) * s},${v[1] + (u[1] + w[1]) * s} L${v[0] + w[0] * s},${v[1] + w[1] * s}`} fill="none" stroke="#dc2626" strokeWidth={1.5} />; }
    if (o.t === 'tick') { const a = P(o.a)?.p, b = P(o.b)?.p; if (!a || !b) return null; const m: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const u = unitv(a, b), nrm: XY = [-u[1], u[0]]; return <g key={i}>{Array.from({ length: o.n }, (_, k) => { const off = (k - (o.n - 1) / 2) * 5; const c: XY = [m[0] + u[0] * off, m[1] + u[1] * off]; return <line key={k} x1={c[0] - nrm[0] * 6} y1={c[1] - nrm[1] * 6} x2={c[0] + nrm[0] * 6} y2={c[1] + nrm[1] * 6} stroke="#dc2626" strokeWidth={1.5} />; })}</g>; }
    if (o.t === 'len') { const a = P(o.a)?.p, b = P(o.b)?.p; if (!a || !b) return null; const u = unitv(a, b); const m: XY = [(a[0] + b[0]) / 2 + u[1] * 14, (a[1] + b[1]) / 2 - u[0] * 14]; return <text key={i} x={m[0]} y={m[1]} fontSize={13} textAnchor="middle" fill="#7c2d12" stroke="#fff" strokeWidth={3} paintOrder="stroke">{o.text}</text>; }
    return null;
  });

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>📐 Геометрия тақтасы · {TOOLS.find((t) => t.id === tool)?.hint}</span>
      </div>
      {!props.readOnly && (
        <div className="flex flex-wrap items-center gap-1">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" title={t.hint} onClick={() => { setTool(t.id); setPending([]); }}
              className={`rounded-md border px-2 py-1 text-xs ${tool === t.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>{t.label}</button>
          ))}
          {(tool === 'len' || tool === 'label') && <input className="input w-20 py-1 text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={tool === 'len' ? '5' : 'M'} />}
          <span className="mx-1 border-l border-slate-200" />
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={undo} disabled={!hist.length}>↶</button>
          {props.base && <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={loadBase} title="Толықтыру: шарттағы сызбадан бастау">Шарттағы сызбадан</button>}
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600" onClick={() => emit([], [], 'тазаланды')}>Тазалау</button>
        </div>
      )}
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none rounded border border-slate-100" style={{ cursor: props.readOnly ? 'default' : tool === 'move' ? 'grab' : 'crosshair' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
        <defs><pattern id="geo-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#f1f5f9" /></pattern></defs>
        <rect width={W} height={H} fill="url(#geo-grid)" />
        {lines}
        {stroke && <path d={stroke.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} fill="none" stroke="#93c5fd" strokeWidth={2.5} strokeLinecap="round" />}
        {points.map((p) => (
          <g key={p.id}>
            <circle cx={p.p[0]} cy={p.p[1]} r={pending.includes(p.id) ? 6 : 3.5} fill={pending.includes(p.id) ? '#f59e0b' : '#0f172a'} />
            <text x={p.p[0] + 7} y={p.p[1] - 7} fontSize={14} fontStyle="italic" fill="#0f172a" stroke="#fff" strokeWidth={3} paintOrder="stroke">{p.label}</text>
          </g>
        ))}
      </svg>
      {!props.readOnly && log.length > 0 && (
        <details className="text-xs text-slate-500"><summary>Салу қадамдары ({log.length})</summary><ol className="list-decimal pl-5">{log.slice(-30).map((l, i) => <li key={i}>{l}</li>)}</ol></details>
      )}
      {props.checks && <ToolChecks checks={props.checks} />}
    </div>
  );
}

const rid = () => Math.random().toString(36).slice(2, 9);
function d(a: XY, b: XY) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function unitv(a: XY, b: XY): XY { const l = d(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
function segDist(p: XY, a: XY, b: XY) { const q = project(p, a, b, true); return d(p, q); }
function lineDist(p: XY, a: XY, b: XY) { return d(p, project(p, a, b, false)); }
function project(p: XY, a: XY, b: XY, clamp: boolean): XY {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
  if (clamp) t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}
function extend(a: XY, b: XY): [XY, XY] { const u = unitv(a, b), L = 2000; return [[a[0] - u[0] * L, a[1] - u[1] * L], [b[0] + u[0] * L, b[1] + u[1] * L]]; }
function sameSeg(o: { a: string; b: string }, a: string, b: string) { return (o.a === a && o.b === b) || (o.a === b && o.b === a); }
function refs(o: GeoObj): string[] {
  switch (o.t) {
    case 'circle': return [o.c, ...(o.through ? [o.through] : [])];
    case 'right': case 'angle': return [o.at, o.a, o.b];
    default: return [o.a, o.b];
  }
}
