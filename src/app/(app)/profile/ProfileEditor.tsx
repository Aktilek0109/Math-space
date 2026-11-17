'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface EditableProfile {
  id: string; role: string; self: boolean; isAdmin: boolean; canContacts: boolean;
  about: string | null; goal: string | null; interests: string[];
  subject: string | null; teacher_category: string | null; experience_years: number | null; office_hours: string | null;
  contacts: { phone: string | null; email: string | null; parent_name: string | null; parent_phone: string | null; parent_email: string | null } | null;
  hasAvatar: boolean;
}

/** Профильді толтыру формасы: өз мәліметі, мұғалім мәліметі, байланыс және ата-ана, сурет. */
export function ProfileEditor({ p }: { p: EditableProfile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({
    about: p.about ?? '', goal: p.goal ?? '', interests: p.interests.join(', '),
    subject: p.subject ?? '', teacher_category: p.teacher_category ?? '', experience_years: p.experience_years?.toString() ?? '', office_hours: p.office_hours ?? '',
    phone: p.contacts?.phone ?? '', email: p.contacts?.email ?? '', parent_name: p.contacts?.parent_name ?? '', parent_phone: p.contacts?.parent_phone ?? '', parent_email: p.contacts?.parent_email ?? '',
  });
  const file = useRef<HTMLInputElement>(null);
  const canPublic = p.self || p.isAdmin;
  const staffRole = p.role !== 'student';
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setMsg(null);
    const payload: Record<string, unknown> = { user_id: p.self ? undefined : p.id };
    if (canPublic) {
      Object.assign(payload, { about: f.about, goal: f.goal, interests: f.interests.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8) });
      if (staffRole) Object.assign(payload, { subject: f.subject, teacher_category: f.teacher_category, experience_years: f.experience_years === '' ? null : Number(f.experience_years), office_hours: f.office_hours });
    }
    if (p.canContacts) payload.contacts = { phone: f.phone, email: f.email, ...(staffRole ? {} : { parent_name: f.parent_name, parent_phone: f.parent_phone, parent_email: f.parent_email }) };
    const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(body.error ?? 'Қате'); return; }
    setOpen(false); router.refresh();
  }
  async function upload(fl: File) {
    setBusy(true); setMsg(null);
    try {
      const image = await shrink(fl);
      const res = await fetch('/api/profile/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(body.error ?? 'Жүктеу қатесі'); else router.refresh();
    } finally { setBusy(false); }
  }
  async function removeAvatar() { setBusy(true); await fetch('/api/profile/avatar', { method: 'DELETE' }); setBusy(false); router.refresh(); }

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>{p.self ? 'Профильді толтыру' : 'Мәліметті өзгерту'}</button>
        {p.self && (
          <>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) void upload(x); }} />
            <button type="button" className="btn btn-secondary" onClick={() => file.current?.click()} disabled={busy}>{p.hasAvatar ? 'Суретті ауыстыру' : 'Сурет қосу'}</button>
            {p.hasAvatar && <button type="button" className="btn btn-secondary" onClick={removeAvatar} disabled={busy}>Суретті өшіру</button>}
          </>
        )}
        {msg && <p className="w-full text-sm text-red-600">{msg}</p>}
      </div>
    );
  }
  const field = (k: keyof typeof f, label: string, opts: { area?: boolean; type?: string; placeholder?: string; max?: number } = {}) => (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      {opts.area
        ? <textarea className="input min-h-24" value={f[k]} onChange={set(k)} maxLength={opts.max} placeholder={opts.placeholder} />
        : <input className="input" type={opts.type ?? 'text'} value={f[k]} onChange={set(k)} maxLength={opts.max} placeholder={opts.placeholder} />}
    </label>
  );
  return (
    <section className="card w-full space-y-5">
      {canPublic && (
        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold">{staffRole ? 'Мұғалім туралы' : 'Мен туралы'}</legend>
          {field('about', staffRole ? 'Қысқаша өзім туралы' : 'Мен туралы', { area: true, max: 600 })}
          {!staffRole && field('goal', 'Мақсатым', { max: 200, placeholder: 'Мысалы: ҰБТ-ға 130+, математикадан облыстық олимпиада' })}
          {field('interests', 'Қызығушылықтарым (үтір арқылы)', { max: 300, placeholder: 'геометрия, шахмат, бағдарламалау' })}
          {staffRole && (
            <div className="grid gap-3 sm:grid-cols-2">
              {field('subject', 'Пәні', { max: 120, placeholder: 'Математика' })}
              {field('teacher_category', 'Санаты', { max: 120, placeholder: 'Педагог-зерттеуші' })}
              {field('experience_years', 'Педагогикалық өтілі (жыл)', { type: 'number' })}
              {field('office_hours', 'Кеңес беру уақыты', { max: 200, placeholder: 'Сейсенбі, 15:00–16:00, 214-кабинет' })}
            </div>
          )}
        </fieldset>
      )}
      {p.canContacts && (
        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold">Байланыс {staffRole ? '' : 'және ата-ана'}</legend>
          <p className="text-xs text-slate-500">Бұл мәлімет тек {staffRole ? 'өзіңізге және әкімшіге' : 'оқушының өзіне, оның мұғалімдеріне және әкімшіге'} көрінеді.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('phone', 'Телефон', { type: 'tel', max: 30, placeholder: '+7 7__ ___ __ __' })}
            {field('email', 'E-mail', { type: 'email', max: 120 })}
            {!staffRole && field('parent_name', 'Ата-анасының аты-жөні', { max: 120 })}
            {!staffRole && field('parent_phone', 'Ата-анасының телефоны', { type: 'tel', max: 30 })}
            {!staffRole && field('parent_email', 'Ата-анасының e-mail-і', { type: 'email', max: 120 })}
          </div>
        </fieldset>
      )}
      {msg && <p className="error-box">{msg}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Сақталуда…' : 'Сақтау'}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Бас тарту</button>
      </div>
    </section>
  );
}

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas'); c.width = c.height = Math.min(400, s);
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}
