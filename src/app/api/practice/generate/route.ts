import { apiUser, handler, json, parseBody } from '@/lib/api';
import { buildPracticeSession } from '@/lib/sessions';
import { practiceGenerateSchema } from '@/lib/validation';

export const POST = handler(async (req: Request) => {
  const profile = await apiUser();
  const input = await parseBody(req, practiceGenerateSchema);
  const { sessionId, substituted } = await buildPracticeSession(profile, input);
  const q = input.difficulty && substituted ? `?sub=${substituted}&d=${input.difficulty}` : '';
  return json({ session_id: sessionId, redirect: `/practice/${sessionId}${q}`, substituted }, 201);
});
