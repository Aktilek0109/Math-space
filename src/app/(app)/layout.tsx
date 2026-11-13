import Link from 'next/link';
import { requireUser, isStaff } from '@/lib/auth';
import { LogoutButton } from '@/components/LogoutButton';
import { isMeskGrade } from '@/lib/catalog';

const NAV = [
  { href: '/dashboard', label: 'Басты бет' },
  { href: '/library', label: 'Кітапхана' },
  { href: '/homework', label: 'Үй жұмысы' },
  { href: '/practice', label: 'БЖБ/ТЖБ' },
  { href: '/mesk', label: 'МЭСК' },
  { href: '/results', label: 'Нәтижелер' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  const staff = isStaff(profile);
  const nav = NAV.filter((i) => i.href !== '/mesk' || staff || isMeskGrade(profile.current_grade));
  const items = staff ? [...nav, { href: '/admin', label: 'Басқару' }] : nav;

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
            <Link href="/profile" className="flex items-center gap-2 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100" title="Профиль">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {(profile.full_name || profile.username).split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
              </span>
              <span className="hidden md:inline">{profile.full_name || profile.username}</span>
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
