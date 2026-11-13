import { apiUser, audit, handler, json, parseBody } from '@/lib/api';
import { createAccount } from '@/lib/users';
import { userImportRow } from '@/lib/validation';

/** Бір аккаунт жасау — тек әкімші. Уақытша пароль бір рет қана көрсетіледі. */
export const POST = handler(async (req: Request) => {
  const actor = await apiUser(['admin']);
  const row = await parseBody(req, userImportRow);
  const out = await createAccount(row);
  if (out.ok) await audit(actor.id, 'user.create', 'profile', out.id, { username: out.username, role: row.role });
  return json(out, out.ok ? 201 : 409);
});
