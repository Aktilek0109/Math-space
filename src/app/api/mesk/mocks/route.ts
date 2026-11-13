import { apiUser, handler, json, parseBody } from '@/lib/api';
import { buildMeskMock } from '@/lib/sessions';
import { meskMockSchema } from '@/lib/validation';

export const POST = handler(async (req: Request) => {
  const profile = await apiUser();
  const input = await parseBody(req, meskMockSchema);
  const out = await buildMeskMock(profile, input);
  if (out.preview) return json(out);
  return json({ session_id: out.sessionId, redirect: `/practice/${out.sessionId}` }, 201);
});
