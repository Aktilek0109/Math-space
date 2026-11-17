'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** G «Тыныш» мәзірі: белгіленген бет — қою жазу және жанында кішкентай жасыл нүкте. */
export function SideNav({ items, due, vertical }: { items: { href: string; label: string }[]; due: number; vertical?: boolean }) {
  const path = usePathname() ?? '';
  return (
    <nav aria-label="Негізгі мәзір" className={vertical ? 'flex flex-col gap-0.5' : 'flex gap-1 overflow-x-auto'}>
      {items.map((i) => {
        const on = path === i.href || (i.href !== '/dashboard' && path.startsWith(i.href + '/')) || path === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? 'page' : undefined} className={`nav-link ${vertical ? 'min-h-11' : ''} ${on ? 'font-semibold text-slate-900' : ''}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-brand-600' : 'bg-transparent'}`} />
            {i.label}
            {i.href === '/review' && due > 0 && <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{due}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
