import { apiUser, handler, json } from '@/lib/api';
import { buildReviewSession } from '@/lib/sessions';

/** Қателермен жұмыс: мерзімі жеткен түрлерден бүгінгі қайталау сессиясын құрастыру. */
export const POST = handler(async () => {
  const profile = await apiUser();
  const { sessionId } = await buildReviewSession(profile);
  return json({ sessionId, redirect: `/practice/${sessionId}` });
});
