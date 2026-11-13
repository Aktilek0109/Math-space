import { apiUser, audit, handler, json, parseBody, ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { questionCreateSchema } from '@/lib/validation';

/** Сұрақ + жабық кілт + дескриптор + тақырыптар бірге сақталады. */
export const POST = handler(async (req: Request) => {
  const actor = await apiUser(['teacher', 'admin']);
  const q = await parseBody(req, questionCreateSchema);

  // Жабық түрлерге кілт міндетті
  if (q.question_type === 'single' && typeof q.answer.correct !== 'string') throw new ApiError(400, 'Дұрыс нұсқаны таңдаңыз');
  if (q.question_type === 'multi' && (!Array.isArray(q.answer.correct) || q.answer.correct.length === 0)) throw new ApiError(400, 'Дұрыс нұсқаларды таңдаңыз');
  if (q.question_type === 'numeric' && typeof q.answer.value !== 'number') throw new ApiError(400, 'Сандық жауапты енгізіңіз');
  if (q.question_type === 'short' && !q.answer.accepted?.length) throw new ApiError(400, 'Қабылданатын жауапты енгізіңіз');
  if ((q.question_type === 'single' || q.question_type === 'multi') && q.options.length < 2) throw new ApiError(400, 'Кемінде 2 нұсқа керек');
  // Мұғалім тікелей жариялай алады; review кезеңі кейін рөлдерге қарай қатаңдатылады
  const status = q.status;

  const admin = createAdminClient();
  const { data: subject } = await admin.from('subjects').select('id').eq('code', 'math').single();
  const { data: question, error } = await admin
    .from('questions')
    .insert({
      subject_id: subject!.id,
      grade: q.grade,
      unit_id: q.unit_id ?? null,
      body_json: { text: q.text, ...(q.options.length ? { options: q.options } : {}) },
      question_type: q.question_type,
      marks: q.marks,
      difficulty: q.difficulty,
      exam_types: q.exam_types,
      exam_year: q.exam_year ?? null,
      component: q.component ?? null,
      source_kind: q.source_kind,
      source: q.source ?? null,
      status,
      owner_id: actor.id,
    })
    .select('id')
    .single();
  if (error) throw error;

  const { error: keyErr } = await admin.from('question_keys').insert({
    question_id: question.id,
    answer_json: q.answer,
    solution_json: { text: q.solution },
    rubric_json: q.rubric,
  });
  if (keyErr) {
    await admin.from('questions').delete().eq('id', question.id);
    throw keyErr;
  }
  if (q.topic_ids.length) {
    await admin.from('question_topics').insert(q.topic_ids.map((topic_id) => ({ question_id: question.id, topic_id })));
  }
  await audit(actor.id, 'question.create', 'question', question.id, { status });
  return json({ id: question.id }, 201);
});
