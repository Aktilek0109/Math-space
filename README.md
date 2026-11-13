# Оқу платформасы 7–12 (математика, пилот)

## ⚡ Іске қосу: Vercel + Supabase (Node.js орнатудың қажеті жоқ)

1. **Supabase** (supabase.com) → New project. Аймақ: Frankfurt (eu-central-1). Database password-ты сақтап қойыңыз.
2. Supabase → **SQL Editor** → New query → `supabase/setup-all.sql` файлының бүкіл мәтінін қойып, **Run**.
3. Supabase → **Authentication → Sign In / Providers**: «Allow new users to sign up» — **өшіріңіз**.
4. Әкімші: Authentication → Users → **Add user → Create new user** — Email `admin@students.eduplatform.local`, өз парольіңіз, «Auto Confirm User» ✓. Содан кейін SQL Editor-де `supabase/make-admin.sql`.
5. **GitHub** → New repository (Private) → осы папканың ішіндегісін жүктеңіз (Add file → Upload files, папкаларды сүйреп апарыңыз).
6. **Vercel** (vercel.com, GitHub арқылы кіріңіз) → Add New → Project → репозиторийді Import.
   Environment Variables (Supabase → Project Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon public кілті
   - `SUPABASE_SERVICE_ROLE_KEY` — service_role кілті (**құпия**, ешкімге бермеңіз)
   - `AUTH_EMAIL_DOMAIN` — `students.eduplatform.local`
   → **Deploy**.
7. Сайтқа `admin` болып кіріңіз → **Басқару → Материалдар → 📁 Папкадан жаппай импорт** → «Математика — оқушыларға» папкасын таңдап, «Бастау».
8. **Басқару → Аккаунттар → CSV**: бұрынғы сайттың логин кестесін Google Sheets-тен *Файл → Жүктеу → CSV* етіп жүктеп, осы жерге беріңіз. Логиндер мен аты-жөндер сақталады, әр оқушыға жаңа уақытша пароль беріледі («CSV жүктеу» батырмасы — парольдер тізімі, бір рет көрсетіледі).

> Ескерту: Vercel бір сұрауға 4,5 МБ-тан үлкен файл қабылдамайды. Үлкен файлдарды «Жаңа материал» формасынан емес, «Папкадан жаппай импорт» арқылы жүктеңіз — онда файл Supabase Storage-қа тікелей барады.

---


Next.js 15 (App Router) · TypeScript · Supabase (Auth, Postgres + RLS, Storage) · Tailwind CSS 4 · Vercel.

## Не дайын

| Бөлім | Мазмұны |
|---|---|
| Авторизация | Username + пароль (Supabase Auth, username → техникалық email серверде), алғашқы кіруде пароль ауыстыру, бұғаттау, login rate limit |
| Кітапхана | 7–12 сынып → бөлім → тақырып, іздеу, сүзгі, PDF/сурет preview, DOCX/PPTX жүктеу (private bucket + 60 сек signed URL), соңғы ашылғандар |
| БЖБ/ТЖБ | Банктен квотамен жинау (дубльсіз), жетпесе — параметрленген үлгілерден толтыру, жетіспеушілік себебі |
| Үлгілер | 4 тексерілген генератор: `linear-equation`, `power-rules` (7-сынып), `derivative-at-point`, `log-equation` (10-сынып). Seed бойынша қайталанады, валидаторы бар |
| МЭСК | Тапсырмалар банкі (сынып/бөлім/жыл/компонент), пробный құрастырғыш: қолжетімділікті тірі санау, blueprint немесе өз параметрі, «қайталанбау» |
| Сынақ | Draft жауап автосақтау, таймер + серверлік auto-submit, жаттығу режимінде әр тапсырманы ашу, idempotent submit |
| Нәтиже | Балл, пайыз, бөлімдер кесіндісі, шешімдер, прогресс; мұғалім ашық жауапты бағалайды |
| Басқару | Материал upload/publish, есеп енгізу (кілт+дескриптор), құрылым, үлгілерді 100 рет тексеру, аккаунттар (бір-бірлеп/CSV, пароль қалпына келтіру), статистика |

**Қауіпсіздік қағидасы:** жауап кілттері `question_keys` / `practice_item_keys` кестелерінде; оқушыға RLS саясаты жоқ (default deny). Кілтті тек сервер service-role арқылы оқиды және тек тапсырылғаннан кейін (немесе жаттығу режимінде жауап сақталған тапсырмаға) береді.

## Іске қосу

```bash
# 1. Тәуелділіктер
npm install

# 2. Supabase жобасын жасаңыз (supabase.com) → SQL Editor-де ретімен орындаңыз:
#    supabase/migrations/20261112000001_schema.sql
#    supabase/migrations/20261112000002_rls.sql
#    supabase/migrations/20261112000003_storage.sql
#    supabase/seed.sql                (демо деректер)
#   немесе Supabase CLI:  supabase link && supabase db push && psql ... -f supabase/seed.sql

# 3. Supabase → Authentication → Sign In / Providers:
#    "Allow new users to sign up" — ӨШІРУ (ашық тіркелу жоқ, AUTH-01)
#    "Confirm email" — маңызды емес (аккаунттарды әкімші растап жасайды)

# 4. ENV
cp .env.example .env.local   # мәндерді толтырыңыз

# 5. Алғашқы әкімші
npm run create-admin -- admin "Әкімші аты"

# 6. Іске қосу
npm run dev        # http://localhost:3000
npm test           # генератор / бағалау / жинау тесттері
psql "$DB_URL" -f supabase/tests/rls_test.sql   # 19 RLS тексерісі (ROLLBACK-пен)
npm run typecheck
```

## Vercel-ге шығару

1. Репозиторийді GitHub-қа жүктеп, Vercel-де Import жасаңыз.
2. Settings → Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_EMAIL_DOMAIN` (Production + Preview).
3. `main` → Production, басқа branch → Preview. Домен: Settings → Domains.

## Құрылым

```
supabase/migrations/   схема, RLS, storage
supabase/seed.sql      демо: әр сыныпқа бөлім, 5 сұрақ, 4 үлгі, 1 МЭСК blueprint
src/lib/generator/     параметрленген үлгілер (таза TS, тестіленеді)
src/lib/assemble.ts    квотамен таңдау алгоритмі
src/lib/grading.ts     серверлік тексеру
src/lib/sessions.ts    сессия жасау / жауап / ашу / тапсыру / қолмен бағалау
src/app/api/           ТТ 8-бөліміндегі API
src/app/(app)/         оқушы және басқару беттері
tests/core.test.ts     AC-04, AC-05, AC-06 және бағалау тесттері
```

## Жаңа үлгі қосу

1. `src/lib/generator/templates.ts` ішінде `generate(rng)` және `validate(item)` жазыңыз, `TEMPLATES`-ке қосыңыз.
2. `npm test` — 1000 сынақтан өтуі керек.
3. `generator_templates` кестесіне жол қосыңыз (template_key, grade, unit_id, topic_id), status = `draft`.
4. Басқару → Үлгілер → «Тексеріп, жариялау».

Үлгі кодын өзгертсеңіз — `version`-ды көтеріп, базаға жаңа жол қосыңыз (ескі сессиялар seed + нұсқа бойынша қайта жасалады).

## ТТ-дан ауытқулар / кейінге қалдырылғандар

- ТТ-ға қосылған кестелер: `classes`, `class_members`, `teacher_assignments` (мұғалім көру аймағы), `material_views`, `login_attempts`; `material_assets.version_no/is_current` (нұсқалар), `materials.license/source/rights_confirmed`, `questions.language/unit_id/exam_types`, `responses.revealed`.
- Жаттығу режимі: кілт тек жауап сақталғаннан кейін ашылады, содан соң сол тапсырманың жауабы құлыпталады.
- Сұрақ суреттері (`question_assets`) схемада бар, бірақ UI-да әлі жоқ.
- Сыныптарды/мұғалім бекітуді басқару UI-ы жоқ — әзірге SQL арқылы. Мұғалім сынып бекітілмейінше оқушы нәтижелерін көрмейді.
- P1: PDF экспорт, AI ұсыныстары, орыс тіліндегі интерфейс, таңдаулылар UI, ZIP импорт.
- Rate limit Postgres кестесі арқылы; жүктеме өссе — Upstash/Vercel KV.
- `noImplicitAny` өшірулі: Supabase типтері генерацияланбаған. Кейін: `supabase gen types typescript > src/lib/database.types.ts`.

## Қабылдау тексерісі (қолмен)

| AC | Қалай тексеру |
|---|---|
| AC-01 | 7-сынып оқушысымен кіріп, /library?grade=12 ашу |
| AC-02 | Оқушымен /admin → /dashboard?forbidden=1; `fetch('/api/admin/users',{method:'POST'})` → 403 |
| AC-05, 04, 06 | `npm test` |
| AC-07 | `supabase/tests/rls_test.sql`; қосымша: `/api/sessions/:id` жауабында `key: null` |
| AC-08 | `supabase/tests/rls_test.sql`; қосымша: екінші оқушы `/results/:id` → 404 |
| AC-09 | DevTools-тан `/api/sessions/:id/submit` екі рет қатар → бір `results` жолы |
