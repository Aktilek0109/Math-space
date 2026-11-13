'use client';

import { useState } from 'react';
import { apiFetch, failureText } from '@/lib/client-api';
import { ErrorBox } from '@/components/ErrorBox';

export function PasswordForm() {
  const [error, setError] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await apiFetch<{ redirect: string }>('/api/auth/password', {
      method: 'POST',
      json: { password: fd.get('password'), confirm: fd.get('confirm') },
    });
    if (!res.ok) {
      setError(failureText(res.failure));
      setBusy(false);
      return;
    }
    window.location.assign(res.data.redirect);
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div>
        <label htmlFor="password" className="label">Жаңа пароль</label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
        <p className="mt-1 text-xs text-slate-500">Кемінде 8 таңба, әріп пен сан болсын.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="label">Қайталаңыз</label>
        <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required />
      </div>
      <ErrorBox lines={error} />
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Сақталуда…' : 'Сақтау'}</button>
    </form>
  );
}
