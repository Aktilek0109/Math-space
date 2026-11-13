import { apiUser, handler, json, parseBody } from '@/lib/api';
import { buildPracticeSession } from '@/lib/sessions';
import { practiceGenerateSchema } from '@/lib/validation';

export const POST = handler(async (req: Request) => {
  const profile = await apiUser();
  const input = await parseBody(req, practiceGenerateSchema);
  const { sessionId } = await buildPracticeSession(profile, input);
  return json({ session_id: sessionId, redirect: `/practice/${sessionId}` }, 201);
});
