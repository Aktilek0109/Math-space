import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser, isStaff } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { EXAM_LABEL } from '@/lib/catalog';
import { fmtDue } from '@/lib/homework';
import { createAdminClient } from '@/lib/supabase/admin';
import { Avatar } from '@/components/Avatar';
import { MathText } from '@/components/MathText';
import { ProfileEditor } from './ProfileEditor';

const barCls = (p: number) => (p >= 80 ? 'bg-[#5E9C78]' : p >= 65 ? 'bg-[#93B172]' : p >= 40 ? 'bg-[#D49A62]' : 'bg-[#CE7468]');

export const metadata: Metadata = { title: 'Профиль' };

type EditableContacts = { phone: string | null; email: string | null; parent_name: string | null; parent_phone: string | null; parent_email: string | null };
const ROLE: Record<string, string> = { student: 'Оқушы', teacher: 'Мұғалім', admin: 'Әкімші' };

/** Оқушы профилі: өзі үшін /profile; мұғалім кез келген оқушыны көре алады: /profile?u=<id> (RLS: can_view_student). */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const me = await requireUser();
  const { u } = await searchParams;
  const viewingOther = !!u && u !== me.id;

  const uid = viewingOther ? u! : me.id;
  const supabase = await createClient();

  const { data: p } = await supabase
    .from('profiles')
    .select('id, username, full_name, role, current_grade, created_at, avatar_path, about, goal, interests, subject, teacher_category, experience_years, office_hours, class_members(classes(id, name))')
    .eq('id', uid)
    .maybeSingle();
  if (!p) notFound();
  const classRows = ((p.class_members ?? []) as unknown as { classes: { id: string; name: string } | null }[]).map((c) => c.classes).filter((c): c is { id: string; name: string } => !!c);
  const classes = classRows.map((c) => c.name);
  const admin = createAdminClient();
  const canContacts = !viewingOther || isStaff(me);
  const { data: contacts } = canContacts ? await supabase.from('profile_contacts').select('phone, email, parent_name, parent_phone, parent_email').eq('user_id', uid).maybeSingle() : { data: null };
  const isStudent = p.role === 'student';
  const eightWeeks = new Date(Date.now() - 56 * 86_400_000).toISOString();
  const [{ data: mastery }, { data: acts }, { data: hwActs }, { data: mk }, { data: teach }, { data: myTeachers }] = await Promise.all([
    isStudent ? supabase.rpc('objective_mastery', { p_students: [uid], p_source: 'all', p_since: null }) : Promise.resolve({ data: [] }),
    isStudent ? supabase.from('responses').select('updated_at').eq('user_id', uid).gte('updated_at', eightWeeks).limit(3000) : Promise.resolve({ data: [] }),
    isStudent ? supabase.from('homework_attempts').select('submitted_at').eq('student_id', uid).gte('submitted_at', eightWeeks).limit(2000) : Promise.resolve({ data: [] }),
    isStudent ? supabase.from('mistakes').select('status').eq('student_id', uid) : Promise.resolve({ data: [] }),
    !isStudent ? admin.from('teacher_assignments').select('classes(id, name, grade, class_members(count))').eq('teacher_id', uid) : Promise.resolve({ data: [] }),
    isStudent && classRows.length ? admin.from('teacher_assignments').select('profiles(id, full_name, username, subject, avatar_path, office_hours)').in('class_id', classRows.map((c) => c.id)) : Promise.resolve({ data: [] }),
  ]);
  const m = ((mastery ?? []) as { objective_id: string; pct: number; n: number }[]);
  const { data: objs } = m.length ? await admin.from('learning_objectives').select('id, code, text').in('id', m.map((x) => x.objective_id)) : { data: [] };
  const objMap = new Map(((objs ?? []) as { id: string; code: string; text: string }[]).map((o) => [o.id, o]));
  const sorted = [...m].sort((a, b) => b.pct - a.pct);
  const strong = sorted.filter((x) => x.pct >= 80).slice(0, 3);
  const weak = [...sorted].reverse().filter((x) => x.pct < 65).slice(0, 3);
  const avgMastery = m.length ? Math.round(m.reduce((t, x) => t + x.pct, 0) / m.length) : null;
  const weeks = Array.from({ length: 8 }, (_, i) => ({ start: Date.now() - (8 - i) * 7 * 86_400_000, n: 0 }));
  for (const t of [...((acts ?? []) as { updated_at: string }[]).map((a) => a.updated_at), ...((hwActs ?? []) as { submitted_at: string }[]).map((a) => a.submitted_at)]) {
    const ts = new Date(t).getTime();
    const w = weeks.findIndex((x, i) => ts >= x.start && (i === 7 || ts < weeks[i + 1].start));
    if (w >= 0) weeks[w].n++;
  }
  const maxW = Math.max(1, ...weeks.map((w) => w.n));
  const mkRows = (mk ?? []) as { status: string }[];
  const teachClasses = ((teach ?? []) as unknown as { classes: { id: string; name: string; grade: number; class_members: { count: number }[] } | null }[]).map((t) => t.classes).filter(Boolean) as { id: string; name: string; grade: number; class_members: { count: number }[] }[];
  const teachers = [...new Map(((myTeachers ?? []) as unknown as { profiles: { id: string; full_name: string; username: string; subject: string | null; avatar_path: string | null; office_hours: string | null } | null }[]).map((t) => t.profiles).filter(Boolean).map((t) => [t!.id, t!])).values()];

  const [{ data: sessions }, { data: views }] = await Promise.all([
    supabase
      .from('practice_sessions')
      .select('id, exam_type, grade, status, created_at, results(percent, marks_earned, marks_possible)')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('material_views')
      .select('viewed_at, materials(id, title)')
      .eq('user_id', uid)
      .order('viewed_at', { ascending: false })
      .limit(8),
  ]);

  const pct = (s: { results: unknown }) => {
    const r = (Array.isArray(s.results) ? s.results[0] : s.results) as { percent: number } | null | undefined;
    return r ? Number(r.percent) : null;
  };
  const done = (sessions ?? []).map((s) => ({ ...s, p: pct(s) })).filter((s) => s.p != null);
  const testAvg = done.length ? Math.round(done.reduce((t, s) => t + (s.p as number), 0) / done.length) : null;

  const initials = (p.full_name || p.username).split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('');

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {viewingOther && isStaff(me) && <Link href="/admin/users" className="text-sm text-brand-600 hover:underline">← Аккаунттар</Link>}
      <header className="card space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar id={p.id} name={p.full_name || p.username} path={p.avatar_path as string | null} size={72} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-600">{ROLE[p.role] ?? p.role}</p>
            <h1 className="text-2xl font-bold tracking-tight">{p.full_name || p.username}</h1>
            <div className="mt-1.5 flex flex-wrap gap-2 text-sm">
              <span className="chip font-mono">{p.username}</span>
              {p.current_grade && <span className="chip">{p.current_grade}-сынып</span>}
              {classes.map((c) => <span key={c} className="chip">{c}</span>)}
              {p.subject && <span className="chip">{p.subject as string}</span>}
            </div>
          </div>
          {!viewingOther && <Link href="/change-password" className="btn btn-secondary">Парольді ауыстыру</Link>}
        </div>
        {(p.about || p.goal || (p.interests as string[] | null)?.length) ? (
          <div className="grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
            {p.about && <div className="sm:col-span-2"><div className="mb-0.5 text-xs font-semibold text-slate-500">{isStudent ? 'Мен туралы' : 'Өзі туралы'}</div><p className="whitespace-pre-line">{p.about as string}</p></div>}
            <div className="space-y-2">
              {p.goal && <div><div className="mb-0.5 text-xs font-semibold text-slate-500">Мақсаты</div><p>{p.goal as string}</p></div>}
              {(p.interests as string[] | null)?.length ? <div className="flex flex-wrap gap-1.5">{(p.interests as string[]).map((x) => <span key={x} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs">{x}</span>)}</div> : null}
            </div>
          </div>
        ) : null}
        {!isStudent && (p.teacher_category || p.experience_years != null || p.office_hours) && (
          <dl className="grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
            {p.teacher_category && <div><dt className="text-xs font-semibold text-slate-500">Санаты</dt><dd>{p.teacher_category as string}</dd></div>}
            {p.experience_years != null && <div><dt className="text-xs font-semibold text-slate-500">Педагогикалық өтілі</dt><dd>{p.experience_years as number} жыл</dd></div>}
            {p.office_hours && <div><dt className="text-xs font-semibold text-slate-500">Кеңес беру уақыты</dt><dd>{p.office_hours as string}</dd></div>}
          </dl>
        )}
        {(!viewingOther || me.role === 'admin' || (isStaff(me) && isStudent)) && (
          <ProfileEditor p={{
            id: p.id, role: p.role, self: !viewingOther, isAdmin: me.role === 'admin', canContacts,
            about: p.about as string | null, goal: p.goal as string | null, interests: (p.interests as string[] | null) ?? [],
            subject: p.subject as string | null, teacher_category: p.teacher_category as string | null, experience_years: p.experience_years as number | null, office_hours: p.office_hours as string | null,
            contacts: (contacts as EditableContacts | null) ?? null, hasAvatar: !!p.avatar_path,
          }} />
        )}
      </header>

      {canContacts && contacts && Object.values(contacts).some(Boolean) && (
        <section className="card">
          <h2 className="mb-2 text-[17px] font-semibold">Байланыс</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {contacts.phone && <div><dt className="text-xs font-semibold text-slate-500">Телефон</dt><dd><a href={`tel:${contacts.phone}`} className="hover:underline">{contacts.phone}</a></dd></div>}
            {contacts.email && <div><dt className="text-xs font-semibold text-slate-500">E-mail</dt><dd><a href={`mailto:${contacts.email}`} className="hover:underline">{contacts.email}</a></dd></div>}
            {contacts.parent_name && <div><dt className="text-xs font-semibold text-slate-500">Ата-анасы</dt><dd>{contacts.parent_name}</dd></div>}
            {contacts.parent_phone && <div><dt className="text-xs font-semibold text-slate-500">Ата-анасының телефоны</dt><dd><a href={`tel:${contacts.parent_phone}`} className="hover:underline">{contacts.parent_phone}</a></dd></div>}
            {contacts.parent_email && <div><dt className="text-xs font-semibold text-slate-500">Ата-анасының e-mail-і</dt><dd><a href={`mailto:${contacts.parent_email}`} className="hover:underline">{contacts.parent_email}</a></dd></div>}
          </dl>
        </section>
      )}

      {isStudent && (
        <section className="card space-y-4">
          <h2 className="text-[17px] font-semibold">Оқу көрсеткіштері</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div><div className="text-xs text-slate-500">Мақсаттарды орташа меңгеру</div><div className="text-2xl font-bold">{avgMastery != null ? `${avgMastery}%` : '—'}</div></div>
            <div><div className="text-xs text-slate-500">Меңгерілген мақсат (≥80%)</div><div className="text-2xl font-bold">{m.filter((x) => x.pct >= 80).length}<span className="text-base font-normal text-slate-500"> / {m.length}</span></div></div>
            <div><div className="text-xs text-slate-500">Қателермен жұмыс</div><div className="text-2xl font-bold">{mkRows.filter((x) => x.status === 'mastered').length}<span className="text-base font-normal text-slate-500"> меңгерілді · {mkRows.filter((x) => x.status === 'active').length} белсенді</span></div></div>
            <div>
              <div className="text-xs text-slate-500">Белсенділік (8 апта)</div>
              <div className="mt-1 flex h-10 items-end gap-1" aria-label="Апталық белсенділік">
                {weeks.map((w, i) => <div key={i} title={`${w.n} есеп`} className="flex-1 rounded-sm bg-brand-500" style={{ height: `${Math.max(6, (w.n / maxW) * 100)}%`, opacity: w.n ? 1 : 0.2 }} />)}
              </div>
            </div>
          </div>
          {(strong.length > 0 || weak.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {[{ t: 'Күшті жақтары', list: strong }, { t: 'Назар аудару керек', list: weak }].map((g) => (
                <div key={g.t}>
                  <h3 className="mb-2 text-sm font-semibold">{g.t}</h3>
                  {g.list.length === 0 ? <p className="text-sm text-slate-500">—</p> : (
                    <ul className="space-y-2.5">
                      {g.list.map((x) => {
                        const o = objMap.get(x.objective_id);
                        return (
                          <li key={x.objective_id} className="space-y-1">
                            <div className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate"><span className="font-mono text-xs text-slate-500">{o?.code}</span> {o && <MathText text={o.text} />}</span><span className="font-bold">{x.pct}%</span></div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${barCls(x.pct)}`} style={{ width: `${x.pct}%` }} /></div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {done.length > 1 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Жаттығу нәтижелерінің динамикасы</h3>
              <div className="flex h-24 items-end gap-1.5">
                {[...done].reverse().slice(-16).map((d) => <Link key={d.id} href={`/results/${d.id}`} title={`${EXAM_LABEL[d.exam_type] ?? d.exam_type}: ${d.p}%`} className={`flex-1 rounded-t ${barCls(d.p as number)}`} style={{ height: `${Math.max(4, d.p as number)}%` }} />)}
              </div>
            </div>
          )}
        </section>
      )}

      {isStudent && teachers.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-[17px] font-semibold">Мұғалімдерім</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {teachers.map((t) => (
              <li key={t.id}><Link href={`/profile?u=${t.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50">
                <Avatar id={t.id} name={t.full_name || t.username} path={t.avatar_path} size={40} />
                <span className="min-w-0"><span className="block truncate font-medium">{t.full_name || t.username}</span><span className="block truncate text-xs text-slate-500">{[t.subject, t.office_hours].filter(Boolean).join(' · ') || 'Мұғалім'}</span></span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      {!isStudent && teachClasses.length > 0 && (
        <section className="card">
          <h2 className="mb-3 text-[17px] font-semibold">Сыныптары</h2>
          <div className="flex flex-wrap gap-2">
            {teachClasses.map((c) => <Link key={c.id} href={`/admin/heatmap?class=${c.id}`} className="rounded-full border border-slate-200 px-3 py-1 text-sm hover:border-slate-300">{c.name} · {c.class_members?.[0]?.count ?? 0} оқушы</Link>)}
          </div>
        </section>
      )}

      {p.role === 'student' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="card"><div className="text-sm text-slate-500">БЖБ/ТЖБ жаттығулары</div><div className="text-2xl font-semibold">{done.length}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Жаттығудың орташа нәтижесі</div><div className="text-2xl font-semibold">{testAvg != null ? `${testAvg}%` : '—'}</div></div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card">
              <h2 className="mb-2 font-semibold">Соңғы жаттығулар</h2>
              {done.length === 0 ? (
                <p className="text-sm text-slate-500">Әзірге жоқ. {!viewingOther && <Link href="/practice" className="underline">БЖБ/ТЖБ-ға дайындалу</Link>}</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {done.slice(0, 10).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/results/${s.id}`} className="hover:underline">{EXAM_LABEL[s.exam_type] ?? s.exam_type} · {fmtDue(s.created_at)}</Link>
                      <span className={`chip ${(s.p as number) >= 70 ? 'bg-green-100 text-green-800' : (s.p as number) >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{s.p}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <h2 className="mb-2 font-semibold">Соңғы ашылған материалдар</h2>
            {(views ?? []).length === 0 ? <p className="text-sm text-slate-500">Әзірге жоқ.</p> : (
              <ul className="space-y-1 text-sm">
                {(views ?? []).map((v, i) => {
                  const m = v.materials as unknown as { id: string; title: string } | null;
                  return m ? <li key={i}><Link href={`/library/${m.id}`} className="hover:underline">{m.title}</Link> <span className="text-slate-400">· {fmtDue(v.viewed_at)}</span></li> : null;
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
