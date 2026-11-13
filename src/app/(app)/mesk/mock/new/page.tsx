import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getUnits } from '@/lib/catalog';
import { createClient } from '@/lib/supabase/server';
import { MockBuilder } from './MockBuilder';

export const metadata: Metadata = { title: 'МЭСК пробный құрастыру' };

export default async function NewMockPage({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const sp = await searchParams;
  const profile = await requireUser();
  const units = await getUnits();
  const supabase = await createClient();
  const { data: blueprints } = await supabase
    .from('exam_blueprints')
    .select('id, title, grade, component, duration_min')
    .eq('exam_type', 'MESK')
    .eq('is_active', true)
    .order('grade');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">МЭСК пробный құрастыру</h1>
      <MockBuilder
        units={units.map(({ id, grade, title }) => ({ id, grade, title }))}
        blueprints={(blueprints ?? []) as { id: string; title: string; grade: number; component: string | null; duration_min: number | null }[]}
        defaultGrade={Number(sp.grade) || profile.current_grade || 7}
      />
    </div>
  );
}
