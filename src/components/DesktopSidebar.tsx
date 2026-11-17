'use client';

import { useEffect, useState, type ReactNode } from 'react';

const KEY = 'ms-sidebar-open';

/** Компьютердегі бүйір мәзір: ☰ батырмасымен жиналады/ашылады, таңдау браузерде есте қалады. */
export function DesktopSidebar({ logo, children, footer }: { logo: ReactNode; children: ReactNode; footer: ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === '0') setOpen(false); } catch { /* */ }
  }, []);
  function toggle() {
    setOpen((v) => { try { localStorage.setItem(KEY, v ? '0' : '1'); } catch { /* */ } return !v; });
  }
  const btn = (
    <button type="button" onClick={toggle} aria-label={open ? 'Мәзірді жинау' : 'Мәзірді ашу'} aria-expanded={open}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-slate-700 hover:bg-slate-100">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>
    </button>
  );
  if (!open) {
    return <div className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center border-r border-slate-200 py-4 lg:flex">{btn}</div>;
  }
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 lg:flex">
      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-4">{logo}{btn}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{children}</div>
      <div className="border-t border-slate-200 px-3 py-3">{footer}</div>
    </aside>
  );
}
