-- Алғашқы әкімші (Node.js қажет емес):
-- 1) Supabase → Authentication → Users → «Add user» → «Create new user»:
--      Email:    admin@students.eduplatform.local   (AUTH_EMAIL_DOMAIN-мен бірдей домен)
--      Password: өзіңіз ойлап тапқан пароль
--      «Auto Confirm User» — белгілеңіз
-- 2) Осы SQL-ды SQL Editor-де іске қосыңыз. Сайтқа логин «admin» және сол парольмен кіресіз.
update public.profiles
set role = 'admin', full_name = 'Әкімші', must_change_password = false
where username = 'admin';

select username, role, must_change_password from public.profiles where username = 'admin';
