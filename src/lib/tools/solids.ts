/** М8: 3D денелер және қима (таза функциялар, three.js-сіз). */
export type V3 = [number, number, number];
export interface Polyhedron { name: string; labels: string[]; verts: V3[]; edges: [number, number][] }
export type SolidKind = 'cube' | 'box' | 'prism3' | 'prism6' | 'pyr3' | 'pyr4' | 'cylinder' | 'cone' | 'sphere';
export const SOLID_LABEL: Record<SolidKind, string> = {
  cube: 'Куб', box: 'Параллелепипед', prism3: 'Үшбұрышты призма', prism6: 'Алтыбұрышты призма',
  pyr3: 'Үшбұрышты пирамида', pyr4: 'Төртбұрышты пирамида', cylinder: 'Цилиндр', cone: 'Конус', sphere: 'Шар',
};

const ring = (n: number, r: number, y: number, start = Math.PI / n): V3[] =>
  Array.from({ length: n }, (_, i) => { const a = start + (2 * Math.PI * i) / n; return [r * Math.cos(a), y, r * Math.sin(a)] as V3; });
const prismEdges = (n: number) => {
  const e: [number, number][] = [];
  for (let i = 0; i < n; i++) { e.push([i, (i + 1) % n], [n + i, n + ((i + 1) % n)], [i, n + i]); }
  return e;
};
const baseLabels = (n: number) => 'ABCDEF'.slice(0, n).split('');

export function polyhedron(kind: SolidKind): Polyhedron | null {
  switch (kind) {
    case 'cube': case 'box': {
      const [a, h, c] = kind === 'cube' ? [1, 1, 1] : [1.4, 1, 0.8];
      const base: V3[] = [[-a, -h, c], [a, -h, c], [a, -h, -c], [-a, -h, -c]];
      return { name: kind, labels: ['A', 'B', 'C', 'D', 'A₁', 'B₁', 'C₁', 'D₁'], verts: [...base, ...base.map(([x, , z]) => [x, h, z] as V3)], edges: prismEdges(4) };
    }
    case 'prism3': case 'prism6': {
      const n = kind === 'prism3' ? 3 : 6;
      const b = ring(n, 1.1, -1, kind === 'prism3' ? Math.PI / 2 : 0);
      return { name: kind, labels: [...baseLabels(n), ...baseLabels(n).map((l) => l + '₁')], verts: [...b, ...b.map(([x, , z]) => [x, 1, z] as V3)], edges: prismEdges(n) };
    }
    case 'pyr3': case 'pyr4': {
      const n = kind === 'pyr3' ? 3 : 4;
      const b = ring(n, 1.2, -0.9, kind === 'pyr3' ? Math.PI / 2 : Math.PI / 4);
      const e: [number, number][] = [];
      for (let i = 0; i < n; i++) e.push([i, (i + 1) % n], [i, n]);
      return { name: kind, labels: [...baseLabels(n), 'S'], verts: [...b, [0, 1.1, 0]], edges: e };
    }
    default: return null;
  }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Үш нүкте арқылы өтетін жазықтықпен дөңес көпжақтың қимасы (төбелері ретімен) */
export function section(p: Polyhedron, pts: [V3, V3, V3]): V3[] {
  const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
  if (Math.hypot(...n) < 1e-9) return [];
  const s = (v: V3) => dot(n, sub(v, pts[0]));
  const out: V3[] = [];
  const add = (v: V3) => { if (!out.some((u) => Math.hypot(...sub(u, v)) < 1e-6)) out.push(v); };
  for (const [i, j] of p.edges) {
    const a = p.verts[i], b = p.verts[j], sa = s(a), sb = s(b);
    if (Math.abs(sa) < 1e-9) add(a);
    if (Math.abs(sb) < 1e-9) add(b);
    if (sa * sb < 0) add(lerp(a, b, sa / (sa - sb)));
  }
  if (out.length < 3) return out;
  // жазықтықтағы бұрыш бойынша реттеу
  const c: V3 = [0, 1, 2].map((k) => out.reduce((t, v) => t + v[k], 0) / out.length) as V3;
  const u = sub(out[0], c), w = cross(n, u);
  return out.sort((a, b) => Math.atan2(dot(sub(a, c), w), dot(sub(a, c), u)) - Math.atan2(dot(sub(b, c), w), dot(sub(b, c), u)));
}

/** Қырдағы нүкте: [қыр индексі, t] → координата және аты (мыс. «AB-ның ортасы») */
export function edgePoint(p: Polyhedron, edge: number, t: number): { v: V3; name: string } {
  const [i, j] = p.edges[edge];
  const v = lerp(p.verts[i], p.verts[j], t);
  const nm = `${p.labels[i]}${p.labels[j]}`;
  const name = t < 0.02 ? p.labels[i] : t > 0.98 ? p.labels[j] : Math.abs(t - 0.5) < 0.02 ? `${nm} ортасы` : `${nm} қырында`;
  return { v, name };
}
