'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * PDF-ті бетте көрсету (телефонда да): pdf.js CDN-нен жүктеледі, әр бет canvas-қа салынады.
 * pdf.js жүктелмесе — браузердің өз көрсеткіші (iframe) қолданылады.
 */
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

export function PdfViewer({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'fallback'>('loading');
  const [pages, setPages] = useState(0);
  const [done, setDone] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let doc: { destroy?: () => void } | null = null;
    (async () => {
      try {
        const url = PDFJS;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfjs: any = await import(/* webpackIgnore: true */ url);
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
        const pdf = await pdfjs.getDocument({ url: src, withCredentials: false, disableRange: true, disableStream: true }).promise;
        doc = pdf;
        if (cancelled || !box.current) return;
        setPages(pdf.numPages);
        setState('ok');
        const width = box.current.clientWidth || 800;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled || !box.current) return;
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const vp = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = '100%';
          canvas.style.height = 'auto';
          canvas.className = 'rounded-lg border border-slate-200 bg-white shadow-sm';
          canvas.setAttribute('aria-label', `${i}-бет`);
          box.current.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
          setDone(i);
        }
      } catch {
        if (!cancelled) setState('fallback');
      }
    })();
    return () => {
      cancelled = true;
      doc?.destroy?.();
    };
  }, [src]);

  if (state === 'fallback') {
    return <iframe title={title} src={src} className="h-[75vh] w-full rounded-xl" />;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{state === 'loading' ? 'Жүктелуде…' : done < pages ? `Беттер: ${done} / ${pages}` : `${pages} бет`}</span>
        <a href={src} target="_blank" rel="noopener noreferrer" className="btn btn-secondary px-3 py-1">Жаңа бетте ашу ↗</a>
      </div>
      <div ref={box} className="mx-auto flex max-w-4xl flex-col gap-3" />
    </div>
  );
}
