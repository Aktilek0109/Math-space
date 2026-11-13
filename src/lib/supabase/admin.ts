import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role клиенті: RLS-ті айналып өтеді. ТЕК серверде, тек авторизация
 * тексерілгеннен кейін қолданылады (кілттерді оқу, сессия жасау, аккаунттар).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY орнатылмаған');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
