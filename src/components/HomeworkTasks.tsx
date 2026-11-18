import { MathText } from '@/components/MathText';
import { Figure } from '@/components/Figure';

export interface HwTask {
  id: string;
  position: number;
  parent_item_id?: string | null;
  student_id?: string | null;
  body_json: {
    text: string;
    figure?: unknown;
    options?: { id: string; text: string }[];
    parts?: { label: string; text: string; options?: { id: string; text: string }[] }[];
  };
  learning_objectives?: { code: string; text: string } | null;
  homework_item_keys?: { answer_json: Record<string, unknown>; solution_json: { text?: string } } | null;
}

function Options({ options }: { options?: { id: string; text: string }[] }) {
  if (!options?.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {options.map((o) => (
        <li key={o.id} className="flex gap-2"><span className="font-medium">{o.id})</span><MathText text={o.text} /></li>
      ))}
    </ul>
  );
}

/** Үй тапсырмасындағы есептер — тек оқуға арналған тізім (жауап енгізу/тексеру жоқ). */
export function HomeworkTasks({ items, showKeys = false }: { items: HwTask[]; showKeys?: boolean }) {
  const list = items.filter((i) => !i.parent_item_id).sort((a, b) => a.position - b.position);
  if (!list.length) return null;
  return (
    <ol className="space-y-3">
      {list.map((it, n) => {
        const sol = it.homework_item_keys?.solution_json?.text;
        return (
          <li key={it.id} className="card space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{n + 1}-есеп</span>
              {showKeys && it.learning_objectives && <span className="text-xs text-slate-500">{it.learning_objectives.code}</span>}
            </div>
            <MathText text={it.body_json.text} />
            <Figure figure={it.body_json.figure} />
            <Options options={it.body_json.options} />
            {it.body_json.parts?.length ? (
              <div className="space-y-2">
                {it.body_json.parts.map((p) => (
                  <div key={p.label} className="flex gap-2"><span className="font-medium">{p.label})</span><div className="min-w-0"><MathText text={p.text} /><Options options={p.options} /></div></div>
                ))}
              </div>
            ) : null}
            {showKeys && sol && (
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600">Шешуі (тек сізге)</summary>
                <div className="mt-1"><MathText text={sol} /></div>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
