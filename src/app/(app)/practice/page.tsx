import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getUnits } from '@/lib/catalog';
import { PracticeForm } from './PracticeForm';

export const metadata: Metadata = { title: 'БЖБ/ТЖБ дайындығы' };

export default async function PracticePage() {
  const profile = await requireUser();
  const units = await getUnits();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">БЖБ / ТЖБ дайындығы</h1>
      <p className="text-slate-600">Параметрлерді таңдаңыз — жүйе есептер банкінен және тексерілген үлгілерден жаңа нұсқа құрастырады.</p>
      <PracticeForm units={units.map(({ id, grade, term, title }) => ({ id, grade, term, title }))} defaultGrade={profile.current_grade ?? 7} />
    </div>
  );
}
