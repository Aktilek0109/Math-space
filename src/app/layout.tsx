import type { Metadata, Viewport } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Оқу платформасы 7–12', template: '%s · Оқу платформасы' },
  description: 'Математика: материалдар, БЖБ/ТЖБ дайындығы, МЭСК пробный',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="kk">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
