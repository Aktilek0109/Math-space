import Link from 'next/link';
import { requireUser, isStaff } from '@/lib/auth';
import { LogoutButton } from '@/components/LogoutButton';
import { SideNav } from '@/components/SideNav';
import { Avatar } from '@/components/Avatar';
import { MobileMenu } from '@/components/MobileMenu';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { isMeskGrade } from '@/lib/catalog';
import { createClient } from '@/lib/supabase/server';

const NAV = [
  { href: '/dashboard', label: 'Басты бет' },
  { href: '/lessons', label: 'Сабақтар' },
  { href: '/library', label: 'Кітапхана' },
  { href: '/homework', label: 'Үй тапсырмасы' },
  { href: '/practice', label: 'БЖБ/ТЖБ' },
  { href: '/objectives', label: 'Оқу мақсаттары' },
  { href: '/review', label: 'Қателермен жұмыс' },
  { href: '/mesk', label: 'МЭСК' },
  { href: '/tools', label: 'Құралдар' },
  { href: '/results', label: 'Нәтижелер' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();
  const staff = isStaff(profile);
  const nav = NAV.filter((i) => i.href !== '/mesk' || staff || isMeskGrade(profile.current_grade));
  const items = staff ? [...nav, { href: '/admin', label: 'Басқару' }] : nav;
  // Бүгін қайталауға мерзімі жеткен қате түрлерінің саны
  let due = 0;
  let avatarPath: string | null = null;
  try {
    const supabase = await createClient();
    const { count } = await supabase.from('mistakes').select('id', { count: 'exact', head: true })
      .eq('student_id', profile.id).eq('status', 'active').lte('due_at', new Date().toISOString());
    due = count ?? 0;
    const { data: me } = await supabase.from('profiles').select('avatar_path').eq('id', profile.id).maybeSingle();
    avatarPath = (me?.avatar_path as string | null) ?? null;
  } catch { /* кесте жоқ болса — белгісіз */ }

  const roleLabel = profile.role === 'admin' ? 'Әкімші' : profile.role === 'teacher' ? 'Мұғалім' : profile.current_grade ? `${profile.current_grade}-сынып · оқушы` : 'Оқушы';

  return (
    <div className="min-h-dvh lg:flex">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 lg:hidden">
        {/* Телефон: логотип + ☰ */}
        <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-1.5 lg:hidden">
          <MobileMenu due={due}>
            <SideNav items={items} due={due} vertical />
            <div className="mt-auto flex flex-col gap-3 border-t border-slate-200 pt-4">
              <Link href="/profile" className="flex items-center gap-2.5 text-sm">
                <Avatar id={profile.id} name={profile.full_name || profile.username} path={avatarPath} size={36} />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate font-semibold text-slate-900">{profile.full_name || profile.username}</span>
                  <span className="truncate text-xs text-slate-500">{roleLabel}</span>
                </span>
              </Link>
              <LogoutButton />
            </div>
          </MobileMenu>
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-slate-900">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-600 text-white">∑</span>
            <span className="text-[17px]">Math-space</span>
          </Link>
          <Link href="/profile" aria-label="Профиль"><Avatar id={profile.id} name={profile.full_name || profile.username} path={avatarPath} size={34} /></Link>
        </div>
      </header>
      <DesktopSidebar
        logo={<Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-slate-900"><span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-600 text-white">∑</span><span className="text-[17px]">Math-space</span></Link>}
        footer={
          <div className="flex flex-col gap-2.5">
            <Link href="/profile" className="flex items-center gap-2.5 rounded-lg text-sm hover:opacity-80" title="Профиль">
              <Avatar id={profile.id} name={profile.full_name || profile.username} path={avatarPath} size={36} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-semibold text-slate-900">{profile.full_name || profile.username}</span>
                <span className="truncate text-xs text-slate-500">{roleLabel}</span>
              </span>
            </Link>
            <LogoutButton />
          </div>
        }
      >
        <SideNav items={items} due={due} vertical />
      </DesktopSidebar>
      <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
