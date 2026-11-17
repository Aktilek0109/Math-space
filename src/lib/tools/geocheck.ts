/**
 * М7: геометрия тақтасын тексеру (таза функция). Дәлдік емес, НИЕТ бағаланады:
 * кілт сызбасындағы аталған нүктелер, кесінділер, тік бұрыштар, нүктенің кесіндіде жатуы, шеңберлер және белгілер.
 */
import type { GeometryFigure, Pt } from '../figure/types';
import type { GeoSketch, ToolCheck, XY } from './types';

const norm = (s: string) => s.replace(/[\s$'’]/g, '').replace(/_/g, '').replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 8320)).toUpperCase();
const ang = (v: XY, a: XY, b: XY) => {
  const u = [a[0] - v[0], a[1] - v[1]], w = [b[0] - v[0], b[1] - v[1]];
  const c = (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1]) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
};
const distToSeg = (p: XY, a: XY, b: XY) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

export function keyGeometry(figs: unknown[]): GeometryFigure | null {
  const g = figs.filter((f): f is GeometryFigure => !!f && typeof f === 'object' && (f as { kind?: string }).kind === 'geometry');
  // ең толық сызба (нүктесі көп)
  return g.sort((a, b) => Object.keys(b.points).length - Object.keys(a.points).length)[0] ?? null;
}

export function checkGeo(sk: GeoSketch | null | undefined, key: GeometryFigure | null | undefined): ToolCheck[] {
  const out: ToolCheck[] = [];
  if (!key) return out;
  if (!sk || !sk.points.length) return [{ status: 'warn', text: 'Тақтада сызба салынбаған' }];
  const hidden = new Set(key.hideLabels ?? []);
  const keyNames = Object.keys(key.points).filter((n) => !hidden.has(n) && /^[A-ZА-Я]/.test(n));
  const byLabel = new Map(sk.points.map((p) => [norm(p.label), p]));
  const P = (n: string) => byLabel.get(norm(n))?.p;
  const scale = (() => { const xs = sk.points.map((p) => p.p[0]), ys = sk.points.map((p) => p.p[1]); return Math.max(40, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))); })();

  // 1. Нүктелер белгіленді ме
  const missing = keyNames.filter((n) => !P(n));
  if (missing.length) out.push({ status: 'error', text: `Белгіленбеген нүктелер: ${missing.join(', ')}` });
  else out.push({ status: 'ok', text: `Барлық нүкте белгіленген (${keyNames.join(', ')})` });

  // 2. Кесінділер (көпбұрыш қабырғалары + segments)
  const pairs: [string, string][] = [];
  for (const poly of key.polygons ?? []) poly.forEach((v, i) => pairs.push([v, poly[(i + 1) % poly.length]]));
  for (const s of key.segments ?? []) {
    if (Array.isArray(s)) pairs.push([s[0], s[1]]);
    else if (typeof s.from === 'string' && typeof s.to === 'string') pairs.push([s.from, s.to]);
  }
  const has = (a: string, b: string) => {
    const pa = P(a), pb = P(b);
    if (!pa || !pb) return false;
    // тікелей кесінді немесе екі нүкте де бір салынған кесіндіде/түзуде жатыр
    return sk.objs.some((o) => {
      if (o.t !== 'seg' && o.t !== 'line') return false;
      const A = sk.points.find((p) => p.id === o.a)?.p, B = sk.points.find((p) => p.id === o.b)?.p;
      if (!A || !B) return false;
      const tol = scale * 0.03;
      const onIt = (q: XY) => (o.t === 'seg' ? distToSeg(q, A, B) : lineDist(q, A, B)) <= tol;
      return onIt(pa) && onIt(pb);
    });
  };
  const uniq = [...new Map(pairs.filter(([a, b]) => !hidden.has(a) && !hidden.has(b)).map(([a, b]) => [[a, b].sort().join('|'), [a, b] as [string, string]])).values()];
  const noSeg = uniq.filter(([a, b]) => P(a) && P(b) && !has(a, b));
  if (uniq.length) {
    if (noSeg.length) out.push({ status: 'error', text: `Салынбаған кесінділер: ${noSeg.map(([a, b]) => a + b).join(', ')}` });
    else out.push({ status: 'ok', text: 'Қажетті кесінділердің бәрі салынған' });
  }

  // 3. Тік бұрыштар
  for (const r of key.right ?? []) {
    const [v, a, b] = r;
    const pv = P(v), pa = P(a), pb = P(b);
    if (!pv || !pa || !pb) continue;
    const d = ang(pv, pa, pb);
    const marked = sk.objs.some((o) => o.t === 'right' && norm(lbl(sk, o.at)) === norm(v) && [norm(lbl(sk, o.a)), norm(lbl(sk, o.b))].sort().join() === [norm(a), norm(b)].sort().join());
    const markedAny = sk.objs.some((o) => o.t === 'right' && norm(lbl(sk, o.at)) === norm(v));
    if (Math.abs(d - 90) > 10) out.push({ status: 'error', text: `∠${a}${v}${b} тік болуы керек (сызбада ≈${Math.round(d)}°)` });
    else if (!marked && !markedAny) out.push({ status: 'warn', text: `∠${a}${v}${b} = 90° — тік бұрыш белгісін қойыңыз` });
    else out.push({ status: 'ok', text: `∠${a}${v}${b} тік және белгіленген` });
  }

  // 4. Кесіндіде жататын нүктелер (кілтте бір түзуде жатқан үш аталған нүкте)
  const kp = (n: string) => key.points[n] as Pt | undefined;
  for (const [a, b] of uniq) {
    const A = kp(a), B = kp(b);
    if (!A || !B) continue;
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (const n of keyNames) {
      if (n === a || n === b) continue;
      const Q = kp(n);
      if (!Q || distToSeg(Q, A, B) > len * 0.01) continue;
      const t = ((Q[0] - A[0]) * (B[0] - A[0]) + (Q[1] - A[1]) * (B[1] - A[1])) / (len * len);
      if (t < 0.02 || t > 0.98) continue;
      const pa = P(a), pb = P(b), pq = P(n);
      if (!pa || !pb || !pq) continue;
      const sl = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      if (distToSeg(pq, pa, pb) > sl * 0.05) out.push({ status: 'error', text: `${n} нүктесі ${a}${b} кесіндісінде жатуы керек` });
    }
  }

  // 5. Шеңберлер
  const kc = key.circles ?? [];
  if (kc.length) {
    const sc = sk.objs.filter((o) => o.t === 'circle');
    if (sc.length < kc.length) out.push({ status: 'error', text: `Шеңбер салынбаған (керек: ${kc.length}, салынғаны: ${sc.length})` });
    else {
      for (const c of kc) {
        if (typeof c.center !== 'string') continue;
        const ok = sc.some((o) => o.t === 'circle' && norm(lbl(sk, o.c)) === norm(c.center as string));
        if (!ok) out.push({ status: 'warn', text: `Центрі ${c.center} болатын шеңбер табылмады` });
      }
      if (!out.some((x) => /Шеңбер|шеңбер табылмады/.test(x.text))) out.push({ status: 'ok', text: 'Шеңбер(лер) салынған' });
    }
  }

  // 6. Берілген ұзындықтар жазылды ма
  const lens = key.lengths ?? [];
  const noLen = lens.filter((l) => !sk.objs.some((o) => o.t === 'len' && [norm(lbl(sk, o.a)), norm(lbl(sk, o.b))].sort().join() === [norm(l.seg[0]), norm(l.seg[1])].sort().join()));
  if (lens.length) {
    if (noLen.length) out.push({ status: 'warn', text: `Сызбаға берілгендерді жазыңыз: ${noLen.map((l) => `${l.seg[0]}${l.seg[1]} = ${l.text.replace(/\$/g, '')}`).join(', ')}` });
    else out.push({ status: 'ok', text: 'Берілген ұзындықтар сызбада көрсетілген' });
  }
  return out;
}

function lbl(sk: GeoSketch, id: string) { return sk.points.find((p) => p.id === id)?.label ?? ''; }
function lineDist(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.abs(dy * (p[0] - a[0]) - dx * (p[1] - a[1])) / (Math.hypot(dx, dy) || 1);
}

// ───────── эскизді түзету (М7: қолмен сызылған сызық → кесінді/шеңбер) ─────────
/** Рамер–Дуглас–Пекер: сынық сызықты негізгі төбелерге дейін жеңілдету */
export function simplify(pts: XY[], eps: number): XY[] {
  if (pts.length < 3) return pts.slice();
  let idx = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = lineDist(pts[i], pts[0], pts[pts.length - 1]); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
  const a = simplify(pts.slice(0, idx + 1), eps), b = simplify(pts.slice(idx), eps);
  return [...a.slice(0, -1), ...b];
}

export type Recognized = { kind: 'circle'; c: XY; r: number } | { kind: 'poly'; pts: XY[]; closed: boolean };

/** Штрихты тану: шеңбер (тұйық және радиусы тұрақты) немесе сынық/кесінді */
export function recognize(stroke: XY[]): Recognized | null {
  if (stroke.length < 2) return null;
  const xs = stroke.map((p) => p[0]), ys = stroke.map((p) => p[1]);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (diag < 8) return null;
  const first = stroke[0], last = stroke[stroke.length - 1];
  const closed = Math.hypot(last[0] - first[0], last[1] - first[1]) < diag * 0.2;
  if (closed && stroke.length > 8) {
    const c: XY = [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length];
    const rs = stroke.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]));
    const r = rs.reduce((a, b) => a + b, 0) / rs.length;
    const dev = Math.sqrt(rs.reduce((s, v) => s + (v - r) ** 2, 0) / rs.length) / r;
    const simp = simplify(stroke, diag * 0.08);
    if (dev < 0.13 && simp.length > 5) return { kind: 'circle', c, r };
  }
  let s = simplify(stroke, Math.max(6, diag * 0.06));
  if (closed && s.length >= 4) s = s.slice(0, -1);
  return { kind: 'poly', pts: s, closed: closed && s.length >= 3 };
}
