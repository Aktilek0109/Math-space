-- =====================================================================
-- EduPlatform 7–12 | 0001: негізгі схема
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Enum түрлері ----------
create type public.user_role       as enum ('student', 'teacher', 'admin');
create type public.content_status  as enum ('draft', 'review', 'published', 'archived');
create type public.material_type   as enum ('presentation', 'worksheet', 'theory', 'solution', 'extra_problems', 'link', 'other');
create type public.question_type   as enum ('single', 'multi', 'numeric', 'short', 'open', 'multipart');
create type public.source_kind     as enum ('authored', 'adapted', 'past_exam', 'template');
create type public.exam_type       as enum ('BZhB', 'TZhB', 'MESK');
create type public.session_mode    as enum ('practice', 'exam');
create type public.session_status  as enum ('in_progress', 'submitting', 'submitted', 'graded');
create type public.marking_state   as enum ('auto', 'pending', 'manual', 'self');
create type public.asset_visibility as enum ('public', 'protected');

-- ---------- updated_at триггері ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Пайдаланушылар ----------
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  username             text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  full_name            text not null default '',
  role                 public.user_role not null default 'student',
  current_grade        smallint check (current_grade between 7 and 12),
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Сыныптар/топтар және мұғалімді бекіту (PROG-02 үшін)
create table public.classes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,              -- мыс. "7А"
  grade         smallint not null check (grade between 7 and 12),
  academic_year text not null,              -- мыс. "2026-2027"
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (name, academic_year)
);

create table public.class_members (
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table public.teacher_assignments (
  class_id   uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);

-- ---------- Оқу құрылымы ----------
create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references public.subjects(id),
  grade         smallint not null check (grade between 7 and 12),
  academic_year text,
  term          smallint check (term between 1 and 4),
  title         text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index units_subject_grade_idx on public.units (subject_id, grade, term, sort_order);

create table public.topics (
  id                       uuid primary key default gen_random_uuid(),
  unit_id                  uuid not null references public.units(id) on delete cascade,
  title                    text not null,
  learning_objective_codes text[] not null default '{}',
  sort_order               int not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index topics_unit_idx on public.topics (unit_id, sort_order);

-- ---------- Материалдар ----------
-- array_to_string STABLE болғандықтан, generated column үшін immutable орауыш
create or replace function public.material_search_vector(p_title text, p_desc text, p_tags text[])
returns tsvector language sql immutable parallel safe as $$
  select to_tsvector('simple'::regconfig,
    coalesce(p_title, '') || ' ' || coalesce(p_desc, '') || ' ' || coalesce(array_to_string(p_tags, ' '), ''))
$$;

create table public.materials (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null default '',
  subject_id    uuid not null references public.subjects(id),
  grade         smallint not null check (grade between 7 and 12),
  unit_id       uuid references public.units(id),
  topic_id      uuid references public.topics(id),
  type          public.material_type not null default 'other',
  language      text not null default 'kk',
  tags          text[] not null default '{}',
  sort_order    int not null default 0,
  external_url  text,
  license       text,                      -- SEC-07
  source        text,                      -- SEC-07
  rights_confirmed boolean not null default false,
  status        public.content_status not null default 'draft',
  owner_id      uuid references public.profiles(id),
  published_at  timestamptz,
  search_tsv    tsvector generated always as (
                  public.material_search_vector(title, description, tags)
                ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index materials_catalog_idx on public.materials (status, grade, subject_id, unit_id, topic_id);
create index materials_search_idx  on public.materials using gin (search_tsv);

create table public.material_assets (
  id            uuid primary key default gen_random_uuid(),
  material_id   uuid not null references public.materials(id) on delete cascade,
  storage_path  text not null unique,
  original_name text not null,
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0),
  position      int not null default 0,
  version_no    int not null default 1,      -- LIB-02: ескі нұсқа жойылмайды
  is_current    boolean not null default true,
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index material_assets_material_idx on public.material_assets (material_id, is_current, position);

create table public.material_views (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  viewed_at   timestamptz not null default now(),
  primary key (user_id, material_id)
);
create index material_views_recent_idx on public.material_views (user_id, viewed_at desc);

create table public.bookmarks (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, material_id)
);

-- ---------- Сұрақтар банкі ----------
-- body_json пішімі: { text, options?: [{id,text}], parts?: [{label,text,marks}], image_asset_ids?: [] }
create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references public.subjects(id),
  grade         smallint not null check (grade between 7 and 12),
  unit_id       uuid references public.units(id),
  body_json     jsonb not null,
  question_type public.question_type not null,
  marks         numeric(5,2) not null check (marks > 0),
  difficulty    smallint not null default 2 check (difficulty between 1 and 3),
  language      text not null default 'kk',
  source_kind   public.source_kind not null default 'authored',
  source        text,
  license       text,
  exam_types    public.exam_type[] not null default '{}',  -- қай дайындыққа жарайды
  exam_year     smallint,
  component     text,                                     -- МЭСК Paper/Component
  status        public.content_status not null default 'draft',
  owner_id      uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index questions_select_idx on public.questions (status, subject_id, grade, unit_id, difficulty);
create index questions_exam_idx   on public.questions using gin (exam_types);

create table public.question_topics (
  question_id uuid not null references public.questions(id) on delete cascade,
  topic_id    uuid not null references public.topics(id) on delete cascade,
  primary key (question_id, topic_id)
);
create index question_topics_topic_idx on public.question_topics (topic_id);

-- Жауап кілттері — бөлек кесте, оқушыға SELECT жоқ
-- answer_json: single {correct:"a"} | multi {correct:["a","c"]} | numeric {value, tolerance}
--              short {accepted:["..."]} | open/multipart {}
create table public.question_keys (
  question_id   uuid primary key references public.questions(id) on delete cascade,
  answer_json   jsonb not null default '{}',
  solution_json jsonb not null default '{}',   -- {text}
  rubric_json   jsonb not null default '[]',   -- [{descriptor, marks}]
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.question_assets (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions(id) on delete cascade,
  storage_path text not null unique,
  visibility   public.asset_visibility not null default 'public',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Параметрленген үлгілер: код src/lib/generator/templates ішінде, мұнда тіркеу/жариялау
create table public.generator_templates (
  id                      uuid primary key default gen_random_uuid(),
  template_key            text not null,               -- кодтағы кілт
  topic_id                uuid references public.topics(id),
  grade                   smallint not null check (grade between 7 and 12),
  unit_id                 uuid references public.units(id),
  exam_types              public.exam_type[] not null default '{BZhB,TZhB}',
  parameters_schema       jsonb not null default '{}',
  generation_code_version int not null default 1,
  validator_version       int not null default 1,
  status                  public.content_status not null default 'draft',
  last_validated_at       timestamptz,
  usage_count             bigint not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (template_key, generation_code_version)
);

-- ---------- Емтихан форматы ----------
-- distribution_json: [{ unit_ids?:[], topic_ids?:[], count?:int, marks?:num, difficulty?:1..3 }]
create table public.exam_blueprints (
  id                uuid primary key default gen_random_uuid(),
  subject_id        uuid not null references public.subjects(id),
  exam_type         public.exam_type not null,
  grade             smallint not null check (grade between 7 and 12),
  component         text,
  title             text not null,
  allowed_unit_ids  uuid[] not null default '{}',
  distribution_json jsonb not null default '[]',
  duration_min      int check (duration_min > 0),
  total_marks       numeric(6,2),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------- Сессиялар мен жауаптар ----------
create table public.practice_sessions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  exam_type       public.exam_type not null,
  mode            public.session_mode not null default 'practice',
  grade           smallint not null check (grade between 7 and 12),
  blueprint_id    uuid references public.exam_blueprints(id),
  parameters_json jsonb not null,
  seed            bigint not null,
  status          public.session_status not null default 'in_progress',
  time_limit_min  int check (time_limit_min > 0),
  started_at      timestamptz not null default now(),
  deadline_at     timestamptz,
  submitted_at    timestamptz,
  total_marks     numeric(6,2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index practice_sessions_owner_idx on public.practice_sessions (owner_id, created_at desc);

create table public.practice_items (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.practice_sessions(id) on delete cascade,
  question_id          uuid references public.questions(id),
  template_id          uuid references public.generator_templates(id),
  template_seed        bigint,
  sequence_no          int not null,
  question_type        public.question_type not null,
  public_snapshot_json jsonb not null,   -- оқушыға көрінетін шарт (кілтсіз)
  max_marks            numeric(5,2) not null,
  unit_id              uuid references public.units(id),
  topic_id             uuid references public.topics(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (session_id, sequence_no),
  check (question_id is not null or template_id is not null)
);
create index practice_items_question_idx on public.practice_items (question_id);

create table public.practice_item_keys (
  practice_item_id    uuid primary key references public.practice_items(id) on delete cascade,
  private_answer_json jsonb not null default '{}',
  private_solution_json jsonb not null default '{}',
  private_rubric_json jsonb not null default '[]',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.responses (
  id              uuid primary key default gen_random_uuid(),
  session_item_id uuid not null unique references public.practice_items(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  response_json   jsonb not null default '{}',
  revealed        boolean not null default false,  -- жаттығу режимінде кілт ашылды → жауап құлыпталады
  submitted_at    timestamptz,
  awarded_marks   numeric(5,2),
  marking_state   public.marking_state,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index responses_user_idx on public.responses (user_id);

create table public.results (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null unique references public.practice_sessions(id) on delete cascade,  -- double scoring жоқ
  user_id        uuid not null references public.profiles(id) on delete cascade,
  marks_earned   numeric(6,2) not null,
  marks_possible numeric(6,2) not null,
  percent        numeric(5,2) not null,
  pending_manual boolean not null default false,
  feedback_json  jsonb not null default '{}',     -- {by_unit: [...], wrong_topic_ids: [...]}
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index results_user_idx on public.results (user_id, created_at desc);

-- ---------- Журналдар ----------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id),
  action      text not null,
  entity_type text,
  entity_id   text,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create table public.login_attempts (
  id         bigint generated always as identity primary key,
  username   text not null,
  ip         text,
  success    boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_lookup_idx on public.login_attempts (username, created_at desc);
create index login_attempts_ip_idx     on public.login_attempts (ip, created_at desc);

-- ---------- updated_at триггерлерін қосу ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','classes','subjects','units','topics','materials','material_assets',
    'questions','question_keys','question_assets','generator_templates','exam_blueprints',
    'practice_sessions','practice_items','practice_item_keys','responses','results'
  ] loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- Жаңа auth пайдаланушысы → profile ----------
-- Рөл тек app_metadata-дан оқылады (оны тек service-role орната алады).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, role, current_grade, must_change_password)
  values (
    new.id,
    lower(coalesce(new.raw_app_meta_data->>'username', split_part(new.email, '@', 1))),
    coalesce(new.raw_app_meta_data->>'full_name', ''),
    coalesce((new.raw_app_meta_data->>'role')::public.user_role, 'student'),
    nullif(new.raw_app_meta_data->>'grade', '')::smallint,
    coalesce((new.raw_app_meta_data->>'must_change_password')::boolean, true)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- published_at автоматты
create or replace function public.set_published_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'published' then
    if tg_op = 'INSERT' then
      new.published_at := now();
    elsif old.status <> 'published' then
      new.published_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger materials_published_at before insert or update on public.materials
  for each row execute function public.set_published_at();

-- Генератор қолданысы санағышы
create or replace function public.increment_template_usage(p_ids uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.generator_templates set usage_count = usage_count + 1 where id = any(p_ids);
$$;
revoke execute on function public.increment_template_usage(uuid[]) from public, anon, authenticated;
