import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-2xl font-semibold">Бет табылмады</h1>
      <p className="text-slate-600">Сілтеме қате болуы мүмкін немесе материал жарияланбаған.</p>
      <Link href="/dashboard" className="btn btn-primary">Басты бетке</Link>
    </main>
  );
}
