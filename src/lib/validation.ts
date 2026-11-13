import { z } from 'zod';

const grade = z.coerce.number().int().min(7).max(12);
const uuid = z.string().uuid();

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9._-]+$/, 'Логинде тек латын әріп, сан, . _ -'),
  password: z.string().min(1).max(128),
});

export const passwordSchema = z
  .object({
    password: z.string().min(8, 'Кемінде 8 таңба').max(128).regex(/\d/, 'Кемінде бір сан болсын').regex(/[A-Za-zА-Яа-яӘәҒғҚқҢңӨөҰұҮүІі]/, 'Кемінде бір әріп болсын'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Парольдер сәйкес емес', path: ['confirm'] });

export const practiceGenerateSchema = z.object({
  exam_type: z.enum(['BZhB', 'TZhB']),
  grade,
  unit_ids: z.array(uuid).max(20).default([]),
  topic_ids: z.array(uuid).max(50).default([]),
  difficulty: z.coerce.number().int().min(1).max(3).optional(),
  count: z.coerce.number().int().min(1).max(40).default(10),
  time_limit_min: z.coerce.number().int().min(1).max(240).optional(),
  mode: z.enum(['practice', 'exam']).default('practice'),
  use_templates: z.boolean().default(true),
});
export type PracticeGenerateInput = z.infer<typeof practiceGenerateSchema>;

export const meskMockSchema = z
  .object({
    grade: grade.refine((g) => g === 10 || g === 12, { message: 'МЭСК тек 10 және 12-сыныптарға арналған' }),
    component: z.string().max(40).optional(),
    unit_ids: z.array(uuid).max(20).default([]),
    blueprint_id: uuid.optional(),
    count: z.coerce.number().int().min(1).max(60).optional(),
    total_marks: z.coerce.number().min(1).max(200).optional(),
    difficulty: z.coerce.number().int().min(1).max(3).optional(),
    time_limit_min: z.coerce.number().int().min(1).max(300).optional(),
    mode: z.enum(['practice', 'exam']).default('exam'),
    no_repeat: z.boolean().default(false),
    preview: z.boolean().default(false), // тек санау: қанша сұрақ қолжетімді
  })
  .refine((v) => v.blueprint_id || v.count || v.total_marks, { message: 'Есеп санын не жалпы ұпайды көрсетіңіз' });
export type MeskMockInput = z.infer<typeof meskMockSchema>;

export const responseValueSchema = z
  .object({
    choice: z.string().max(10).optional(),
    choices: z.array(z.string().max(10)).max(10).optional(),
    value: z.string().max(200).optional(),
    text: z.string().max(10000).optional(),
    parts: z.record(z.string().max(10), z.string().max(5000)).optional(),
  })
  .strict();

export const saveResponsesSchema = z.object({
  responses: z.array(z.object({ item_id: uuid, response: responseValueSchema })).min(1).max(60),
});

export const questionCreateSchema = z.object({
  grade,
  unit_id: uuid.nullable().optional(),
  topic_ids: z.array(uuid).max(10).default([]),
  question_type: z.enum(['single', 'multi', 'numeric', 'short', 'open', 'multipart']),
  text: z.string().min(1).max(10000),
  options: z.array(z.object({ id: z.string().max(5), text: z.string().max(2000) })).max(8).default([]),
  marks: z.coerce.number().positive().max(100),
  difficulty: z.coerce.number().int().min(1).max(3).default(2),
  exam_types: z.array(z.enum(['BZhB', 'TZhB', 'MESK'])).default(['BZhB', 'TZhB']),
  exam_year: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
  component: z.string().max(40).nullable().optional(),
  source_kind: z.enum(['authored', 'adapted', 'past_exam']).default('authored'),
  source: z.string().max(500).nullable().optional(),
  answer: z.object({
    correct: z.union([z.string(), z.array(z.string())]).optional(),
    value: z.number().optional(),
    tolerance: z.number().min(0).optional(),
    accepted: z.array(z.string()).optional(),
  }),
  solution: z.string().max(20000).default(''),
  rubric: z.array(z.object({ descriptor: z.string().max(1000), marks: z.number().min(0) })).default([]),
  status: z.enum(['draft', 'review', 'published']).default('draft'),
});

export const userImportRow = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/),
  full_name: z.string().trim().max(200).default(''),
  grade: grade.optional(),
  role: z.enum(['student', 'teacher']).default('student'),
});
