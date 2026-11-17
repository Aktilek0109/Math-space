import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { loadSessionView } from '@/lib/sessions';
import { ApiError } from '@/lib/api';
import { EXAM_LABEL } from '@/lib/catalog';
import { SessionRunner } from './SessionRunner';

const LEVEL: Record<string, string> = { '1': 'жеңіл', '2': 'орташа', '3': 'күрделі' };

export default async function SessionPage({ params, searchParams }: { params: Promise<{ sessionId: string }>; searchParams: Promise<{ sub?: string; d?: string }> }) {
  const { sessionId } = await params;
  const sp = await searchParams;
  const sub = Number(sp.sub) || 0;
  const profile = await requireUser();
  let view;
  try {
    view = await loadSessionView(sessionId, profile);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) redirect('/results');
    throw e;
  }
  if (view.finished || !view.isOwner) redirect(`/results/${sessionId}`);
  const pj = view.session.parameters_json as { purpose?: string; code?: string; text?: string } | null | undefined;

  return (
    <>
    {sub > 0 && LEVEL[sp.d ?? ''] && (
      <div className="card mb-4 border-amber-300 bg-amber-50 text-sm text-amber-900">
        Банкте {LEVEL[sp.d!]} деңгейдегі есеп жеткіліксіз болды, сондықтан {sub} есеп ең жақын деңгейден алынды.
      </div>
    )}
    <SessionRunner
      sessionId={sessionId}
      title={pj?.purpose === 'review' ? 'Қателермен жұмыс' : pj?.purpose === 'objective' ? 'Оқу мақсаты бойынша дайындық' : `${EXAM_LABEL[view.session.exam_type]} · ${view.session.grade}-сынып`}
      objective={pj?.purpose === 'objective' ? { code: String(pj.code ?? ''), text: String(pj.text ?? '') } : null}
      mode={view.session.mode}
      deadline={view.session.deadline_at}
      totalMarks={Number(view.session.total_marks)}
      items={view.items.map(({ id, sequence_no, question_type, body, max_marks, response, revealed, key, awarded_marks }) => ({
        id, sequence_no, question_type, body, max_marks, response, revealed, awarded_marks,
        // Тек ашылған тапсырманың кілті ғана клиентке барады
        key: revealed ? key : null,
      }))}
    />
    </>
  );
}
