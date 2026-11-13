-- =====================================================================
-- RLS тесті (AC-02, AC-07, AC-08). Бос тест базасында seed-тен кейін:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Бәрі транзакцияда, соңында ROLLBACK — деректер өзгермейді.
-- =====================================================================
\pset tuples_only on
begin;

-- Пайдаланушылар (триггер profiles жасайды)
insert into auth.users (id, email, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-00000000000a', 'adm@t', '{"username":"adm","role":"admin","must_change_password":false}'),
  ('a0000000-0000-0000-0000-0000000000a1', 'tch@t', '{"username":"tch","role":"teacher","must_change_password":false}'),
  ('a0000000-0000-0000-0000-000000000001', 's1@t',  '{"username":"stud1","role":"student","grade":"7"}'),
  ('a0000000-0000-0000-0000-000000000002', 's2@t',  '{"username":"stud2","role":"student","grade":"12"}');

insert into public.classes (id, name, grade, academic_year) values ('c0000000-0000-0000-0000-000000000001', '7А', 7, '2026-2027');
insert into public.class_members values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
insert into public.teacher_assignments values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1');

-- Әр оқушыға бір аяқталған сессия
insert into public.practice_sessions (id, owner_id, exam_type, grade, parameters_json, seed, status) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'BZhB', 7, '{}', 1, 'graded'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'BZhB', 12, '{}', 2, 'graded');
insert into public.practice_items (id, session_id, question_id, sequence_no, question_type, public_snapshot_json, max_marks) values
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 'single', '{"text":"q"}', 1),
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 1, 'single', '{"text":"q"}', 1);
insert into public.practice_item_keys (practice_item_id, private_answer_json) values
  ('f0000000-0000-0000-0000-000000000001', '{"correct":"b"}'), ('f0000000-0000-0000-0000-000000000002', '{"correct":"b"}');
insert into public.results (session_id, user_id, marks_earned, marks_possible, percent) values
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 1, 100),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 0, 1, 0);
insert into public.materials (title, subject_id, grade, status) values
  ('ЖАСЫРЫН draft', '00000000-0000-0000-0000-000000000001', 12, 'draft');

create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'СӘТСІЗ: %', label; end if;
  raise notice 'OK: %', label;
end $$;

-- ---------------- Оқушы s1 ----------------
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';

select pg_temp.check((select count(*) from public.question_keys) = 0, 'AC-07: оқушы question_keys көрмейді');
select pg_temp.check((select count(*) from public.practice_item_keys) = 0, 'AC-07: оқушы practice_item_keys көрмейді');
select pg_temp.check((select count(*) from public.results) = 1, 'AC-08: оқушы тек өз нәтижесін көреді');
select pg_temp.check((select count(*) from public.practice_sessions where owner_id = 'a0000000-0000-0000-0000-000000000002') = 0, 'AC-08: басқаның сессиясы көрінбейді');
select pg_temp.check((select count(*) from public.profiles) = 1, 'оқушы тек өз профилін көреді');
select pg_temp.check((select count(*) from public.materials where grade = 7 and status = 'published') >= 1, 'AC-01: жарияланған материал көрінеді');
select pg_temp.check((select count(*) from public.materials where status <> 'published') = 0, 'draft материал көрінбейді');
select pg_temp.check((select count(*) from public.questions where status = 'published') >= 1, 'жарияланған сұрақ шарты көрінеді');

with u as (update public.profiles set role = 'admin' where id = auth.uid() returning 1)
select pg_temp.check((select count(*) from u) = 0, 'AC-02: оқушы өз рөлін өзгерте алмайды');
with u as (update public.results set marks_earned = 999 returning 1)
select pg_temp.check((select count(*) from u) = 0, 'оқушы нәтижені өзгерте алмайды');

do $$ begin
  insert into public.practice_sessions (owner_id, exam_type, grade, parameters_json, seed)
  values (auth.uid(), 'BZhB', 7, '{}', 1);
  raise exception 'СӘТСІЗ: оқушы сессияны тікелей жасады';
exception when insufficient_privilege then raise notice 'OK: оқушы сессияны тікелей жасай алмайды';
end $$;

do $$ begin
  insert into public.materials (title, subject_id, grade, status) values ('x', '00000000-0000-0000-0000-000000000001', 7, 'published');
  raise exception 'СӘТСІЗ: оқушы материал қосты';
exception when insufficient_privilege then raise notice 'OK: AC-02 оқушы материал қоса алмайды';
end $$;

-- ---------------- Мұғалім ----------------
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-0000000000a1';
select pg_temp.check((select count(*) from public.results) = 1, 'мұғалім тек өз сыныбының нәтижесін көреді');
select pg_temp.check((select count(*) from public.question_keys) >= 1, 'мұғалім жауап кілттерін көреді');
select pg_temp.check((select count(*) from public.materials where status = 'draft') >= 1, 'мұғалім draft көреді');
with u as (update public.profiles set role = 'admin' where id = auth.uid() returning 1)
select pg_temp.check((select count(*) from u) = 0, 'мұғалім рөл бере алмайды');

-- ---------------- Әкімші ----------------
reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000a';
select pg_temp.check((select count(*) from public.results) = 2, 'әкімші барлық нәтижені көреді');

-- ---------------- Бұғатталған оқушы ----------------
reset role;
update public.profiles set is_active = false where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.check((select count(*) from public.materials) = 0, 'бұғатталған аккаунт материал көрмейді');

-- ---------------- Аноним ----------------
reset role;
set local role anon;
do $$ begin
  perform 1 from public.materials limit 1;
  raise exception 'СӘТСІЗ: anon materials оқыды';
exception when insufficient_privilege then raise notice 'OK: anon ештеңе оқи алмайды';
end $$;

reset role;
rollback;
