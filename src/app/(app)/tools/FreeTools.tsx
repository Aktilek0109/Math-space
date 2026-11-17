'use client';

import { useState } from 'react';
import { MathNotebook } from '@/components/math/MathNotebook';
import { ToolPanel } from '@/components/tools/ToolPanel';
import { checkLines } from '@/lib/stepcheck';
import type { Sketch } from '@/lib/tools/types';

export function FreeTools() {
  const [lines, setLines] = useState<string[]>(['']);
  const [sketch, setSketch] = useState<Sketch | null>(null);
  return (
    <div className="space-y-4">
      <ToolPanel tool="graph" sketch={sketch} onSketch={setSketch} />
      <MathNotebook lines={lines} onChange={setLines} checks={checkLines(lines)} photoContext="" />
    </div>
  );
}
