/** Сабақ журналы: күн Алматы уақытымен. */
export function todayAlmaty(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі'];
const MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];

export function fmtDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${WEEKDAYS[d.getUTCDay()]}`;
}

export interface LessonRow {
  id: string;
  class_id: string;
  lesson_date: string;
  topic_id: string | null;
  title: string;
  note: string;
  homework_text: string;
  assignment_id: string | null;
  topics: { id: string; title: string; unit_id: string; units: { grade: number; term: number | null } | null } | null;
}

export const LESSON_SELECT = 'id, class_id, lesson_date, topic_id, title, note, homework_text, assignment_id, topics(id, title, unit_id, units(grade, term))';

/** Тақырыптың кітапханадағы сілтемесі */
export function topicHref(l: LessonRow) {
  const t = l.topics;
  if (!t?.units) return null;
  const q = new URLSearchParams({ grade: String(t.units.grade), unit: t.unit_id, topic: t.id });
  if (t.units.term) q.set('term', String(t.units.term));
  return `/library?${q.toString()}`;
}
