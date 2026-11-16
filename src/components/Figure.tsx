import type { ReactNode } from 'react';
import { MathText } from './MathText';
import { tryCompile } from '@/lib/figure/expr';
import type { Color, Figure as FigureSpec, GeometryFigure, PlotFigure, PointRef, Pt } from '@/lib/figure/types';

/**
 * Есеп/шешім сызбасы: функция графигі (plot) немесе геометриялық сызба (geometry).
 * Таза SVG, сыртқы кітапхана жоқ. Сервер де, клиент те рендерлей алады.
 */
/** Мәтін астындағы ақ жиек — сызық үстінде оқылуы үшін. */
const HALO = { stroke: '#ffffff', strokeWidth: 3, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const };

const COLORS: Record<Color, string> = {
  blue: '#2563eb', red: '#dc2626', green: '#16a34a', orange: '#ea580c', purple: '#7c3aed', gray: '#64748b', black: '#0f172a',
};

export function Figures({ figures }: { figures?: unknown }) {
  if (!Array.isArray(figures) || figures.length === 0) return null;
  return (
    <div className="space-y-3">
      {figures.map((f, i) => <Figure key={i} figure={f} />)}
    </div>
  );
}

export function Figure({ figure }: { figure?: unknown }) {
  const f = figure as FigureSpec | undefined;
  if (!f || typeof f !== 'object') return null;
  try {
    if (f.kind === 'plot') return <Plot f={f} />;
    if (f.kind === 'geometry') return <Geometry f={f} />;
  } catch {
    return <p className="text-xs text-red-600">Сызбаны салу мүмкін болмады.</p>;
  }
  return null;
}

function Frame({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <figure className="max-w-xl rounded-lg border border-slate-200 bg-white p-2">
      {children}
      {caption && <figcaption className="mt-1 text-center text-sm text-slate-600"><MathText text={caption} /></figcaption>}
    </figure>
  );
}

// ───────────────────────── Функция графигі ─────────────────────────

/** k·π/d түріндегі белгі, бөлшек қысқартылады: 2π/6 → π/3, 6π/6 → π. */
function piLabel(k: number, d = 2): string {
  if (k === 0) return '0';
  const g = gcd(Math.abs(k), d);
  const n = k / g, m = d / g;
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  const num = `${a === 1 ? '' : a}π`;
  return m === 1 ? `${sign}${num}` : `${sign}${num}/${m}`;
}
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

function fmt(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return (r < 0 ? '−' : '') + String(Math.abs(r)).replace('.', ',');
}

function Plot({ f }: { f: PlotFigure }) {
  const [x0, x1] = f.x, [y0, y1] = f.y;
  if (!(x1 > x0 && y1 > y0)) return null;
  const W = 520, pad = { l: 34, r: 16, t: 14, b: 38 };
  const pw = W - pad.l - pad.r;
  // equal: бір бірліктің ұзындығы екі осьте бірдей (шеңбер дөңгелек болып көрінуі үшін)
  const ph = f.equal ? Math.min(560, (pw * (y1 - y0)) / (x1 - x0)) : 280;
  const H = ph + pad.t + pad.b;
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * pw;
  const sy = (y: number) => pad.t + ((y1 - y) / (y1 - y0)) * ph;
  const ax = Math.min(Math.max(0, y0), y1); // x осі y=0 (көрінбесе шетке)
  const ay = Math.min(Math.max(0, x0), x1);

  const xt: { v: number; label: string; row?: number }[] = [];
  if (f.xTicks === 'pi' || f.xTicks === 'pi6' || f.xTicks === 'pi4') {
    // Радиан белгілері: sin/cos үшін π/6 қадам (π/6, π/3, π/2, 2π/3 …), tg/ctg үшін π/4 қадам.
    // Белгілер көп болса, екі қатарға кезектесіп жазылады — бір-бірін баспайды.
    const tangent = f.xTicks === 'pi4' || (f.xTicks === 'pi' && f.curves.some((c) => /tg|ctg|tan|cot/.test(c.expr)));
    const d = tangent ? 4 : 6;
    const step = Math.PI / d;
    const count = Math.floor(x1 / step) - Math.ceil(x0 / step) + 1;
    const stagger = count > 13;
    for (let k = Math.ceil(x0 / step - 1e-9); k * step <= x1 + 1e-9; k++) {
      xt.push({ v: k * step, label: piLabel(k, d), row: stagger && Math.abs(k) % 2 === 1 ? 1 : 0 });
    }
  } else {
    const step = typeof f.xTicks === 'number' && f.xTicks > 0 ? f.xTicks : niceStep(x1 - x0);
    for (let v = Math.ceil(x0 / step) * step; v <= x1 + 1e-9; v += step) xt.push({ v, label: fmt(v) });
  }
  const ys = f.yTicks && f.yTicks > 0 ? f.yTicks : niceStep(y1 - y0);
  const yt: number[] = [];
  for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) yt.push(v);

  const clipId = `clip-${Math.abs(hash(JSON.stringify(f)))}`;
  const curves = f.curves.map((c, i) => {
    const fn = tryCompile(c.expr);
    const color = COLORS[c.color ?? (c.style === 'dashed' ? 'gray' : 'blue')];
    if (!fn) return { c, color, d: '', i };
    const [a, b] = c.domain ?? [x0, x1];
    const N = 900, span = y1 - y0;
    let d = '', prevY: number | null = null;
    for (let k = 0; k <= N; k++) {
      const x = Math.max(a, x0) + ((Math.min(b, x1) - Math.max(a, x0)) * k) / N;
      const y = fn(x);
      const ok = Number.isFinite(y) && y > y0 - 3 * span && y < y1 + 3 * span;
      const jump = prevY !== null && ok && Math.abs(y - prevY) > span; // tg асимптотасы
      if (!ok) { prevY = null; continue; }
      d += `${prevY === null || jump ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
      prevY = y;
    }
    return { c, color, d, i };
  });

  return (
    <Frame caption={f.caption}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Функция графигі">
        <defs>
          <clipPath id={clipId}><rect x={pad.l} y={pad.t} width={pw} height={ph} /></clipPath>
          <marker id={`${clipId}-arr`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#334155" />
          </marker>
        </defs>
        {xt.map((t) => <line key={`gx${t.v}`} x1={sx(t.v)} x2={sx(t.v)} y1={pad.t} y2={pad.t + ph} stroke="#e2e8f0" />)}
        {yt.map((v) => <line key={`gy${v}`} x1={pad.l} x2={pad.l + pw} y1={sy(v)} y2={sy(v)} stroke="#e2e8f0" />)}
        <line x1={pad.l} x2={pad.l + pw + 8} y1={sy(ax)} y2={sy(ax)} stroke="#334155" strokeWidth={1.2} markerEnd={`url(#${clipId}-arr)`} />
        <line x1={sx(ay)} x2={sx(ay)} y1={pad.t + ph} y2={pad.t - 6} stroke="#334155" strokeWidth={1.2} markerEnd={`url(#${clipId}-arr)`} />
        <text x={pad.l + pw + 4} y={sy(ax) - 6} fontSize="13" fontStyle="italic" fill="#334155">x</text>
        <text x={sx(ay) + 6} y={pad.t + 4} fontSize="13" fontStyle="italic" fill="#334155">y</text>
        {xt.filter((t) => Math.abs(t.v) > 1e-9).map((t) => (
          <g key={`tx${t.v}`}>
            <line x1={sx(t.v)} x2={sx(t.v)} y1={sy(ax) - 3} y2={sy(ax) + 3} stroke="#334155" />
            <text x={sx(t.v)} y={sy(ax) + 15 + (t.row ? 12 : 0)} fontSize={xt.length > 13 ? 10 : 11} textAnchor="middle" fill="#334155" {...HALO}>{t.label}</text>
          </g>
        ))}
        {yt.filter((v) => Math.abs(v) > 1e-9).map((v) => (
          <g key={`ty${v}`}>
            <line x1={sx(ay) - 3} x2={sx(ay) + 3} y1={sy(v)} y2={sy(v)} stroke="#334155" />
            <text x={sx(ay) - 6} y={sy(v) + 4} fontSize="11" textAnchor="end" fill="#334155" {...HALO}>{fmt(v)}</text>
          </g>
        ))}
        <text x={sx(ay) - 6} y={sy(ax) + 15} fontSize="11" textAnchor="end" fill="#334155" {...HALO}>0</text>
        <g clipPath={`url(#${clipId})`}>
          {(f.hlines ?? []).map((hl, i) => (
            <line key={`h${i}`} x1={pad.l} x2={pad.l + pw} y1={sy(hl.y)} y2={sy(hl.y)} stroke={COLORS[hl.color ?? 'orange']} strokeWidth={1.4} strokeDasharray="2 4" />
          ))}
          {(f.vlines ?? []).map((v, i) => (
            <line key={`v${i}`} x1={sx(v.x)} x2={sx(v.x)} y1={pad.t} y2={pad.t + ph} stroke={COLORS[v.color ?? 'gray']} strokeWidth={1.2} strokeDasharray="2 4" />
          ))}
          {curves.map(({ c, color, d, i }) => (
            <path key={i} d={d} fill="none" stroke={color} strokeWidth={c.style === 'dashed' ? 1.6 : 2.8}
              strokeDasharray={c.style === 'dashed' ? '7 5' : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {(f.points ?? []).map((p, i) => (
            <g key={`p${i}`}>
              <circle cx={sx(p.x)} cy={sy(p.y)} r={3.5} fill={COLORS[p.color ?? 'black']} />
              {p.label && <text x={sx(p.x) + 6} y={sy(p.y) - 6} fontSize="12" fill={COLORS[p.color ?? 'black']} {...HALO}>{p.label}</text>}
            </g>
          ))}
        </g>
      </svg>
      {curves.some(({ c }) => c.label) && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-1 text-sm">
          {curves.filter(({ c }) => c.label).map(({ c, color, i }) => (
            <li key={i} className="flex items-center gap-2">
              <svg width="30" height="10" aria-hidden="true">
                <line x1="1" x2="29" y1="5" y2="5" stroke={color} strokeWidth={c.style === 'dashed' ? 1.6 : 2.8} strokeDasharray={c.style === 'dashed' ? '6 4' : undefined} />
              </svg>
              <MathText text={c.label!} className={c.style === 'dashed' ? 'text-slate-600' : 'font-medium'} />
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function niceStep(range: number): number {
  const raw = range / 10;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ───────────────────────── Геометриялық сызба ─────────────────────────

const DIRS: Record<string, Pt> = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0], ne: [0.7, 0.7], nw: [-0.7, 0.7], se: [0.7, -0.7], sw: [-0.7, -0.7] };

function Geometry({ f }: { f: GeometryFigure }) {
  const P = f.points ?? {};
  const get = (r: PointRef): Pt | null => (Array.isArray(r) ? r : P[r] ?? null);
  const names = Object.keys(P);
  if (!names.length) return null;

  const circles = (f.circles ?? []).map((c) => {
    const ctr = get(c.center);
    const thr = c.through ? get(c.through) : null;
    const r = c.r ?? (ctr && thr ? Math.hypot(thr[0] - ctr[0], thr[1] - ctr[1]) : 0);
    return ctr && r > 0 ? { ctr, r, dashed: c.dashed } : null;
  }).filter((c): c is { ctr: Pt; r: number; dashed: boolean | undefined } => !!c);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  names.forEach((n) => grow(P[n][0], P[n][1]));
  circles.forEach((c) => { grow(c.ctr[0] - c.r, c.ctr[1] - c.r); grow(c.ctr[0] + c.r, c.ctr[1] + c.r); });
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const maxW = 440, maxH = 300, pad = 36;
  const k = Math.min(maxW / spanX, maxH / spanY);
  const W = spanX * k + 2 * pad, H = spanY * k + 2 * pad;
  const tx = (p: Pt): Pt => [pad + (p[0] - minX) * k, pad + (maxY - p[1]) * k];

  const cx = names.reduce((s, n) => s + P[n][0], 0) / names.length;
  const cy = names.reduce((s, n) => s + P[n][1], 0) / names.length;
  const stroke = '#0f172a';

  const segs = (f.segments ?? []).map((s) => (Array.isArray(s) ? { from: s[0], to: s[1], dashed: false } : s));

  const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

  return (
    <Frame caption={f.caption}>
      <svg viewBox={`0 0 ${W.toFixed(1)} ${H.toFixed(1)}`} className="mx-auto h-auto w-full" style={{ maxWidth: W }} role="img" aria-label="Геометриялық сызба">
        {(f.polygons ?? []).map((poly, i) => {
          const pts = poly.map((n) => get(n)).filter((p): p is Pt => !!p).map(tx);
          return <polygon key={`pg${i}`} points={pts.map((p) => p.join(',')).join(' ')} fill="#eff6ff" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />;
        })}
        {circles.map((c, i) => {
          const [x, y] = tx(c.ctr);
          return <circle key={`c${i}`} cx={x} cy={y} r={c.r * k} fill="none" stroke={stroke} strokeWidth={1.6} strokeDasharray={c.dashed ? '6 4' : undefined} />;
        })}
        {segs.map((s, i) => {
          const a = get(s.from), b = get(s.to);
          if (!a || !b) return null;
          const [x1, y1] = tx(a), [x2, y2] = tx(b);
          return <line key={`s${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={1.6} strokeDasharray={s.dashed ? '6 4' : undefined} />;
        })}
        {(f.right ?? []).map(([v, a, b], i) => {
          const V = get(v), A = get(a), B = get(b);
          if (!V || !A || !B) return null;
          const s = 11; // пиксель
          const [vx, vy] = tx(V);
          const ua = unit([tx(A)[0] - vx, tx(A)[1] - vy]), ub = unit([tx(B)[0] - vx, tx(B)[1] - vy]);
          const p1 = [vx + ua[0] * s, vy + ua[1] * s], p2 = [vx + (ua[0] + ub[0]) * s, vy + (ua[1] + ub[1]) * s], p3 = [vx + ub[0] * s, vy + ub[1] * s];
          return <polyline key={`r${i}`} points={`${p1} ${p2} ${p3}`} fill="none" stroke={stroke} strokeWidth={1.3} />;
        })}
        {(f.angles ?? []).map((an, i) => {
          const V = get(an.at), A = get(an.from), B = get(an.to);
          if (!V || !A || !B) return null;
          const [vx, vy] = tx(V);
          const ua = unit([tx(A)[0] - vx, tx(A)[1] - vy]), ub = unit([tx(B)[0] - vx, tx(B)[1] - vy]);
          // кіші бұрыш бойымен доға (SVG-де y төмен қарай)
          const cross = ua[0] * ub[1] - ua[1] * ub[0];
          const sweep = cross > 0 ? 1 : 0;
          const arcs = Array.from({ length: an.arcs ?? 1 }, (_, j) => 18 + j * 4);
          const mid = unit([ua[0] + ub[0], ua[1] + ub[1]]);
          return (
            <g key={`a${i}`}>
              {arcs.map((r) => (
                <path key={r} d={`M${vx + ua[0] * r},${vy + ua[1] * r} A${r},${r} 0 0 ${sweep} ${vx + ub[0] * r},${vy + ub[1] * r}`} fill="none" stroke="#dc2626" strokeWidth={1.4} />
              ))}
              {an.label && <text x={vx + mid[0] * 34} y={vy + mid[1] * 34 + 4} fontSize="13" textAnchor="middle" fill="#dc2626" {...HALO}>{an.label}</text>}
            </g>
          );
        })}
        {(f.lengths ?? []).map((l, i) => {
          const A = get(l.seg[0]), B = get(l.seg[1]);
          if (!A || !B) return null;
          const m: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
          let n = unit([-(B[1] - A[1]), B[0] - A[0]]);
          if ((m[0] - cx) * n[0] + (m[1] - cy) * n[1] < 0) n = [-n[0], -n[1]]; // фигурадан сыртқа
          const [mx, my] = tx(m);
          return <text key={`l${i}`} x={mx + n[0] * 14} y={my - n[1] * 14 + 4} fontSize="13" textAnchor="middle" fill="#1d4ed8" {...HALO}>{l.text}</text>;
        })}
        {names.map((n) => {
          const [x, y] = tx(P[n]);
          const hidden = f.hideLabels?.includes(n);
          let dir = f.labelPos?.[n] ? DIRS[f.labelPos[n]] : null;
          if (!dir) { const d = unit([P[n][0] - cx, P[n][1] - cy]); dir = d[0] === 0 && d[1] === 0 ? DIRS.ne : d; }
          return (
            <g key={`pt${n}`}>
              <circle cx={x} cy={y} r={2.6} fill={stroke} />
              {!hidden && <text x={x + dir[0] * 14} y={y - dir[1] * 14 + 5} fontSize="15" fontStyle="italic" textAnchor="middle" fill={stroke} {...HALO}>{n}</text>}
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}
