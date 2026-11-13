import Link from 'next/link';
import { requireRole } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['teacher', 'admin']);
  const links = [
    { href: '/admin', label: 'Шолу' },
    { href: '/admin/materials', label: 'Материалдар' },
    { href: '/admin/lessons', label: 'Сабақ журналы' },
    { href: '/admin/homework', label: 'Үй жұмысы' },
    { href: '/admin/questions', label: 'Есептер' },
    { href: '/admin/pending', label: 'Тексеру' },
    ...(profile.role === 'admin'
      ? [
          { href: '/admin/structure', label: 'Құрылым' },
          { href: '/admin/templates', label: 'Үлгілер' },
          { href: '/admin/users', label: 'Аккаунттар' },
        ]
      : []),
  ];
  return (
    <div className="space-y-4">
      <nav aria-label="Басқару мәзірі" className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 text-sm">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-slate-100">{l.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
