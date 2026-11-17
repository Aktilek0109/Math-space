import { z } from 'zod';
import { apiUser, handler, json } from '@/lib/api';
import { startObjectiveSession } from '@/lib/objective';

const Body = z.object({ objectiveId: z.string().uuid() });

/** Оқу мақсаты бойынша бейімделетін дайындықты бастау (ТЗ М3). */
export const POST = handler(async (req: Request) => {
  const profile = await apiUser();
  const { objectiveId } = Body.parse(await req.json());
  const { sessionId } = await startObjectiveSession(profile, objectiveId);
  return json({ sessionId, redirect: `/practice/${sessionId}` });
});
