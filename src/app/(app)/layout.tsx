import Link from 'next/link';
import { requireUser, isStaff } from '@/lib/auth';
import { LogoutButton } from '@/components/LogoutButton';

const NAV = [
  { href: '/dashboard', label: 'Басты бет' },
  { href: '/library', label: 'Кітапхана' },
  { href: '/practice', label: 'БЖБ/ТЖБ' },
  { href: '/mesk', label: 'МЭСК' },
  { href: '/results', label: 'Нәтижелер' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  const items = isStaff(profile) ? [...NAV, { href: '/admin', label: 'Басқару' }] : NAV;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">∑</span>
            <span className="hidden sm:inline">Оқу платформасы</span>
          </Link>
          <nav aria-label="Негізгі мәзір" className="flex flex-1 gap-1 overflow-x-auto text-sm">
            {items.map((i) => (
              <Link key={i.href} href={i.href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                {i.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-slate-500 md:inline">{profile.full_name || profile.username}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
