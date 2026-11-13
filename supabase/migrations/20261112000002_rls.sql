-- =====================================================================
-- 0002: Row Level Security — default deny
-- Сессия/жауап/нәтижеге жазу тек сервер арқылы (service role), сондықтан
-- оқушыға INSERT/UPDATE саясаттары әдейі берілмейді.
-- =====================================================================

-- ---------- Көмекші функциялар ----------
create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_active)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('teacher','admin'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

-- Мұғалім осы оқушыға бекітілген сыныпты оқыта ма? Әкімші — бәріне true.
create or replace function public.can_view_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or p_student = auth.uid()
      or (public.app_role() = 'teacher' and exists (
            select 1
            from public.teacher_assignments ta
            join public.class_members cm on cm.class_id = ta.class_id
            where ta.teacher_id = auth.uid() and cm.student_id = p_student))
$$;

-- ---------- RLS қосу ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','classes','class_members','teacher_assignments','subjects','units','topics',
    'materials','material_assets','material_views','bookmarks','questions','question_topics',
    'question_keys','question_assets','generator_templates','exam_blueprints',
    'practice_sessions','practice_items','practice_item_keys','responses','results',
    'audit_logs','login_attempts'
  ] loop
    -- FORCE қолданылмайды: security definer көмекші функциялар (иесі postgres)
    -- profiles-ті RLS-сіз оқуы керек, әйтпесе саясат рекурсиясы болады.
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- profiles ----------
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_view_student(id));
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- сыныптар ----------
create policy classes_select on public.classes for select to authenticated using (public.is_staff());
create policy classes_admin  on public.classes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy class_members_select on public.class_members for select to authenticated
  using (public.is_staff() or student_id = auth.uid());
create policy class_members_admin on public.class_members for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy teacher_assignments_select on public.teacher_assignments for select to authenticated using (public.is_staff());
create policy teacher_assignments_admin on public.teacher_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- оқу құрылымы ----------
create policy subjects_select on public.subjects for select to authenticated using (public.is_active_user());
create policy subjects_admin  on public.subjects for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy units_select    on public.units    for select to authenticated using (public.is_active_user());
create policy units_admin     on public.units    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy topics_select   on public.topics   for select to authenticated using (public.is_active_user());
create policy topics_admin    on public.topics   for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- материалдар ----------
create policy materials_select on public.materials for select to authenticated
  using ((status = 'published' and public.is_active_user()) or public.is_staff());
create policy materials_staff_insert on public.materials for insert to authenticated
  with check (public.is_staff());
create policy materials_staff_update on public.materials for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy materials_admin_delete on public.materials for delete to authenticated
  using (public.is_admin());

create policy material_assets_select on public.material_assets for select to authenticated
  using (exists (select 1 from public.materials m where m.id = material_id
                 and ((m.status = 'published' and public.is_active_user()) or public.is_staff())));
create policy material_assets_staff on public.material_assets for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy material_views_own on public.material_views for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy bookmarks_own on public.bookmarks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- сұрақтар (шарт қана) ----------
create policy questions_select on public.questions for select to authenticated
  using ((status = 'published' and public.is_active_user()) or public.is_staff());
create policy questions_staff on public.questions for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy question_topics_select on public.question_topics for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id
                 and ((q.status = 'published' and public.is_active_user()) or public.is_staff())));
create policy question_topics_staff on public.question_topics for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Жауап кілттері: ТЕК персонал. Оқушыға ешқандай саясат жоқ → default deny (AC-07).
create policy question_keys_staff on public.question_keys for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy question_assets_select on public.question_assets for select to authenticated
  using (public.is_staff() or (visibility = 'public' and exists (
           select 1 from public.questions q where q.id = question_id
           and q.status = 'published' and public.is_active_user())));
create policy question_assets_staff on public.question_assets for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy generator_templates_staff on public.generator_templates for all to authenticated
  using (public.is_staff()) with check (public.is_admin());

create policy exam_blueprints_select on public.exam_blueprints for select to authenticated
  using (public.is_active_user() and (is_active or public.is_staff()));
create policy exam_blueprints_admin on public.exam_blueprints for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- сессиялар (тек оқу) ----------
create policy practice_sessions_select on public.practice_sessions for select to authenticated
  using (public.can_view_student(owner_id));

create policy practice_items_select on public.practice_items for select to authenticated
  using (exists (select 1 from public.practice_sessions s
                 where s.id = session_id and public.can_view_student(s.owner_id)));

-- Сессия кілттері: оқушыға тікелей жоқ; сервер тапсырғаннан кейін ғана береді.
create policy practice_item_keys_staff on public.practice_item_keys for select to authenticated
  using (public.is_staff() and exists (
           select 1 from public.practice_items i join public.practice_sessions s on s.id = i.session_id
           where i.id = practice_item_id and public.can_view_student(s.owner_id)));

create policy responses_select on public.responses for select to authenticated
  using (public.can_view_student(user_id));
create policy results_select on public.results for select to authenticated
  using (public.can_view_student(user_id));

-- ---------- журнал ----------
create policy audit_logs_admin on public.audit_logs for select to authenticated using (public.is_admin());
-- login_attempts: саясат жоқ — тек service role.

-- anon рөліне ештеңе жоқ
revoke all on all tables in schema public from anon;
