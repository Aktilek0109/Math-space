'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { apiFetch, failureText } from '@/lib/client-api';

/**
 * Папканы таңдап, бүкіл құрылымды бір рет импорттау.
 * Күтілетін құрылым (Drive-тағы «Математика — оқушыларға» сияқты):
 *   9 сынып / 2-тоқсан / 2-бөлім. ... / 5.1–5.4 ... / файл.pdf
 * Тоқсан мен бөлім/тақырып деңгейлері міндетті емес.
 */

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
const HIDE = ['КТП', '~$', '_', '.'];
/** ҚМЖ файлдары/папкалары — тек мұғалімге көрінетін түрмен салынады */
const isPlan = (p: string) => /^\s*[ҚК]МЖ/i.test(p);
const BATCH = 10;

interface Row {
  file: File;
  grade: number;
  term: number | null;
  unit: string | null;
  topic: string | null;
  name: string;
  mime: string;
  order: number;
  plan: boolean;
  status: 'wait' | 'ok' | 'skip' | 'err';
  error?: string;
}

function parse(files: FileList): { rows: Row[]; ignored: string[] } {
  const rows: Row[] = [];
  const ignored: string[] = [];
  const list = Array.from(files);
  list.forEach((file, idx) => {
    const parts = (file.webkitRelativePath || file.name).split('/').filter(Boolean);
    const name = parts[parts.length - 1];
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (parts.some((p) => HIDE.some((h) => p.startsWith(h)))) return ignored.push(file.webkitRelativePath + ' (жасырын/КТП)');
    if (!MIME[ext]) return ignored.push(file.webkitRelativePath + ' (түрі қолдау көрмейді)');
    if (file.size === 0) return ignored.push(file.webkitRelativePath + ' (бос файл — zip-ті толық шығарыңыз: «Извлечь все»)');
    if (file.size > 30 * 1024 * 1024) return ignored.push(file.webkitRelativePath + ' (30 МБ-тан үлкен)');
    // Сынып сегментін табу: «9 сынып», «9-сынып», «9»
    const gi = parts.findIndex((p) => /^(7|8|9|10|11|12)(\s|-|$)/.test(p) && /сынып|^\d+$/i.test(p));
    if (gi < 0) return ignored.push(file.webkitRelativePath + ' (сынып папкасы табылмады)');
    const grade = Number(parts[gi].match(/^\d+/)![0]);
    const plan = parts.slice(gi + 1).some(isPlan);
    // «ҚМЖ» папкасының өзі бөлім/тақырып емес — құрылымнан алып тастаймыз
    let rest = parts.slice(gi + 1, -1).filter((p) => !isPlan(p));
    let term: number | null = null;
    if (rest[0] && /^\d\s*-?\s*тоқсан/i.test(rest[0])) {
      term = Number(rest[0].match(/^\d/)![0]);
      rest = rest.slice(1);
    }
    const unit = rest[0] ?? null;
    const topic = rest.length > 1 ? rest.slice(1).join(' / ') : null;
    rows.push({ file, grade, term, unit, topic, name, mime: MIME[ext], order: idx, plan, status: 'wait' });
  });
  rows.sort((a, b) => (a.file.webkitRelativePath || a.name).localeCompare(b.file.webkitRelativePath || b.name, 'kk', { numeric: true }));
  rows.forEach((r, i) => (r.order = i));
  return { rows, ignored };
}

export function BulkImport({ supabaseUrl, anonKey }: { supabaseUrl: string; anonKey: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const storage = useMemo(() => createClient(supabaseUrl, anonKey, { auth: { persistSession: false } }).storage, [supabaseUrl, anonKey]);

  const done = rows.filter((r) => r.status !== 'wait').length;
  const errs = rows.filter((r) => r.status === 'err').length;

  async function start() {
    setRunning(true);
    setMsg('');
    const next = [...rows];
    const update = () => setRows([...next]);
    for (let b = 0; b < next.length; b += BATCH) {
      const batch = next.slice(b, b + BATCH).filter((r) => r.status === 'wait' || r.status === 'err');
      if (!batch.length) continue;
      const prep = await apiFetch<{ items: { i: number; skipped?: boolean; material_id?: string; path?: string; token?: string; error?: string }[] }>(
        '/api/admin/materials/bulk',
        { method: 'POST', json: { action: 'prepare', items: batch.map((r) => ({ grade: r.grade, term: r.term, unit: r.unit, topic: r.topic, name: r.name, mime: r.mime, size: r.file.size, order: r.order, plan: r.plan })) } },
      );
      if (!prep.ok) {
        batch.forEach((r) => { r.status = 'err'; r.error = failureText(prep.failure).join(' '); });
        update();
        continue;
      }
      const fin: { material_id: string; path: string; name: string; mime: string; size: number }[] = [];
      await Promise.all(
        prep.data.items.map(async (p) => {
          const r = batch[p.i];
          if (p.skipped) { r.status = 'skip'; return; }
          if (p.error || !p.token || !p.path || !p.material_id) { r.status = 'err'; r.error = p.error ?? 'белгісіз қате'; return; }
          const { error } = await storage.from('materials').uploadToSignedUrl(p.path, p.token, r.file, { contentType: r.mime });
          if (error) { r.status = 'err'; r.error = error.message; return; }
          fin.push({ material_id: p.material_id, path: p.path, name: r.name, mime: r.mime, size: r.file.size });
          r.status = 'ok';
        }),
      );
      if (fin.length) {
        const f = await apiFetch('/api/admin/materials/bulk', { method: 'POST', json: { action: 'finalize', items: fin } });
        if (!f.ok) fin.forEach((x) => { const r = batch.find((y) => y.name === x.name)!; r.status = 'err'; r.error = failureText(f.failure).join(' '); });
      }
      update();
    }
    setRunning(false);
    const ok = next.filter((r) => r.status === 'ok').length;
    const sk = next.filter((r) => r.status === 'skip').length;
    const er = next.filter((r) => r.status === 'err').length;
    setMsg(`Дайын: ${ok} жүктелді, ${sk} бұрыннан бар, ${er} қате.${er ? ' «Бастау»-ды қайта бассаңыз, тек қателер қайталанады.' : ''}`);
  }

  const groups = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = [`${r.grade}-сынып`, r.term ? `${r.term}-тоқсан` : null, r.unit, r.topic].filter(Boolean).join(' › ') + (r.plan ? ' (ҚМЖ — тек мұғалімге)' : '');
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <p className="text-sm text-slate-600">
          Компьютердегі материалдар папкасын таңдаңыз (мысалы, Drive-тан жүктелген «Математика — оқушыларға»). Сынып › тоқсан › бөлім › тақырып
          құрылымы сақталады, бөлімдер мен тақырыптар автоматты түрде жасалады, материалдар бірден жарияланады. «ҚМЖ» деп басталатын файлдар мен папкалар тек мұғалімге көрінетін ҚМЖ ретінде салынады (оқушы көрмейді). «КТП» және «_» деп басталатындар өткізіліп жіберіледі.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="block w-full text-sm"
          disabled={running}
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => {
            if (!e.target.files) return;
            const p = parse(e.target.files);
            setRows(p.rows);
            setIgnored(p.ignored);
            setMsg('');
          }}
        />
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={running} onClick={start}>
              {running ? `Жүктелуде… ${done}/${rows.length}` : `Бастау (${rows.length} файл)`}
            </button>
            {errs > 0 && !running && <span className="text-sm text-red-700">{errs} қате</span>}
          </div>
        )}
        {msg && <div className={errs ? 'error-box' : 'ok-box'} role="status">{msg}</div>}
      </div>

      {groups.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Құрылым</h2>
          <ul className="space-y-1 text-sm">
            {groups.map(([k, n]) => <li key={k}>{k} — <span className="text-slate-500">{n} файл</span></li>)}
          </ul>
        </div>
      )}

      {rows.some((r) => r.status === 'err') && (
        <div className="card">
          <h2 className="mb-2 font-semibold text-red-700">Қателер</h2>
          <ul className="space-y-1 text-sm">
            {rows.filter((r) => r.status === 'err').map((r) => <li key={r.order}>{r.name}: {r.error}</li>)}
          </ul>
        </div>
      )}

      {ignored.length > 0 && (
        <details className="card text-sm">
          <summary className="cursor-pointer">Өткізілген файлдар ({ignored.length})</summary>
          <ul className="mt-2 space-y-1 text-slate-600">{ignored.map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
