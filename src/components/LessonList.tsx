import Link from 'next/link';
import { fmtDay, topicHref, type LessonRow } from '@/lib/lessons';

/** Сабақтар тізімі күн бойынша топталған (оқушыға) */
export function LessonList({ lessons, today, classNames, showClass }: { lessons: LessonRow[]; today: string; classNames: Map<string, string>; showClass?: boolean }) {
  const days = [...new Set(lessons.map((l) => l.lesson_date))];
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <section key={d} className={`card space-y-2 ${d === today ? 'border-brand-500' : ''}`}>
          <h2 className="font-semibold">{fmtDay(d)}{d === today ? <span className="chip ml-2 bg-brand-50 text-brand-700">бүгін</span> : null}</h2>
          {lessons.filter((l) => l.lesson_date === d).map((l) => <LessonItem key={l.id} l={l} cls={showClass ? classNames.get(l.class_id) : undefined} />)}
        </section>
      ))}
    </div>
  );
}

export function LessonItem({ l, cls }: { l: LessonRow; cls?: string }) {
  const href = topicHref(l);
  const title = l.topics?.title ?? l.title;
  return (
    <div className="space-y-1 text-sm">
      <div className="font-medium">
        {cls && <span className="chip mr-1">{cls}</span>}📘 {href ? <Link href={href} className="text-brand-700 hover:underline">{title}</Link> : title}
        {l.topics && l.title ? <span className="font-normal text-slate-600"> — {l.title}</span> : null}
      </div>
      {l.note && <p className="text-slate-600">{l.note}</p>}
      {l.homework_text ? (
        <p>🏠 <b>Үй тапсырмасы:</b> {l.homework_text}{' '}
          {l.assignment_id && <Link href={`/homework/${l.assignment_id}`} className="text-brand-600 underline">фото арқылы тапсыру →</Link>}
        </p>
      ) : (
        <p className="text-slate-500">🏠 Үй тапсырмасы берілмеген</p>
      )}
      {href && <Link href={href} className="text-xs text-slate-500 hover:underline">Тақырып материалдары (презентация, жұмыс парағы) →</Link>}
    </div>
  );
}
