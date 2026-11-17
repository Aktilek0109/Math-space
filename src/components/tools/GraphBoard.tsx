'use client';

import { useRef, useState } from 'react';
import type { GraphObj, GraphSketch, ToolCheck, XY } from '@/lib/tools/types';
import { ToolChecks } from './ToolChecks';

/**
 * М6: график тақтасы. Координаталық жазықтық, нүктелер торға тартылады.
 * Дайын «график салғыш» жоқ — маңызды нүктелерді оқушы өзі есептеп қояды, қисықты қолмен жүргізеді (тегістеледі).
 */
type Tool = 'pt' | 'line' | 'seg' | 'vec' | 'circle' | 'curve' | 'region' | 'erase';
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'pt', label: '• Нүкте', hint: 'Басыңыз — нүкте торға тартылады' },
  { id: 'curve', label: '〰 Қисық', hint: 'Саусақпен/тінтуірмен жүргізіңіз — сызық тегістеледі' },
  { id: 'line', label: '╱ Түзу', hint: 'Екі нүктені басыңыз' },
  { id: 'seg', label: '— Кесінді', hint: 'Екі нүктені басыңыз' },
  { id: 'vec', label: '→ Вектор', hint: 'Басы, сосын ұшы' },
  { id: 'circle', label: '◯ Шеңбер', hint: 'Центрі, сосын шеңбердегі нүкте' },
  { id: 'region', label: '▨ Аймақ', hint: 'Төбелерді басыңыз, бірінші нүктені қайта басса — жабылады' },
  { id: 'erase', label: '⌫ Өшіру', hint: 'Өшіретін объектіні басыңыз' },
];

const W = 520, H = 400;

export function GraphBoard(props: {
  value?: GraphSketch | null;
  onChange?: (s: GraphSketch) => void;
  readOnly?: boolean;
  /** Бастапқы көрініс (есеп сызбасынан) */
  view?: { x: XY; y: XY };
  /** x осі радианмен (тригонометрия) */
  piTicks?: boolean;
  checks?: ToolCheck[];
}) {
  const objs = props.value?.objs ?? [];
  const [view, setView] = useState<{ x: XY; y: XY }>(props.value?.view ?? props.view ?? { x: [-6, 6], y: [-5, 5] });
  const [tool, setTool] = useState<Tool>('pt');
  const [pending, setPending] = useState<XY[]>([]);
  const [stroke, setStroke] = useState<XY[] | null>(null);
  const [hover, setHover] = useState<XY | null>(null);
  const [unit, setUnit] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const [x0, x1] = view.x, [y0, y1] = view.y;
  const sx = (x: number) => ((x - x0) / (x1 - x0)) * W;
  const sy = (y: number) => ((y1 - y) / (y1 - y0)) * H;
  const stepX = props.piTicks ? Math.PI / 6 : niceStep(x1 - x0);
  const stepY = niceStep(y1 - y0);
  const snapX = props.piTicks ? Math.PI / 12 : stepX / 2;
  const snapY = stepY / 2;

  function emit(next: GraphObj[], v = view) { props.onChange?.({ kind: 'graph', objs: next, view: v }); }
  function toMath(e: React.PointerEvent): XY {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    return [x0 + (px / W) * (x1 - x0), y1 - (py / H) * (y1 - y0)];
  }
  const snap = ([x, y]: XY): XY => [round(Math.round(x / snapX) * snapX), round(Math.round(y / snapY) * snapY)];

  function down(e: React.PointerEvent) {
    if (props.readOnly) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const m = toMath(e);
    if (tool === 'curve') { setStroke([m]); return; }
    if (tool === 'erase') { eraseAt(m); return; }
    const p = snap(m);
    if (tool === 'pt') { emit([...objs, { t: 'pt', p }]); return; }
    if (tool === 'region') {
      if (pending.length >= 3 && dist(p, pending[0]) < 1e-9) { emit([...objs, { t: 'region', pts: pending }]); setPending([]); return; }
      setPending([...pending, p]); return;
    }
    const next = [...pending, p];
    if (next.length < 2) { setPending(next); return; }
    const [a, b] = next;
    setPending([]);
    if (dist(a, b) < 1e-9) return;
    if (tool === 'line') emit([...objs, { t: 'line', a, b }]);
    if (tool === 'seg') emit([...objs, { t: 'seg', a, b }]);
    if (tool === 'vec') emit([...objs, { t: 'vec', a, b }]);
    if (tool === 'circle') emit([...objs, { t: 'circle', c: a, r: round(dist(a, b)) }]);
  }
  function move(e: React.PointerEvent) {
    const m = toMath(e);
    setHover(tool === 'curve' || tool === 'erase' ? m : snap(m));
    if (stroke) {
      const last = stroke[stroke.length - 1];
      if (Math.hypot(sx(m[0]) - sx(last[0]), sy(m[1]) - sy(last[1])) > 3) setStroke([...stroke, m]);
    }
  }
  function up() {
    if (stroke && stroke.length > 2) emit([...objs, { t: 'curve', pts: smooth(stroke).map(([x, y]) => [round(x), round(y)] as XY) }]);
    setStroke(null);
  }
  function eraseAt(m: XY) {
    const tolPx = 12;
    const d = (o: GraphObj) => {
      const P = (p: XY): XY => [sx(p[0]), sy(p[1])];
      const M = P(m);
      if (o.t === 'pt') return dpx(M, P(o.p));
      if (o.t === 'circle') return Math.abs(dpx(M, P(o.c)) - (o.r / (x1 - x0)) * W);
      if (o.t === 'curve' || o.t === 'region') return Math.min(...o.pts.map((p) => dpx(M, P(p))));
      return segDist(M, P(o.a), P(o.b));
    };
    let best = -1, bd = tolPx;
    objs.forEach((o, i) => { const v = d(o); if (v < bd) { bd = v; best = i; } });
    if (best >= 0) emit(objs.filter((_, i) => i !== best));
  }
  function zoom(f: number) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const v = { x: [cx - ((x1 - x0) / 2) * f, cx + ((x1 - x0) / 2) * f] as XY, y: [cy - ((y1 - y0) / 2) * f, cy + ((y1 - y0) / 2) * f] as XY };
    setView(v); emit(objs, v);
  }
  function pan(dx: number, dy: number) {
    const v = { x: [x0 + dx * (x1 - x0), x1 + dx * (x1 - x0)] as XY, y: [y0 + dy * (y1 - y0), y1 + dy * (y1 - y0)] as XY };
    setView(v); emit(objs, v);
  }

  // тор және белгілер
  const grid: React.ReactNode[] = [];
  for (let k = Math.ceil(x0 / stepX); k * stepX <= x1; k++) {
    const x = k * stepX;
    grid.push(<line key={`gx${k}`} x1={sx(x)} x2={sx(x)} y1={0} y2={H} stroke={k === 0 ? '#334155' : '#e2e8f0'} strokeWidth={k === 0 ? 1.4 : 1} />);
    if (k !== 0) grid.push(<text key={`tx${k}`} x={sx(x)} y={Math.min(H - 4, Math.max(12, sy(0) + 13))} fontSize={10} textAnchor="middle" fill="#64748b">{props.piTicks ? piLabel(k) : fmt(x)}</text>);
  }
  for (let k = Math.ceil(y0 / stepY); k * stepY <= y1; k++) {
    const y = k * stepY;
    grid.push(<line key={`gy${k}`} y1={sy(y)} y2={sy(y)} x1={0} x2={W} stroke={k === 0 ? '#334155' : '#e2e8f0'} strokeWidth={k === 0 ? 1.4 : 1} />);
    if (k !== 0) grid.push(<text key={`ty${k}`} y={sy(y) + 3} x={Math.min(W - 4, Math.max(4, sx(0) - 4))} fontSize={10} textAnchor="end" fill="#64748b">{fmt(y)}</text>);
  }

  const color = '#2563eb';
  const path = (pts: XY[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ');
  const ext = (a: XY, b: XY): [XY, XY] => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = 4 * Math.max(x1 - x0, y1 - y0) / Math.hypot(dx, dy);
    return [[a[0] - dx * L, a[1] - dy * L], [b[0] + dx * L, b[1] + dy * L]];
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>📈 График тақтасы</span>
        {hover && <span className="font-mono">({fmt(hover[0])}; {fmt(hover[1])})</span>}
      </div>
      {!props.readOnly && (
        <div className="flex flex-wrap gap-1">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" title={t.hint} onClick={() => { setTool(t.id); setPending([]); }}
              className={`rounded-md border px-2 py-1 text-xs ${tool === t.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>{t.label}</button>
          ))}
          <span className="mx-1 border-l border-slate-200" />
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={() => emit(objs.slice(0, -1))} disabled={!objs.length}>↶</button>
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={() => zoom(0.8)}>＋</button>
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={() => zoom(1.25)}>－</button>
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={() => pan(-0.15, 0)}>←</button>
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={() => pan(0.15, 0)}>→</button>
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={() => pan(0, 0.15)}>↑</button>
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={() => pan(0, -0.15)}>↓</button>
          <button type="button" className={`rounded-md border px-2 py-1 text-xs ${unit ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`} onClick={() => setUnit((u) => !u)}>Бірлік шеңбер</button>
          <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600" onClick={() => { if (objs.length) emit([]); setPending([]); }}>Тазалау</button>
        </div>
      )}
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none rounded border border-slate-100" style={{ cursor: props.readOnly ? 'default' : 'crosshair' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { setHover(null); up(); }}>
        <rect width={W} height={H} fill="#fff" />
        {grid}
        {unit && <circle cx={sx(0)} cy={sy(0)} r={(1 / (x1 - x0)) * W} fill="none" stroke="#94a3b8" strokeDasharray="4 3" />}
        {objs.map((o, i) => {
          switch (o.t) {
            case 'pt': return <g key={i}><circle cx={sx(o.p[0])} cy={sy(o.p[1])} r={4} fill={color} /><text x={sx(o.p[0]) + 6} y={sy(o.p[1]) - 6} fontSize={10} fill="#1e3a8a">({fmt(o.p[0])}; {fmt(o.p[1])})</text></g>;
            case 'line': { const [a, b] = ext(o.a, o.b); return <line key={i} x1={sx(a[0])} y1={sy(a[1])} x2={sx(b[0])} y2={sy(b[1])} stroke={color} strokeWidth={2} strokeDasharray={o.dashed ? '6 4' : undefined} />; }
            case 'seg': return <line key={i} x1={sx(o.a[0])} y1={sy(o.a[1])} x2={sx(o.b[0])} y2={sy(o.b[1])} stroke={color} strokeWidth={2} />;
            case 'vec': return <g key={i}><line x1={sx(o.a[0])} y1={sy(o.a[1])} x2={sx(o.b[0])} y2={sy(o.b[1])} stroke="#7c3aed" strokeWidth={2} />{arrow(sx(o.a[0]), sy(o.a[1]), sx(o.b[0]), sy(o.b[1]))}</g>;
            case 'circle': return <ellipse key={i} cx={sx(o.c[0])} cy={sy(o.c[1])} rx={(o.r / (x1 - x0)) * W} ry={(o.r / (y1 - y0)) * H} fill="none" stroke={color} strokeWidth={2} />;
            case 'curve': return <path key={i} d={path(o.pts)} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={o.dashed ? '6 4' : undefined} />;
            case 'region': return <path key={i} d={path(o.pts) + 'Z'} fill="#3b82f6" fillOpacity={0.18} stroke={color} strokeDasharray="4 3" />;
          }
        })}
        {stroke && <path d={path(stroke)} fill="none" stroke="#93c5fd" strokeWidth={2} />}
        {pending.map((p, i) => <circle key={`p${i}`} cx={sx(p[0])} cy={sy(p[1])} r={4} fill="#f59e0b" />)}
        {pending.length > 0 && hover && tool !== 'region' && <line x1={sx(pending[0][0])} y1={sy(pending[0][1])} x2={sx(hover[0])} y2={sy(hover[1])} stroke="#f59e0b" strokeDasharray="4 3" />}
        {tool === 'region' && pending.length > 0 && <path d={path(hover ? [...pending, hover] : pending)} fill="none" stroke="#f59e0b" strokeDasharray="4 3" />}
      </svg>
      {props.checks && <ToolChecks checks={props.checks} />}
    </div>
  );
}

function arrow(x1: number, y1: number, x2: number, y2: number) {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 10;
  const p = (s: number) => `${x2 - L * Math.cos(a + s)},${y2 - L * Math.sin(a + s)}`;
  return <polygon points={`${x2},${y2} ${p(0.4)} ${p(-0.4)}`} fill="#7c3aed" />;
}
function niceStep(range: number) { const raw = range / 12; const p = 10 ** Math.floor(Math.log10(raw)); const m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
function round(v: number) { return Math.round(v * 1000) / 1000; }
function fmt(v: number) { const r = Math.round(v * 100) / 100; return (r < 0 ? '−' : '') + String(Math.abs(r)).replace('.', ','); }
function piLabel(k: number) { const g = gcd(Math.abs(k), 6), n = k / g, d = 6 / g; const s = n < 0 ? '−' : ''; const a = Math.abs(n); return d === 1 ? `${s}${a === 1 ? '' : a}π` : `${s}${a === 1 ? '' : a}π/${d}`; }
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function dist(a: XY, b: XY) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function dpx(a: XY, b: XY) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function segDist(p: XY, a: XY, b: XY) { const dx = b[0] - a[0], dy = b[1] - a[1]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
/** Қолмен жүргізілген сызықты тегістеу (жылжымалы орта) және сирету */
function smooth(pts: XY[]): XY[] {
  const k = 2;
  const sm = pts.map((_, i) => { let x = 0, y = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(pts.length - 1, i + k); j++) { x += pts[j][0]; y += pts[j][1]; n++; } return [x / n, y / n] as XY; });
  sm[0] = pts[0]; sm[sm.length - 1] = pts[pts.length - 1];
  const step = Math.max(1, Math.floor(sm.length / 120));
  return sm.filter((_, i) => i % step === 0 || i === sm.length - 1);
}
