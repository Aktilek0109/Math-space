'use client';

import { useState } from 'react';
import { apiFetch, failureText } from '@/lib/client-api';
import { ErrorBox } from '@/components/ErrorBox';

interface User { id: string; username: string; full_name: string; role: string; current_grade: number | null; is_active: boolean; must_change_password: boolean }
interface Created { username: string; password?: string; ok: boolean; error?: string; line?: number }

const ROLE: Record<string, string> = { student: 'Оқушы', teacher: 'Мұғалім', admin: 'Әкімші' };

/** Тырнақшаны ескеретін қарапайым CSV оқу (үтір немесе нүктелі үтір). */
function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const delim = (text.split(/\r?\n/)[0].match(/;/g)?.length ?? 0) > (text.split(/\r?\n/)[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) out.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) out.push(row);
  return out;
}

/**
 * Екі форматты қабылдайды:
 *  1) "username,full_name,grade,role" (тақырып міндетті емес);
 *  2) бұрынғы сайттың Google кестесінен жүктелген CSV: «Логин», «Аты-жөні», «Сынып» бағандары.
 *     Пароль/хэш бағандары оқылмайды — оқушыларға жаңа уақытша пароль беріледі.
 */
function parseCsv(text: string) {
  const rows = splitCsv(text.replace(/^\uFEFF/, ''));
  const head = (rows[0] ?? []).map((h) => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iU = col('username', 'логин'), iN = col('full_name', 'аты-жөні', 'аты жөні', 'фио'), iG = col('grade', 'сынып'), iR = col('role', 'рөл');
  const hasHeader = iU >= 0;
  const body = hasHeader ? rows.slice(1) : rows;
  return body
    .map((r) => {
      const username = (r[hasHeader ? iU : 0] ?? '').trim().toLowerCase();
      const full_name = (hasHeader ? (iN >= 0 ? r[iN] : '') : r[1]) ?? '';
      const gRaw = (hasHeader ? (iG >= 0 ? r[iG] : '') : r[2]) ?? '';
      const m = gRaw.match(/\b(7|8|9|10|11|12)\b/) ?? gRaw.match(/^(7|8|9|10|11|12)/);
      const roleRaw = ((hasHeader ? (iR >= 0 ? r[iR] : '') : r[3]) ?? '').toLowerCase();
      const role = roleRaw === 'teacher' || roleRaw === 'мұғалім' ? 'teacher' : 'student';
      // «8F», «9 Е», «10-А» → сынып тобы (класс)
      const cm = gRaw.trim().toUpperCase().match(/^(7|8|9|10|11|12)\s*[-\s]?\s*([A-ZА-ЯӘҒҚҢӨҰҮҺІ])$/);
      return { username, full_name, ...(m ? { grade: Number(m[1]) } : {}), role, ...(cm ? { class_name: `${cm[1]}${cm[2]}` } : {}) };
    })
    .filter((r) => r.username);
}

function downloadCsv(rows: Created[]) {
  const csv = 'username,password,status\n' + rows.map((r) => `${r.username},${r.password ?? ''},${r.ok ? 'ok' : r.error}`).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'passwords.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function UsersPanel({ users, meId }: { users: User[]; meId: string }) {
  const [created, setCreated] = useState<Created[]>([]);
  const [error, setError] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function createOne(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await apiFetch<Created>('/api/admin/users', {
      method: 'POST',
      json: { username: fd.get('username'), full_name: fd.get('full_name'), grade: fd.get('grade') ? Number(fd.get('grade')) : undefined, role: fd.get('role') },
    });
    if (!res.ok) return setError(failureText(res.failure));
    setCreated([res.data]);
    form.reset();
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const rows = parseCsv(await file.text());
    const res = await apiFetch<{ created: number; results: Created[] }>('/api/admin/users/import', { method: 'POST', json: { rows } });
    setBusy(false);
    e.target.value = '';
    if (!res.ok) return setError(failureText(res.failure));
    setCreated(res.data.results);
  }

  async function act(id: string, body: object, label: string) {
    const res = await apiFetch<{ password?: string }>(`/api/admin/users/${id}`, { method: 'PATCH', json: body });
    if (!res.ok) return setError(failureText(res.failure));
    if (res.data.password) setCreated([{ username: label, password: res.data.password, ok: true }]);
    else window.location.reload();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={createOne} className="card space-y-2 text-sm">
          <h2 className="font-semibold">Бір аккаунт</h2>
          <input name="username" placeholder="логин (латын: aigerim.k)" className="input" required pattern="[a-z0-9._\-]{3,32}" />
          <input name="full_name" placeholder="Аты-жөні" className="input" />
          <div className="grid grid-cols-2 gap-2">
            <select name="grade" className="input" aria-label="Сынып"><option value="">Сынып —</option>{[7, 8, 9, 10, 11, 12].map((g) => <option key={g} value={g}>{g}</option>)}</select>
            <select name="role" className="input" aria-label="Рөл"><option value="student">Оқушы</option><option value="teacher">Мұғалім</option></select>
          </div>
          <button className="btn btn-primary w-full">Жасау</button>
        </form>
        <div className="card space-y-2 text-sm">
          <h2 className="font-semibold">CSV арқылы жаппай тіркеу</h2>
          <p className="text-slate-600">Бағандар: <code>username,full_name,grade,role</code>. Қате болса — ешбір аккаунт жасалмайды.</p>
          <input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={busy} className="block text-sm" />
          {busy && <p>Жүктелуде…</p>}
        </div>
      </div>

      <ErrorBox lines={error} />
      {created.length > 0 && (
        <div className="ok-box space-y-1">
          <p className="font-medium">Уақытша парольдер — қазір сақтап алыңыз, қайта көрсетілмейді:</p>
          {created.map((c, i) => <p key={i} className="font-mono">{c.username}: {c.ok ? c.password : `✗ ${c.error}`}</p>)}
          <button className="btn btn-secondary px-3 py-1" onClick={() => downloadCsv(created)}>CSV жүктеу</button>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-2">Логин</th><th className="p-2">Аты-жөні</th><th className="p-2">Рөл</th><th className="p-2">Сынып</th><th className="p-2">Күйі</th><th className="p-2"></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="p-2 font-mono">{u.username}</td>
                <td className="p-2">{u.role === 'student' ? <a href={`/profile?u=${u.id}`} className="text-brand-600 hover:underline">{u.full_name || '—'}</a> : u.full_name}</td>
                <td className="p-2">{ROLE[u.role]}</td>
                <td className="p-2">{u.current_grade ?? '—'}</td>
                <td className="p-2">{u.is_active ? (u.must_change_password ? 'кірмеген' : 'белсенді') : <span className="text-red-700">бұғатталған</span>}</td>
                <td className="flex gap-1 p-2">
                  <button className="btn btn-secondary px-2 py-1 text-xs" onClick={() => act(u.id, { action: 'reset_password' }, u.username)}>Пароль</button>
                  {u.id !== meId && (
                    <button className={`btn ${u.is_active ? 'btn-danger' : 'btn-secondary'} px-2 py-1 text-xs`} onClick={() => act(u.id, { action: 'set_active', active: !u.is_active }, u.username)}>
                      {u.is_active ? 'Бұғаттау' : 'Ашу'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
