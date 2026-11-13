export type QuestionType = 'single' | 'multi' | 'numeric' | 'short' | 'open' | 'multipart';

export interface Option {
  id: string;
  text: string;
}

/** Оқушыға көрінетін шарт. Ешқашан жауапты қамтымайды. */
export interface PublicBody {
  text: string;
  options?: Option[];
  parts?: { label: string; text: string; marks: number }[];
  image_urls?: string[];
}

/** Жабық кілт — тек серверде. */
export interface AnswerKey {
  correct?: string | string[];
  value?: number;
  tolerance?: number;
  accepted?: string[];
}

export interface RubricLine {
  descriptor: string;
  marks: number;
}

export interface GeneratedItem {
  questionType: QuestionType;
  body: PublicBody;
  answer: AnswerKey;
  solution: { text: string };
  rubric: RubricLine[];
  marks: number;
  difficulty: 1 | 2 | 3;
  params: Record<string, number | string>;
}

export interface Rng {
  /** [0, 1) */
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export interface Template {
  key: string;
  version: number;
  title: string;
  grade: number;
  generate(rng: Rng): GeneratedItem;
  /** Қате тізімі; бос болса — есеп жарамды. */
  validate(item: GeneratedItem): string[];
}
