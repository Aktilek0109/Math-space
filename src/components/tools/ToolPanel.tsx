'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { GeometryFigure, PlotFigure } from '@/lib/figure/types';
import type { GeoSketch, GraphSketch, Sketch, SolidSketch, XY } from '@/lib/tools/types';
import { checkGraph } from '@/lib/tools/graphcheck';
import { checkGeo, keyGeometry } from '@/lib/tools/geocheck';
import { GraphBoard } from './GraphBoard';
import { GeoBoard } from './GeoBoard';

const Board3D = dynamic(() => import('./Board3D').then((m) => m.Board3D), { ssr: false, loading: () => <p className="p-3 text-sm text-slate-500">3D тақта жүктелуде…</p> });

export type ToolKind = 'calc' | 'graph' | 'board';
type Tab = 'none' | 'graph' | 'board' | 'solid3d';

/**
 * Есептің өз құралы (ТЗ 0.А): график тақтасы, геометрия тақтасы, 3D. Калькулятор-дәптер әрқашан төменде.
 * Оқушы құралды ауыстыра алады; әдепкіде есептің құралы ашылады. Шешім ашылғаннан кейін сызба кілтпен салыстырылады.
 */
export function ToolPanel(props: {
  tool?: ToolKind | null;
  sketch?: Sketch | null;
  onSketch?: (s: Sketch) => void;
  readOnly?: boolean;
  bodyFigure?: unknown;
  /** Шешімдегі сызбалар — тек ашылғаннан кейін беріледі (тексеру үшін) */
  keyFigures?: unknown[] | null;
}) {
  const initial: Tab = props.sketch?.kind ?? (props.tool === 'graph' ? 'graph' : props.tool === 'board' ? 'board' : 'none');
  const [tab, setTab] = useState<Tab>(initial);
  const body = props.bodyFigure as PlotFigure | GeometryFigure | undefined;
  const bodyPlot = body?.kind === 'plot' ? body : null;
  const bodyGeo = body?.kind === 'geometry' ? body : null;
  const figs = useMemo(() => [...(props.keyFigures ?? []), ...(body ? [body] : [])], [props.keyFigures, body]);
  const keyPlot = (figs.find((f) => (f as { kind?: string })?.kind === 'plot') as PlotFigure | undefined) ?? null;
  const keyGeo = keyGeometry(figs);
  const sk = props.sketch;
  const graphChecks = props.keyFigures && tab === 'graph' && keyPlot ? checkGraph(sk?.kind === 'graph' ? sk : null, keyPlot) : undefined;
  const geoChecks = props.keyFigures && tab === 'board' && keyGeo ? checkGeo(sk?.kind === 'board' ? sk : null, keyGeo) : undefined;
  const view = keyPlot ? { x: keyPlot.x as XY, y: keyPlot.y as XY } : bodyPlot ? { x: bodyPlot.x as XY, y: bodyPlot.y as XY } : undefined;

  if (props.readOnly && !sk) return null;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'graph', label: '📈 График' },
    { id: 'board', label: '📐 Тақта' },
    { id: 'solid3d', label: '🧊 3D' },
  ];
  return (
    <div className="space-y-2">
      {!props.readOnly && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-slate-500">Құрал:</span>
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(tab === t.id ? 'none' : t.id)}
              className={`rounded-full border px-2.5 py-0.5 ${tab === t.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>
              {t.label}{props.tool === t.id ? ' ★' : ''}
            </button>
          ))}
          {tab !== 'none' && <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setTab('none')}>жабу</button>}
        </div>
      )}
      {tab === 'graph' && (
        <GraphBoard value={sk?.kind === 'graph' ? (sk as GraphSketch) : null} onChange={props.onSketch} readOnly={props.readOnly} view={view}
          piTicks={!!(keyPlot ?? bodyPlot)?.xTicks && String((keyPlot ?? bodyPlot)!.xTicks).startsWith('pi')} checks={graphChecks} />
      )}
      {tab === 'board' && (
        <GeoBoard value={sk?.kind === 'board' ? (sk as GeoSketch) : null} onChange={props.onSketch} readOnly={props.readOnly} base={bodyGeo} checks={geoChecks} />
      )}
      {tab === 'solid3d' && <Board3D value={sk?.kind === 'solid3d' ? (sk as SolidSketch) : null} onChange={props.onSketch} readOnly={props.readOnly} />}
    </div>
  );
}
