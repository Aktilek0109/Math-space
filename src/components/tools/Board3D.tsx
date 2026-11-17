'use client';

import { useEffect, useRef, useState } from 'react';
import { edgePoint, polyhedron, section, SOLID_LABEL, type Polyhedron, type SolidKind, type V3 } from '@/lib/tools/solids';
import type { SolidSketch } from '@/lib/tools/types';

/**
 * М8: 3D тақта (10–11-сынып). three.js CDN-нен тек осы құрал ашылғанда жүктеледі.
 * Денелер, бұру (сүйреу), масштаб, төбе белгілері; көпжақтарда үш нүкте арқылы қима салу.
 */
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
/* eslint-disable @typescript-eslint/no-explicit-any */
let threeP: Promise<any> | null = null;
const loadThree = () => (threeP ??= import(/* webpackIgnore: true */ THREE_URL as string));

const SNAPS = [0, 1 / 3, 0.5, 2 / 3, 1];
const POLY_NAME: Record<number, string> = { 3: 'үшбұрыш', 4: 'төртбұрыш', 5: 'бесбұрыш', 6: 'алтыбұрыш' };

export function Board3D(props: { value?: SolidSketch | null; onChange?: (s: SolidSketch) => void; readOnly?: boolean }) {
  const [solid, setSolid] = useState<SolidKind>((props.value?.solid as SolidKind) ?? 'cube');
  const [marks, setMarks] = useState<{ edge: number; t: number }[]>(props.value?.marks ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [labels, setLabels] = useState<{ text: string; x: number; y: number; hl?: boolean }[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ project: (v: V3) => [number, number]; render: () => void } | null>(null);
  const cam = useRef({ theta: 0.7, phi: 1.1, dist: 5.2 });
  const poly: Polyhedron | null = polyhedron(solid);

  function emit(s: SolidKind, m: { edge: number; t: number }[]) { props.onChange?.({ kind: 'solid3d', solid: s, marks: m }); }

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    loadThree().then((T: any) => {
      if (disposed || !host.current) return;
      const el = host.current;
      const w = el.clientWidth, h = Math.round(w * 0.72);
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.setSize(w, h);
      el.prepend(renderer.domElement);
      renderer.domElement.style.touchAction = 'none';
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(40, w / h, 0.1, 100);
      scene.add(new T.AmbientLight(0xffffff, 0.9));
      const dl = new T.DirectionalLight(0xffffff, 0.6); dl.position.set(3, 5, 4); scene.add(dl);
      const group = new T.Group(); scene.add(group);
      const faceMat = new T.MeshLambertMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false });
      const edgeMat = new T.LineBasicMaterial({ color: 0x0f172a });

      if (poly) {
        // қырлар
        const pos: number[] = [];
        for (const [i, j] of poly.edges) pos.push(...poly.verts[i], ...poly.verts[j]);
        const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        group.add(new T.LineSegments(eg, edgeMat));
        // жақтар (дөңес көпжақ: төбелерден үшбұрыштар — центрден веер)
        const tri: number[] = [];
        for (const f of faces(poly)) for (let k = 1; k + 1 < f.length; k++) tri.push(...poly.verts[f[0]], ...poly.verts[f[k]], ...poly.verts[f[k + 1]]);
        const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(tri, 3)); fg.computeVertexNormals();
        group.add(new T.Mesh(fg, faceMat));
        // қима
        const pts = marks.map((m) => edgePoint(poly, m.edge, m.t).v);
        for (const v of pts) { const s = new T.Mesh(new T.SphereGeometry(0.05, 12, 12), new T.MeshBasicMaterial({ color: 0xf59e0b })); s.position.set(...v); group.add(s); }
        if (pts.length >= 3) {
          const sec = section(poly, [pts[0], pts[1], pts[2]]);
          if (sec.length >= 3) {
            const st: number[] = [];
            for (let k = 1; k + 1 < sec.length; k++) st.push(...sec[0], ...sec[k], ...sec[k + 1]);
            const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(st, 3));
            group.add(new T.Mesh(sg, new T.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false })));
            const lp: number[] = []; sec.forEach((v, i) => lp.push(...v, ...sec[(i + 1) % sec.length]));
            const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
            group.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0xb91c1c })));
          }
        }
      } else {
        const geo = solid === 'cylinder' ? new T.CylinderGeometry(1, 1, 2, 48) : solid === 'cone' ? new T.ConeGeometry(1.1, 2.1, 48) : new T.SphereGeometry(1.2, 40, 24);
        group.add(new T.Mesh(geo, faceMat));
        const eg = solid === 'sphere'
          ? new T.EdgesGeometry(new T.SphereGeometry(1.2, 16, 8), 1)
          : new T.EdgesGeometry(geo, 30);
        group.add(new T.LineSegments(eg, new T.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: solid === 'sphere' ? 0.35 : 1 })));
        if (solid === 'sphere') {
          const eq = new T.EllipseCurve(0, 0, 1.2, 1.2).getPoints(64);
          const g = new T.BufferGeometry().setFromPoints(eq.map((p: any) => new T.Vector3(p.x, 0, p.y)));
          group.add(new T.LineLoop(g, new T.LineBasicMaterial({ color: 0x0f172a })));
        }
        // ось/биіктік
        const ax = new T.BufferGeometry().setFromPoints([new T.Vector3(0, -1.05, 0), new T.Vector3(0, 1.05, 0)]);
        group.add(new T.Line(ax, new T.LineDashedMaterial({ color: 0x64748b, dashSize: 0.08, gapSize: 0.06 })).computeLineDistances());
      }

      const v3 = new T.Vector3();
      const project = (v: V3): [number, number] => { v3.set(...v).project(camera); return [(v3.x + 1) / 2 * w, (1 - v3.y) / 2 * h]; };
      const render = () => {
        const c = cam.current;
        camera.position.set(c.dist * Math.sin(c.phi) * Math.sin(c.theta), c.dist * Math.cos(c.phi), c.dist * Math.sin(c.phi) * Math.cos(c.theta));
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        if (poly) setLabels(poly.labels.map((t, i) => { const [x, y] = project(poly.verts[i]); return { text: t, x, y }; }));
      };
      api.current = { project, render };
      render();

      let dragging: { x: number; y: number; moved: boolean } | null = null;
      const dom = renderer.domElement as HTMLCanvasElement;
      const onDown = (e: PointerEvent) => { dragging = { x: e.clientX, y: e.clientY, moved: false }; dom.setPointerCapture(e.pointerId); };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true;
        cam.current.theta -= dx * 0.01; cam.current.phi = Math.max(0.15, Math.min(Math.PI - 0.15, cam.current.phi - dy * 0.01));
        dragging.x = e.clientX; dragging.y = e.clientY; render();
      };
      const onUp = (e: PointerEvent) => {
        const click = dragging && !dragging.moved; dragging = null;
        if (!click || !poly || props.readOnly) return;
        const r = dom.getBoundingClientRect();
        pick(e.clientX - r.left, e.clientY - r.top);
      };
      const onWheel = (e: WheelEvent) => { e.preventDefault(); cam.current.dist = Math.max(2.5, Math.min(12, cam.current.dist * (e.deltaY > 0 ? 1.1 : 0.9))); render(); };
      dom.addEventListener('pointerdown', onDown); dom.addEventListener('pointermove', onMove); dom.addEventListener('pointerup', onUp); dom.addEventListener('wheel', onWheel, { passive: false });
      cleanup = () => { dom.removeEventListener('pointerdown', onDown); dom.removeEventListener('pointermove', onMove); dom.removeEventListener('pointerup', onUp); dom.removeEventListener('wheel', onWheel); renderer.dispose(); dom.remove(); };
    }, () => setErr('3D кітапханасы жүктелмеді (интернетті тексеріңіз)'));
    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solid, marks]);

  /** Экрандағы басу → ең жақын қыр және ондағы орын (1/3, 1/2, 2/3 және төбелерге тартылады) */
  function pick(x: number, y: number) {
    if (!poly || !api.current || marks.length >= 3) return;
    let best: { edge: number; t: number; d: number } | null = null;
    poly.edges.forEach(([i, j], k) => {
      const a = api.current!.project(poly.verts[i]), b = api.current!.project(poly.verts[j]);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
      if (d < 14 && (!best || d < best.d)) best = { edge: k, t, d };
    });
    if (!best) return;
    const b = best as { edge: number; t: number };
    const snapped = SNAPS.reduce((s, v) => (Math.abs(v - b.t) < Math.abs(s - b.t) ? v : s), b.t);
    const t = Math.abs(snapped - b.t) < 0.08 ? snapped : Math.round(b.t * 100) / 100;
    const next = [...marks, { edge: b.edge, t }];
    setMarks(next); emit(solid, next);
  }

  const secInfo = (() => {
    if (!poly || marks.length < 3) return null;
    const pts = marks.map((m) => edgePoint(poly, m.edge, m.t).v) as [V3, V3, V3];
    const s = section(poly, pts);
    return s.length >= 3 ? `Қима — ${POLY_NAME[s.length] ?? `${s.length}-бұрыш`}` : 'Нүктелер бір түзуде жатыр — жазықтық анықталмайды';
  })();

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-slate-500">🧊 3D тақта</span>
        {(Object.keys(SOLID_LABEL) as SolidKind[]).map((k) => (
          <button key={k} type="button" disabled={props.readOnly} onClick={() => { setSolid(k); setMarks([]); emit(k, []); }}
            className={`rounded-md border px-2 py-1 ${solid === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>{SOLID_LABEL[k]}</button>
        ))}
      </div>
      <div ref={host} className="relative w-full overflow-hidden rounded border border-slate-100 bg-slate-50">
        {labels.map((l, i) => <span key={i} className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-sm font-medium italic text-slate-900" style={{ left: l.x, top: l.y - 2 }}>{l.text}</span>)}
        {err && <p className="p-4 text-sm text-red-600">{err}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>Сүйреп бұраңыз, тінтуір дөңгелегімен үлкейтіңіз.</span>
        {poly && <span>Қима: қырлардағы 3 нүктені басыңыз ({marks.length}/3){marks.length > 0 && ': ' + marks.map((m) => edgePoint(poly, m.edge, m.t).name).join(', ')}.</span>}
        {secInfo && <span className="font-medium text-red-700">{secInfo}</span>}
        {marks.length > 0 && !props.readOnly && <button type="button" className="rounded border border-slate-200 px-2 py-0.5" onClick={() => { setMarks([]); emit(solid, []); }}>Қиманы өшіру</button>}
        <button type="button" className="rounded border border-slate-200 px-2 py-0.5" onClick={() => { cam.current.dist = Math.max(2.5, cam.current.dist * 0.85); api.current?.render(); }}>＋</button>
        <button type="button" className="rounded border border-slate-200 px-2 py-0.5" onClick={() => { cam.current.dist = Math.min(12, cam.current.dist * 1.15); api.current?.render(); }}>－</button>
      </div>
    </div>
  );
}

/** Призма/пирамида жақтары (төбе индекстері) */
function faces(p: Polyhedron): number[][] {
  const apex = p.labels.indexOf('S');
  if (apex >= 0) {
    const n = apex;
    return [Array.from({ length: n }, (_, i) => i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, apex])];
  }
  const n = p.verts.length / 2;
  return [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => n + i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])];
}
