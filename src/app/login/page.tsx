import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Кіру' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ blocked?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">∑</div>
          <h1 className="text-2xl font-semibold">Оқу платформасы</h1>
          <p className="text-sm text-slate-500">7–12-сынып · Математика</p>
        </div>
        {sp.blocked === '1' && <div className="error-box">Аккаунт бұғатталған. Әкімшіге хабарласыңыз.</div>}
        <LoginForm next={sp.next?.startsWith('/') && !sp.next.startsWith('//') ? sp.next : undefined} />
        <p className="text-center text-xs text-slate-500">Логин мен парольді мұғалім/әкімші береді. Парольді ұмытсаңыз — әкімшіге жазыңыз.</p>
      </div>
    </main>
  );
}
