// Алғашқы әкімшіні жасау:
//   node --env-file=.env.local scripts/create-admin.mjs <username> "<Аты-жөні>"
// Уақытша пароль экранға бір рет шығады; алғашқы кіруде ауыстыру міндетті.
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

const [username, fullName = ''] = process.argv.slice(2);
if (!username || !/^[a-z0-9._-]{3,32}$/.test(username)) {
  console.error('Қолданылуы: node --env-file=.env.local scripts/create-admin.mjs <username> "<Аты-жөні>"');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL және SUPABASE_SERVICE_ROLE_KEY керек');
  process.exit(1);
}
const domain = process.env.AUTH_EMAIL_DOMAIN ?? 'students.eduplatform.local';
const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const password = Array.from({ length: 12 }, () => abc[randomInt(abc.length)]).join('') + randomInt(10);

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error } = await supabase.auth.admin.createUser({
  email: `${username}@${domain}`,
  password,
  email_confirm: true,
  app_metadata: { username, full_name: fullName, role: 'admin', must_change_password: true },
});
if (error) {
  console.error('Қате:', error.message);
  process.exit(1);
}
console.log(`Әкімші жасалды.\n  Логин:  ${username}\n  Пароль: ${password}\nАлғашқы кіруде парольді ауыстырыңыз.`);
