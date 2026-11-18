'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/client-api';

export function DeleteAssignment({ id }: { id: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" onClick={() => setAsk(true)} className="text-sm text-red-600 hover:underline">Тапсырманы жою</button>;
  return (
    <span className="flex items-center gap-2 text-sm">
      Оқушылардан да жойылады.
      <button type="button" className="btn btn-danger px-3 py-1" onClick={async () => {
        const r = await apiFetch('/api/admin/homework', { method: 'POST', json: { action: 'delete', id } });
        if (r.ok) router.push('/admin/homework');
      }}>Иә, жою</button>
      <button type="button" className="btn btn-secondary px-3 py-1" onClick={() => setAsk(false)}>Жоқ</button>
    </span>
  );
}
