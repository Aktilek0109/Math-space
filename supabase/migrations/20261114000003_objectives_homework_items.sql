-- =====================================================================
-- 0004: Оқу мақсаттары, мақсат бойынша үй жұмысы (ТЗ 14) және меңгеру дерегі (ТЗ 15)
-- =====================================================================

-- ---------- Оқу мақсаттары ----------
create table public.learning_objectives (
  id          uuid primary key default gen_random_uuid(),
  grade       smallint not null check (grade between 7 and 12),
  unit_id     uuid references public.units(id) on delete set null,
  code        text not null,
  text        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (grade, code)
);
create index learning_objectives_unit_idx on public.learning_objectives (unit_id, sort_order);

create table public.topic_objectives (
  topic_id     uuid not null references public.topics(id) on delete cascade,
  objective_id uuid not null references public.learning_objectives(id) on delete cascade,
  primary key (topic_id, objective_id)
);
create index topic_objectives_obj_idx on public.topic_objectives (objective_id);

-- Есептің қай мақсатты тексеретіні. weight — ұпайдың осы мақсатқа тиесілі үлесі (бір есептің салмақтары қосындысы = 1).
create table public.question_objectives (
  question_id  uuid not null references public.questions(id) on delete cascade,
  objective_id uuid not null references public.learning_objectives(id) on delete cascade,
  weight       numeric(5,4) not null default 1 check (weight > 0 and weight <= 1),
  primary key (question_id, objective_id)
);
create index question_objectives_obj_idx on public.question_objectives (objective_id);

-- ---------- Үй жұмысы: мақсат бойынша тапсырмалар ----------
alter table public.assignments
  add column if not exists mode text not null default 'file' check (mode in ('file', 'tasks')),
  add column if not exists topic_id uuid references public.topics(id) on delete set null;

create table public.homework_items (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments(id) on delete cascade,
  -- Жеке тексеру есебі (14.4): parent_item_id + student_id толтырылады; ортақ тапсырмада екеуі де null
  parent_item_id uuid references public.homework_items(id) on delete cascade,
  student_id     uuid references public.profiles(id) on delete cascade,
  position       int not null default 0,
  question_id    uuid references public.questions(id) on delete set null,
  objective_id   uuid references public.learning_objectives(id) on delete set null,
  topic_id       uuid references public.topics(id) on delete set null,
  question_type  public.question_type not null,
  body_json      jsonb not null,
  criteria_json  jsonb not null default '[]',   -- [{descriptor, marks}] — оқушыға көрінеді
  max_marks      numeric(5,2) not null check (max_marks > 0),
  difficulty     smallint not null default 2 check (difficulty between 1 and 3),
  created_at     timestamptz not null default now(),
  check ((parent_item_id is null) = (student_id is null))
);
create index homework_items_assignment_idx on public.homework_items (assignment_id, position);
create index homework_items_student_idx on public.homework_items (student_id) where student_id is not null;

-- Жауап кілті мен шешім — тек персонал (оқушыға RLS саясаты жоқ)
create table public.homework_item_keys (
  item_id       uuid primary key references public.homework_items(id) on delete cascade,
  answer_json   jsonb not null default '{}',
  solution_json jsonb not null default '{}'
);

-- Оқушы әрекеттері: first — алғашқы дербес әрекет, revised — кері байланыстан кейін түзетілген («көмекпен»)
create table public.homework_attempts (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.homework_items(id) on delete cascade,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  kind           text not null check (kind in ('first', 'revised')),
  answer_json    jsonb not null default '{}',   -- {value | choice | text}
  files_json     jsonb not null default '[]',   -- [{path, name, mime, size}]
  submitted_at   timestamptz,                   -- бекітілген сәт (кері байланыс сұралғанда немесе тапсырғанда)
  feedback_json  jsonb,                         -- ЖИ кері байланысы (оқушыға көрінеді, толық шешімсіз)
  feedback_at    timestamptz,
  auto_marks     numeric(5,2),
  awarded_marks  numeric(5,2),
  marking_state  text not null default 'none' check (marking_state in ('none', 'auto', 'pending', 'manual')),
  teacher_note   text,
  graded_by      uuid references public.profiles(id),
  graded_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (item_id, student_id, kind)
);
create index homework_attempts_student_idx on public.homework_attempts (student_id, submitted_at);
create trigger homework_attempts_updated_at before update on public.homework_attempts for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.learning_objectives enable row level security;
alter table public.topic_objectives enable row level security;
alter table public.question_objectives enable row level security;
alter table public.homework_items enable row level security;
alter table public.homework_item_keys enable row level security;
alter table public.homework_attempts enable row level security;

create policy learning_objectives_select on public.learning_objectives for select to authenticated using (public.is_active_user() or public.is_staff());
create policy learning_objectives_staff on public.learning_objectives for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy topic_objectives_select on public.topic_objectives for select to authenticated using (public.is_active_user() or public.is_staff());
create policy topic_objectives_staff on public.topic_objectives for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy question_objectives_staff on public.question_objectives for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy homework_items_select on public.homework_items for select to authenticated using (
  exists (select 1 from public.assignments a where a.id = assignment_id and public.can_see_assignment(a.grade, a.class_id, a.status))
  and (student_id is null or public.can_view_student(student_id))
);
create policy homework_items_staff on public.homework_items for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy homework_item_keys_staff on public.homework_item_keys for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy homework_attempts_select on public.homework_attempts for select to authenticated using (public.can_view_student(student_id));
-- Жазу тек сервер арқылы (service role)

-- ---------- Меңгеру дерегі (ТЗ 15) ----------
-- Әр есептің алғашқы ДЕРБЕС бағаланған жауабы бір рет. Көмекпен түзетілген (revised) жауап кірмейді.
-- Дереккөздер: үй жұмысының first әрекеті және БЖБ/ТЖБ/жаттығу сессиясының жауабы.
create or replace function public.objective_evidence(p_student uuid)
returns table (
  objective_id uuid, topic_id uuid, unit_id uuid, source text, source_id uuid,
  question_id uuid, earned numeric, possible numeric, difficulty smallint, at timestamptz
)
language sql stable security definer set search_path = public as $$
  with raw as (
    -- Үй жұмысы: алғашқы әрекет
    select hi.objective_id, hi.topic_id, 'homework'::text as source, ha.id as source_id,
           hi.question_id, ha.awarded_marks as earned, hi.max_marks as possible, hi.difficulty,
           coalesce(ha.submitted_at, ha.graded_at) as at, 1::numeric as w
    from public.homework_attempts ha
    join public.homework_items hi on hi.id = ha.item_id
    where ha.student_id = p_student and ha.kind = 'first'
      and ha.submitted_at is not null and ha.awarded_marks is not null and hi.objective_id is not null
    union all
    -- Сессиялар (практика/БЖБ/ТЖБ): бағаланған жауаптар, мақсатқа салмақпен
    select qo.objective_id,
           coalesce(pi.topic_id, (select qt.topic_id from public.question_topics qt where qt.question_id = pi.question_id limit 1)),
           'session', r.id, pi.question_id, r.awarded_marks, pi.max_marks, q.difficulty,
           coalesce(r.submitted_at, ps.submitted_at, r.updated_at), qo.weight
    from public.responses r
    join public.practice_items pi on pi.id = r.session_item_id
    join public.practice_sessions ps on ps.id = pi.session_id
    join public.questions q on q.id = pi.question_id
    join public.question_objectives qo on qo.question_id = pi.question_id
    where r.user_id = p_student and ps.owner_id = p_student
      and ps.status in ('submitted', 'graded') and r.awarded_marks is not null
  ),
  firsts as (
    -- Бір есеп (question_id) бір мақсат бойынша бір-ақ рет: ең алғашқысы
    select distinct on (objective_id, coalesce(question_id, source_id)) *
    from raw
    order by objective_id, coalesce(question_id, source_id), at asc nulls last
  )
  select f.objective_id, f.topic_id, coalesce(lo.unit_id, t.unit_id), f.source, f.source_id, f.question_id,
         round(f.earned * f.w, 4), round(f.possible * f.w, 4), f.difficulty, f.at
  from firsts f
  join public.learning_objectives lo on lo.id = f.objective_id
  left join public.topics t on t.id = f.topic_id
  where public.can_view_student(p_student)
$$;
revoke all on function public.objective_evidence(uuid) from public, anon;
grant execute on function public.objective_evidence(uuid) to authenticated;
