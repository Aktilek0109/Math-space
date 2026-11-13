import 'server-only';
import { NextResponse } from 'next/server';
import type { z, ZodTypeAny } from 'zod';
import { getCurrentProfile, type Profile, type Role } from './auth';
import { createAdminClient } from './supabase/admin';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Route handler-ді орау: қателерді пайдаланушыға түсінікті JSON етіп қайтарады. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message, details: e.details }, e.status);
      console.error('[api]', e);
      return json({ error: 'Серверде қате болды. Кейінірек қайталап көріңіз.' }, 500);
    }
  };
}

/** API үшін авторизация: 401 / 403 (AC-02). */
export async function apiUser(roles?: Role[]): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new ApiError(401, 'Кіру қажет');
  if (!profile.is_active) throw new ApiError(403, 'Аккаунт бұғатталған');
  if (profile.must_change_password) throw new ApiError(403, 'Алдымен парольді ауыстырыңыз');
  if (roles && !roles.includes(profile.role)) throw new ApiError(403, 'Рұқсат жоқ');
  return profile;
}

const MAX_BODY_BYTES = 256 * 1024;

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY_BYTES) throw new ApiError(413, 'Сұрау тым үлкен');
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, 'JSON жарамсыз');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, 'Деректер жарамсыз', parsed.error.flatten());
  return parsed.data;
}

export async function audit(actorId: string | null, action: string, entityType?: string, entityId?: string, details: object = {}) {
  await createAdminClient().from('audit_logs').insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}
