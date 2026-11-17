/**
 * М6: график тақтасын тексеру (таза функция). Кілт — шешімдегі/шарттағы plot сызбасы.
 * Оқушы нүктелері графикте жата ма, салған қисығы графиктен ауытқымай ма, маңызды нүктелер қойылды ма.
 */
import { tryCompile } from '../figure/expr.ts';
import type { PlotFigure } from '../figure/types';
import type { GraphSketch, ToolCheck, XY } from './types';

const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');

export function checkGraph(sk: GraphSketch | null | undefined, key: PlotFigure | null | undefined): ToolCheck[] {
  const out: ToolCheck[] = [];
  if (!key) return out;
  if (!sk || !sk.objs.length) return [{ status: 'warn', text: 'График тақтасында ештеңе салынбаған' }];
  const main = key.curves.filter((c) => c.style !== 'dashed');
  const curves = (main.length ? main : key.curves)
    .map((c) => ({ f: tryCompile(c.expr), dom: c.domain ?? key.x, label: c.label ?? c.expr }))
    .filter((c): c is { f: (x: number) => number; dom: [number, number]; label: string } => !!c.f);
  const tol = Math.max(0.05, (key.y[1] - key.y[0]) * 0.035);
  const tolX = Math.max(0.05, (key.x[1] - key.x[0]) * 0.02);
  // нүкте қисыққа жақын ба: нормаланған эллипс (x бойынша tolX, y бойынша tol) — тік учаскелерде де жұмыс істейді
  const near = ([x, y]: XY) => curves.some((c) => {
    for (let k = -8; k <= 8; k++) {
      const dx = (k / 8) * tolX, xx = x + dx;
      if (xx < c.dom[0] - 1e-9 || xx > c.dom[1] + 1e-9) continue;
      const fy = c.f(xx);
      if (Number.isFinite(fy) && (dx / tolX) ** 2 + ((fy - y) / tol) ** 2 <= 1) return true;
    }
    return false;
  });

  const pts = sk.objs.filter((o) => o.t === 'pt') as { t: 'pt'; p: XY }[];
  const bad = pts.filter((o) => !near(o.p));
  if (pts.length) {
    if (bad.length) out.push({ status: 'error', text: `Графикте жатпайтын нүктелер: ${bad.slice(0, 4).map((o) => `(${fmt(o.p[0])}; ${fmt(o.p[1])})`).join(', ')}` });
    else out.push({ status: 'ok', text: `Барлық ${pts.length} нүкте графикте жатыр` });
  }
  // маңызды нүктелер (кілттегі белгіленген нүктелер)
  const keyPts = (key.points ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (keyPts.length) {
    const all: XY[] = [...pts.map((o) => o.p), ...sk.objs.flatMap((o) => (o.t === 'curve' || o.t === 'region' ? [] : o.t === 'circle' ? [o.c] : o.t === 'pt' ? [] : [o.a, o.b]))];
    const missing = keyPts.filter((k) => !all.some(([x, y]) => Math.abs(x - k.x) <= tolX * 2 && Math.abs(y - k.y) <= tol * 1.5));
    if (missing.length) out.push({ status: 'warn', text: `Маңызды нүктелер белгіленбеген: ${missing.slice(0, 4).map((k) => (k.label ? `${k.label.replace(/\$/g, '')} ` : '') + `(${fmt(k.x)}; ${fmt(k.y)})`).join(', ')}` });
    else out.push({ status: 'ok', text: 'Маңызды нүктелер (осьпен қиылысу, төбе т.б.) белгіленген' });
  }
  // қисықтар мен түзулер
  const strokes: XY[][] = sk.objs.flatMap((o) => {
    if (o.t === 'curve') return [o.pts];
    if (o.t === 'line' || o.t === 'seg') {
      const n = 24; const [a, b] = o.t === 'line' ? extend(o.a, o.b, key) : [o.a, o.b];
      return [Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as XY)];
    }
    return [];
  });
  if (strokes.length) {
    const samples = strokes.flat().filter(([x, y]) => x >= key.x[0] && x <= key.x[1] && y >= key.y[0] - tol && y <= key.y[1] + tol);
    if (samples.length) {
      const offs = samples.filter((p) => !near(p));
      const share = 1 - offs.length / samples.length;
      if (share >= 0.8) out.push({ status: 'ok', text: `Сызылған график дұрыс өтеді (${Math.round(share * 100)}% нүктесі кілт графигінде)` });
      else {
        const xs = offs.map((p) => p[0]).sort((a, b) => a - b);
        out.push({ status: 'error', text: `Сызылған график ауытқиды: тек ${Math.round(share * 100)}%-ы дұрыс, ауытқу x ≈ ${fmt(xs[Math.floor(xs.length / 2)])} маңында` });
      }
      // қамту: кілт қисығының x-аралығының қанша бөлігі салынды
      const dom = curves.reduce((s, c) => s + Math.max(0, Math.min(c.dom[1], key.x[1]) - Math.max(c.dom[0], key.x[0])), 0) || (key.x[1] - key.x[0]);
      const bins = 20, step = (key.x[1] - key.x[0]) / bins;
      const covered = new Set(samples.filter((p) => near(p)).map((p) => Math.floor((p[0] - key.x[0]) / step)));
      const need = Math.max(1, Math.round((dom / (key.x[1] - key.x[0])) * bins));
      if (covered.size < need * 0.6) out.push({ status: 'warn', text: 'График толық емес: анықталу облысының көп бөлігі салынбаған' });
    }
  }
  if (!pts.length && !strokes.length) out.push({ status: 'warn', text: 'Нүкте немесе график сызығы жоқ — тексеретін ештеңе табылмады' });
  return out;
}

function extend(a: XY, b: XY, key: PlotFigure): [XY, XY] {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.abs(dx) < 1e-9) return [[a[0], key.y[0]], [a[0], key.y[1]]];
  const k = dy / dx;
  return [[key.x[0], a[1] + k * (key.x[0] - a[0])], [key.x[1], a[1] + k * (key.x[1] - a[0])]];
}
