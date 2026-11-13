import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getUnits, isMeskGrade } from '@/lib/catalog';
import { isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MockBuilder } from './MockBuilder';

export const metadata: Metadata = { title: 'МЭСК пробный құрастыру' };

export default async function NewMockPage({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const sp = await searchParams;
  const profile = await requireUser();
  if (!isStaff(profile) && !isMeskGrade(profile.current_grade)) redirect('/dashboard');
  const units = (await getUnits()).filter((u) => isMeskGrade(u.grade));
  const supabase = await createClient();
  const { data: blueprints } = await supabase
    .from('exam_blueprints')
    .select('id, title, grade, component, duration_min')
    .eq('exam_type', 'MESK')
    .eq('is_active', true)
    .in('grade', [10, 12])
    .order('grade');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">МЭСК пробный құрастыру</h1>
      <MockBuilder
        units={units.map(({ id, grade, title }) => ({ id, grade, title }))}
        blueprints={(blueprints ?? []) as { id: string; title: string; grade: number; component: string | null; duration_min: number | null }[]}
        defaultGrade={isMeskGrade(Number(sp.grade)) ? Number(sp.grade) : isMeskGrade(profile.current_grade) ? profile.current_grade! : 10}
      />
    </div>
  );
}
