import Link from 'next/link';
import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { BulkImport } from './BulkImport';

export const metadata: Metadata = { title: 'Жаппай импорт' };

export default async function BulkImportPage() {
  await requireRole(['admin']);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Материалдарды жаппай импорттау</h1>
        <Link href="/admin/materials" className="btn btn-secondary">← Материалдар</Link>
      </div>
      <BulkImport supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!} anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!} />
    </div>
  );
}
