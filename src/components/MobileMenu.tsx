'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** Телефондағы мәзір: ☰ батырмасы, сол жақтан шығатын панель. Бет ауысқанда немесе фонды басқанда жабылады. */
export function MobileMenu({ children, due }: { children: ReactNode; due: number }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" aria-label={open ? 'Мәзірді жабу' : 'Мәзірді ашу'} aria-expanded={open} aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)} className="relative flex h-11 w-11 items-center justify-center rounded-[10px] text-slate-800 hover:bg-slate-100">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
        </svg>
        {!open && due > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-slate-50" />}
      </button>
      {open && (
        <div className="fixed inset-0 top-[57px] z-30">
          <button type="button" aria-label="Мәзірді жабу" className="absolute inset-0 bg-slate-900/25" onClick={() => setOpen(false)} />
          <div id="mobile-menu" className="relative flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-slate-50 px-4 py-5 shadow-xl">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
