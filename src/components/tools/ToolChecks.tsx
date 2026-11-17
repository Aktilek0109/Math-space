import { MathText } from '@/components/MathText';
import type { ToolCheck } from '@/lib/tools/types';

/** Сызбаны тексеру нәтижесі: ✓ / ✗ / ! және себебі */
export function ToolChecks({ checks }: { checks: ToolCheck[] }) {
  if (!checks.length) return null;
  return (
    <ul className="space-y-0.5 rounded-lg bg-slate-50 p-2 text-sm">
      {checks.map((c, i) => (
        <li key={i} className="flex gap-2">
          <span className={c.status === 'ok' ? 'text-emerald-600' : c.status === 'error' ? 'text-red-600' : 'text-amber-600'}>{c.status === 'ok' ? '✓' : c.status === 'error' ? '✗' : '!'}</span>
          <MathText text={c.text} />
        </li>
      ))}
    </ul>
  );
}
