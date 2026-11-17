import Link from 'next/link';
import { requireUser, isStaff } from '@/lib/auth';
import { LogoutButton } from '@/components/LogoutButton';
import { SideNav } from '@/components/SideNav';
import { Avatar } from '@/components/Avatar';
import { isMeskGrade } from '@/lib/catalog';
import { createClient } from '@/lib/supabase/server';

const NAV = [
  { href: '/dashboard', label: 'Басты бет' },
  { href: '/lessons', label: 'Сабақтар' },
  { href: '/library', label: 'Кітапхана' },
  { href: '/homework', label: 'Үй жұмысы' },
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
      <aside className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/95 backdrop-blur lg:h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:bg-transparent">
        <div className="flex items-center gap-3 px-4 py-2 lg:h-full lg:flex-col lg:items-stretch lg:gap-6 lg:px-4 lg:py-6">
          <Link href="/dashboard" className="flex items-center gap-2.5 font-bold text-slate-900">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-600 text-white">∑</span>
            <span className="hidden text-[17px] sm:inline">Math-space</span>
          </Link>
          <div className="min-w-0 flex-1 lg:flex-none">
            <SideNav items={items} due={due} />
          </div>
          <div className="flex items-center gap-2 lg:mt-auto lg:flex-col lg:items-stretch lg:gap-3 lg:border-t lg:border-slate-200 lg:pt-4">
            <Link href="/profile" className="flex items-center gap-2.5 rounded-lg text-sm hover:opacity-80" title="Профиль">
              <Avatar id={profile.id} name={profile.full_name || profile.username} path={avatarPath} size={36} />
              <span className="hidden min-w-0 flex-col leading-tight md:flex">
                <span className="truncate font-semibold text-slate-900">{profile.full_name || profile.username}</span>
                <span className="truncate text-xs text-slate-500">{roleLabel}</span>
              </span>
            </Link>
            <LogoutButton />
          </div>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
