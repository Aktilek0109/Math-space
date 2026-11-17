import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { FreeTools } from './FreeTools';

export const metadata: Metadata = { title: 'Құралдар' };

/** Еркін құралдар: калькулятор-дәптер, график тақтасы, геометрия тақтасы, 3D (есепке байланбаған). */
export default async function ToolsPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Құралдар</h1>
      <p className="text-sm text-slate-600">Есептен тыс жаттығу үшін. Есеп ішінде әр тапсырманың өз құралы автоматты ашылады (★ белгісі).</p>
      <FreeTools />
    </div>
  );
}
