'use client';

import { useState } from 'react';
import { apiFetch, failureText } from '@/lib/client-api';
import { ErrorBox } from '@/components/ErrorBox';

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await apiFetch<{ redirect: string }>('/api/auth/login', {
      method: 'POST',
      json: { username: fd.get('username'), password: fd.get('password') },
    });
    if (!res.ok) {
      setError(res.status === 400 ? ['Логин немесе пароль қате'] : failureText(res.failure));
      setBusy(false);
      return;
    }
    // Толық жүктеу — серверлік cookie-лер жаңартылсын
    window.location.assign(res.data.redirect === '/dashboard' && next ? next : res.data.redirect);
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4" noValidate>
      <div>
        <label htmlFor="username" className="label">Логин</label>
        <input id="username" name="username" className="input" autoComplete="username" autoCapitalize="none" required />
      </div>
      <div>
        <label htmlFor="password" className="label">Пароль</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      <ErrorBox lines={error} />
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Тексерілуде…' : 'Кіру'}</button>
    </form>
  );
}
