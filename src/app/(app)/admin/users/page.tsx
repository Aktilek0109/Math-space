import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { UsersPanel } from './UsersPanel';

export const metadata: Metadata = { title: 'Аккаунттар' };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole(['admin']);
  const supabase = await createClient();
  let q = supabase.from('profiles').select('id, username, full_name, role, current_grade, is_active, must_change_password').order('username').limit(300);
  if (sp.q) q = q.or(`username.ilike.%${sp.q.replace(/[%,()]/g, '')}%,full_name.ilike.%${sp.q.replace(/[%,()]/g, '')}%`);
  const { data } = await q;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Аккаунттар</h1>
      <form action="/admin/users" className="flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Логин не аты-жөні" className="input max-w-sm" aria-label="Іздеу" />
        <button className="btn btn-secondary">Іздеу</button>
      </form>
      <UsersPanel users={data ?? []} meId={me.id} />
    </div>
  );
}
