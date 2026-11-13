'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { apiFetch, failureText } from '@/lib/client-api';

const OK_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const MAX = 10 * 1024 * 1024;

/** Үлкен фотоны ~2000 px JPEG-ке кішірейту (жүктеу жылдам, мәтін оқылады). PDF/HEIC өзгертілмейді. */
async function shrink(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export function SubmitWork(props: {
  assignmentId: string;
  files: { id: string; original_name: string; mime_type: string }[];
  locked: boolean;
  initialComment: string;
  supabaseUrl: string;
  anonKey: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [comment, setComment] = useState(props.initialComment);
  const storage = useMemo(() => createClient(props.supabaseUrl, props.anonKey, { auth: { persistSession: false } }).storage, [props.supabaseUrl, props.anonKey]);
  const url = `/api/homework/${props.assignmentId}/upload`;

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const picked = await Promise.all(Array.from(list).map(shrink));
      const bad = picked.find((f) => !OK_MIME.includes(f.type) || f.size > MAX || f.size === 0);
      if (bad) throw new Error(`«${bad.name}»: тек сурет немесе PDF, 10 МБ-тан аспауы керек.`);
      const meta = picked.map((f) => ({ name: f.name, mime: f.type, size: f.size }));
      const prep = await apiFetch<{ items: { path: string; token: string }[] }>(url, { method: 'POST', json: { action: 'prepare', files: meta } });
      if (!prep.ok) throw new Error(failureText(prep.failure).join(' '));
      await Promise.all(
        prep.data.items.map(async (it, i) => {
          const { error } = await storage.from('homework').uploadToSignedUrl(it.path, it.token, picked[i], { contentType: picked[i].type });
          if (error) throw new Error(`«${picked[i].name}» жүктелмеді: ${error.message}`);
        }),
      );
      const fin = await apiFetch(url, { method: 'POST', json: { action: 'finalize', comment, files: prep.data.items.map((it, i) => ({ ...meta[i], path: it.path })) } });
      if (!fin.ok) throw new Error(failureText(fin.failure).join(' '));
      setMsg({ ok: true, text: 'Жұмысың тапсырылды ✓' });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Қате болды' });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(id: string) {
    setBusy(true);
    const r = await apiFetch(url, { method: 'POST', json: { action: 'remove', file_id: id } });
    setBusy(false);
    if (!r.ok) setMsg({ ok: false, text: failureText(r.failure).join(' ') });
    router.refresh();
  }

  async function saveComment() {
    setBusy(true);
    const r = await apiFetch(url, { method: 'POST', json: { action: 'finalize', comment, files: [] } });
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: 'Пікір сақталды' } : { ok: false, text: failureText(r.failure).join(' ') });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {props.files.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {props.files.map((f, i) => (
            <div key={f.id} className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <a href={`/api/homework/file?id=${f.id}`} target="_blank" rel="noopener noreferrer" className="block">
                {f.mime_type.startsWith('image/') && f.mime_type !== 'image/heic' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/homework/file?id=${f.id}`} alt={`${i + 1}-бет`} className="h-40 w-full object-cover" />
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-slate-600">📄 {f.original_name}</div>
                )}
              </a>
              <div className="flex items-center justify-between px-2 py-1 text-xs">
                <span>{i + 1}-бет</span>
                {!props.locked && <button type="button" disabled={busy} onClick={() => remove(f.id)} className="text-red-600 hover:underline">Өшіру</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {props.locked ? (
        <p className="text-sm text-slate-600">Жұмыс бағаланды, оны енді өзгертуге болмайды.</p>
      ) : (
        <>
          <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn btn-primary">
              {busy ? 'Жүктелуде…' : props.files.length ? '📷 Тағы бет қосу' : '📷 Дәптерді суретке түсіріп жүктеу'}
            </button>
          </div>
          <p className="text-xs text-slate-500">Әр бетті жарық жерде, тіке түсір. 8 суретке дейін (немесе PDF), әрқайсысы 10 МБ-қа дейін.</p>
          <div>
            <label className="label" htmlFor="c">Мұғалімге пікір (міндетті емес)</label>
            <textarea id="c" className="input min-h-20" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
            {props.files.length > 0 && <button type="button" disabled={busy} onClick={saveComment} className="btn btn-secondary mt-2">Пікірді сақтау</button>}
          </div>
        </>
      )}
      {msg && <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
    </div>
  );
}
