-- =====================================================================
-- 0003: Private Storage buckets
-- Жүктеп алу тек сервер жасаған қысқа мерзімді signed URL арқылы
-- (рұқсатты сервер тексереді), сондықтан оқушыға SELECT саясаты жоқ.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('materials', 'materials', false, 31457280, array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'image/png', 'image/jpeg']),
  ('problem-assets', 'problem-assets', false, 10485760, array['image/png','image/jpeg','image/svg+xml']),
  ('answer-assets',  'answer-assets',  false, 10485760, array['image/png','image/jpeg','image/svg+xml'])
on conflict (id) do nothing;

create policy storage_staff_read on storage.objects for select to authenticated
  using (bucket_id in ('materials','problem-assets','answer-assets') and public.is_staff());
create policy storage_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('materials','problem-assets','answer-assets') and public.is_staff());
create policy storage_admin_delete on storage.objects for delete to authenticated
  using (bucket_id in ('materials','problem-assets','answer-assets') and public.is_admin());
