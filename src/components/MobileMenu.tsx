'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Телефондағы мәзір: ☰ батырмасы, сол жақтан сырғып шығатын панель.
 * Жабылады: ✕ / ☰ батырмасы, фонды басу, кез келген сілтемені басу, солға сырғыту (свайп), Esc.
 */
export function MobileMenu({ children, due }: { children: ReactNode; due: number }) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
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

  const close = () => { setOpen(false); setDrag(0); };
  const onTouchStart = (e: React.TouchEvent) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current) return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;
    if (Math.abs(dx) > Math.abs(dy)) setDrag(Math.min(0, dx));
  };
  const onTouchEnd = () => {
    if (drag < -70) close(); else setDrag(0);
    start.current = null;
  };

  return (
    <div className="lg:hidden">
      <button type="button" aria-label={open ? 'Мәзірді жабу' : 'Мәзірді ашу'} aria-expanded={open} aria-controls="mobile-menu"
        onClick={() => (open ? close() : setOpen(true))} className="relative flex h-11 w-11 items-center justify-center rounded-[10px] text-slate-800 hover:bg-slate-100">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
        </svg>
        {!open && due > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600 ring-2 ring-slate-50" />}
      </button>

      <div className={`fixed inset-0 top-[57px] z-30 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <button type="button" tabIndex={open ? 0 : -1} aria-label="Мәзірді жабу" onClick={close}
          className={`absolute inset-0 bg-slate-900/25 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} />
        <div id="mobile-menu"
          onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a')) close(); }}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ transform: open ? `translateX(${drag}px)` : 'translateX(-100%)', transition: drag ? 'none' : 'transform 220ms ease' }}
          className="relative flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-slate-50 px-4 py-5 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
