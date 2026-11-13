import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { loadSessionView } from '@/lib/sessions';
import { ApiError } from '@/lib/api';
import { EXAM_LABEL } from '@/lib/catalog';
import { SessionRunner } from './SessionRunner';

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const profile = await requireUser();
  let view;
  try {
    view = await loadSessionView(sessionId, profile);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) redirect('/results');
    throw e;
  }
  if (view.finished || !view.isOwner) redirect(`/results/${sessionId}`);

  return (
    <SessionRunner
      sessionId={sessionId}
      title={`${EXAM_LABEL[view.session.exam_type]} · ${view.session.grade}-сынып`}
      mode={view.session.mode}
      deadline={view.session.deadline_at}
      totalMarks={Number(view.session.total_marks)}
      items={view.items.map(({ id, sequence_no, question_type, body, max_marks, response, revealed, key, awarded_marks }) => ({
        id, sequence_no, question_type, body, max_marks, response, revealed, awarded_marks,
        // Тек ашылған тапсырманың кілті ғана клиентке барады
        key: revealed ? key : null,
      }))}
    />
  );
}
