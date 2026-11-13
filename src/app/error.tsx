'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-2xl font-semibold">Бірдеңе дұрыс болмады</h1>
      <p className="text-slate-600">Бетті жаңартып көріңіз. Қате қайталанса — әкімшіге хабарласыңыз.</p>
      <button className="btn btn-primary" onClick={reset}>Қайталау</button>
    </main>
  );
}
