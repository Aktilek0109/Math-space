'use client';

export interface ApiFailure {
  error: string;
  details?: { shortages?: { message: string }[]; errors?: { line: number; error: string }[]; fieldErrors?: Record<string, string[]> } & Record<string, unknown>;
}

/** Клиенттік fetch: қатені түсінікті мәтінге айналдырады. */
export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<{ ok: true; data: T } | { ok: false; status: number; failure: ApiFailure }> {
  const { json, ...rest } = init;
  try {
    const res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, failure: { error: body.error ?? 'Белгісіз қате', details: body.details } };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, failure: { error: 'Желі байланысы жоқ. Интернетті тексеріңіз.' } };
  }
}

export function failureText(f: ApiFailure): string[] {
  const lines = [f.error];
  f.details?.shortages?.forEach((s) => lines.push('• ' + s.message));
  f.details?.errors?.forEach((e) => lines.push(`• ${e.line}-жол: ${e.error}`));
  if (f.details?.fieldErrors) Object.entries(f.details.fieldErrors).forEach(([k, v]) => lines.push(`• ${k}: ${v.join(', ')}`));
  return lines;
}
