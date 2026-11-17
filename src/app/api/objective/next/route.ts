import { z } from 'zod';
import { apiUser, handler, json } from '@/lib/api';
import { nextObjectiveItem } from '@/lib/objective';

const Body = z.object({ sessionId: z.string().uuid() });

/** Келесі есеп: деңгей соңғы нәтижелерге қарай таңдалады; меңгерілсе done=true. */
export const POST = handler(async (req: Request) => {
  const profile = await apiUser();
  const { sessionId } = Body.parse(await req.json());
  return json(await nextObjectiveItem(profile, sessionId));
});
