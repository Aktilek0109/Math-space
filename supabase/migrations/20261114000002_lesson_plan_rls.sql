-- ҚМЖ оқушыға көрінбейді (материал да, файлы да)
drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials for select to authenticated
  using ((status = 'published' and type <> 'lesson_plan' and public.is_active_user()) or public.is_staff());
drop policy if exists material_assets_select on public.material_assets;
create policy material_assets_select on public.material_assets for select to authenticated
  using (exists (select 1 from public.materials m where m.id = material_id
                 and ((m.status = 'published' and m.type <> 'lesson_plan' and public.is_active_user()) or public.is_staff())));
