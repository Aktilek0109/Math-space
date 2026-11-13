import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TEMPLATES } from '@/lib/generator';
import { TemplateTester } from './TemplateTester';

export const metadata: Metadata = { title: 'Параметрленген үлгілер' };

export default async function TemplatesPage() {
  await requireRole(['admin']);
  const supabase = await createClient();
  const { data: rows } = await supabase.from('generator_templates').select('template_key, generation_code_version, status, last_validated_at, usage_count, topics(title)');
  const byKey = new Map<string, any>((rows ?? []).map((r: any) => [r.template_key as string, r]));

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Параметрленген үлгілер</h1>
      <p className="text-sm text-slate-600">
        Әр үлгі кодта жазылады (<code>src/lib/generator/templates.ts</code>) және базада тіркеледі. Жарияламас бұрын 100 рет генерациялап, валидатордан өткізіңіз.
      </p>
      {Object.values(TEMPLATES).map((t) => {
        const row = byKey.get(t.key);
        return (
          <div key={t.key} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{t.title}</h2>
              <span className="chip">{t.key} v{t.version}</span>
              <span className="chip">{t.grade}-сынып</span>
              <span className="chip">{row ? row.status : 'базада тіркелмеген'}</span>
              {row && <span className="text-xs text-slate-500">қолданылды: {row.usage_count}</span>}
            </div>
            {row?.last_validated_at && <p className="text-xs text-slate-500">Соңғы тексеру: {new Date(row.last_validated_at).toLocaleString('kk-KZ')}</p>}
            <TemplateTester templateKey={t.key} registered={!!row} />
          </div>
        );
      })}
    </div>
  );
}
