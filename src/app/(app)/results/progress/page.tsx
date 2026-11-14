import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadProgress, fmtDate, type UnitView } from '@/lib/progress';
import { MIN_ITEMS, type Stat } from '@/lib/objectives';
import { AdviceButton } from './AdviceButton';

export const metadata: Metadata = { title: 'Менің ілгерілеуім' };

/** ТЗ 15: тоқсан → бөлім → тақырып → оқу мақсаты. ?u=<student> (мұғалімге), ?term=, ?unit= */
export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ u?: string; term?: string; unit?: string }> }) {
  const sp = await searchParams;
  const profile = await requireUser();
  const staff = isStaff(profile);
  const supabase = await createClient();
  const studentId = staff && sp.u ? sp.u : profile.id;
  const { data: student } = await supabase.from('profiles').select('id, full_name, username, current_grade').eq('id', studentId).maybeSingle();
  if (!student) notFound();
  const grade = student.current_grade ?? 8;
  const own = studentId === profile.id && !staff;
  const { terms } = await loadProgress(supabase, studentId, grade);
  const term = terms.find((t) => String(t.term) === sp.term) ?? terms.find((t) => t.stat.items > 0) ?? terms[0];
  const unit = term?.units.find((u) => u.id === sp.unit) ?? null;
  const q = (p: Record<string, string>) => `/results/progress?${new URLSearchParams({ ...(staff && sp.u ? { u: sp.u } : {}), ...p }).toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{own ? 'Менің ілгерілеуім' : `Ілгерілеу: ${student.full_name || student.username}`}</h1>
        <Link href={staff ? '/admin/progress' : '/results'} className="text-sm text-brand-600 hover:underline">← {staff ? 'Сынып мониторингі' : 'Нәтижелер'}</Link>
      </div>
      <p className="text-sm text-slate-600">
        Көрсеткіш — тексерілген оқу мақсаттары бойынша <b>дербес</b> орындалған тапсырмалардың ұпайлары қосындысы (үй жұмысы, жаттығу, БЖБ, ТЖБ).
        Көмекпен түзетілген жауап есепке кірмейді. Бұл ресми тоқсандық баға емес.
      </p>

      {!term ? (
        <div className="card text-slate-500">{grade}-сыныпқа оқу мақсаттары әлі енгізілмеген.</div>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Тоқсан">
            {terms.map((t) => (
              <Link key={t.term} href={q({ term: String(t.term) })} className={`btn ${t.term === term.term ? 'btn-primary' : 'btn-secondary'}`}>
                {t.term ? `${t.term}-тоқсан` : 'Тоқсансыз'}
              </Link>
            ))}
          </nav>

          {!unit ? (
            <>
              <section className="card space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{term.term}-тоқсан</h2>
                  <StatLine s={term.stat} />
                </div>
                {term.uncovered.length > 0 && term.stat.items > 0 && (
                  <p className="text-sm text-amber-800">Дербес жұмыс әлі бағаланбаған бөлім: {term.uncovered.join('; ')}. ТЖБ алдында осы бөлімнен қысқа тексеру орында.</p>
                )}
              </section>
              <div className="grid gap-3 sm:grid-cols-2">
                {term.units.map((u) => <UnitTile key={u.id} u={u} href={q({ term: String(term.term), unit: u.id })} />)}
              </div>
            </>
          ) : (
            <UnitDetail u={unit} own={own} back={q({ term: String(term.term) })} />
          )}
        </>
      )}
    </div>
  );
}

function Bar({ pct }: { pct: number | null }) {
  const v = pct ?? 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-100" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      {pct != null && <div className={`h-2 rounded-full ${v >= 80 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${v}%` }} />}
    </div>
  );
}

function StatLine({ s }: { s: Stat }) {
  if (!s.items) return <span className="text-sm text-slate-500">Дерек жеткіліксіз</span>;
  const delta = s.prevPct != null && s.pct != null ? s.pct - s.prevPct : null;
  return (
    <span className="text-sm">
      <b className="text-lg">{s.pct}%</b> <span className="text-slate-500">({s.earned}/{s.possible} ұпай · {s.items} тапсырма · соңғы: {fmtDate(s.last)})</span>
      {delta != null && delta !== 0 && <span className={delta > 0 ? 'ml-1 text-emerald-700' : 'ml-1 text-red-700'}>{delta > 0 ? '▲' : '▼'}{Math.abs(delta)}</span>}
    </span>
  );
}

function UnitTile({ u, href }: { u: UnitView; href: string }) {
  return (
    <Link href={href} className="card block space-y-2 hover:border-brand-500">
      <div className="font-medium">{u.title}</div>
      <Bar pct={u.stat.items ? u.stat.pct : null} />
      <div className="flex flex-wrap justify-between gap-1 text-xs text-slate-600">
        <span>{u.stat.items ? `${u.stat.pct}% · ${u.stat.earned}/${u.stat.possible}` : 'Дерек жеткіліксіз'}</span>
        <span>{u.objectives.length} мақсаттың {u.checked}-і тексерілді</span>
      </div>
      {u.advice.kind !== 'none' && <p className="text-xs text-slate-700">→ {u.advice.text}</p>}
    </Link>
  );
}

function UnitDetail({ u, own, back }: { u: UnitView; own: boolean; back: string }) {
  return (
    <div className="space-y-4">
      <Link href={back} className="text-sm text-brand-600 hover:underline">← Бөлімдер</Link>
      <section className="card space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{u.title}</h2>
          <StatLine s={u.stat} />
        </div>
        <p className="text-sm text-slate-600">{u.objectives.length} мақсаттың {u.checked}-і тексерілді</p>
        {u.advice.kind !== 'none' && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
            <b>Келесі қадам:</b> {u.advice.text}
            {own && u.advice.objective && (
              <div className="mt-2"><AdviceButton objectiveId={u.advice.objective.id} kind={u.advice.kind as 'practice' | 'harder' | 'diagnose'} /></div>
            )}
          </div>
        )}
      </section>

      {u.topics.some((t) => t.stat.items > 0) && (
        <section className="card space-y-2">
          <h3 className="font-semibold">Тақырыптар</h3>
          {u.topics.map((t) => (
            <div key={t.id} className="space-y-1 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><span>{t.title}</span><span className="text-slate-600">{t.stat.items ? `${t.stat.pct}% · ${t.stat.earned}/${t.stat.possible}` : 'Дерек жеткіліксіз'}</span></div>
              <Bar pct={t.stat.items ? t.stat.pct : null} />
            </div>
          ))}
        </section>
      )}

      <section className="card space-y-3">
        <h3 className="font-semibold">Оқу мақсаттары</h3>
        {u.objectives.map((o) => {
          const s = o.stat;
          const enough = !!s && s.items >= MIN_ITEMS;
          const kind = !s ? 'diagnose' : !enough ? 'diagnose' : (s.pct ?? 0) >= 80 ? 'harder' : 'practice';
          return (
            <div key={o.id} className="space-y-1 border-b border-slate-100 pb-3 last:border-0">
              <div className="text-sm"><b>{o.code}</b> {o.text}</div>
              <Bar pct={enough ? s!.pct : null} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>
                  {!s ? 'Дерек жеткіліксіз' : enough ? `${s.pct}% · ${s.earned}/${s.possible} ұпай · ${s.items} тапсырма` : `Бір тапсырма бағаланған (${s.earned}/${s.possible}) — қорытындыға дерек аз`}
                  {s?.last ? ` · соңғы: ${fmtDate(s.last)}` : ''}
                </span>
                {own && <AdviceButton objectiveId={o.id} kind={kind} compact />}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
