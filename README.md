# 🥗 NutriAI – nutričný denník s AI a koučom s osobnosťou

Webová aplikácia (PWA) na sledovanie stravy, vody, spánku, hmotnosti a
suplementov. Jedlo zadávaš **voľným textom, diktovaním, fotkou taniera,
čiarovým kódom alebo z databázy** – AI rozpozná položky, odhadne porcie,
kalórie, makrá a zdravosť, ukáže návrh a **až po potvrdení** ho uloží.

Odlišuje ju **kouč s osobnosťou** (milý / normálny / drsný „roast"), ktorý
občas okomentuje, čo si práve zjedol, ráno zhrnie včerajšok a učí sa z tvojich
👍/👎, aký humor ťa baví.

> Repozitár: <https://github.com/CrawlySon/CrawlySon> · vetva
> `claude/nutrition-tracker-app-mTVJ7` (default aj produkčná).
> Pre pokračovanie vo vývoji si prečítaj **[HANDOVER.md](HANDOVER.md)**.

## ✨ Funkcie

**Zápis jedla**
- **AI z textu / hlasu** – aj celý deň naraz („Raňajky: … / Obed: …"); každá
  sekcia sa spracuje samostatným volaním, takže sa nič nestratí
- **AI z fotky taniera** – rozpozná jedlo a odhadne gramáž z vizuálnych opôr
- **Čiarový kód** (Open Food Facts + vlastná DB, s baterkou) a **fotka tabuľky
  nutričných hodnôt** z obalu
- **Databáza potravín** – zdieľaná + vlastná, vyhľadávanie s naposledy
  použitými pre dané jedlo dňa navrchu; zmena základnej gramáže prepočíta hodnoty
- **⚡ Rýchle pridanie** – obľúbené položky/jedlá, hviezdičkovanie priamo z Potravín
- Presun/kópia celého dňa na iný dátum, drag & drop medzi jedlami, výber viacerých
  položiek → kopírovať na dnes / uložiť ako jedno jedlo

**Denné sledovanie** – voda, spánok (0–10), hmotnosť, suplementy a lieky
(katalóg + denné odškrtávanie)

**Analytika** – kalórie, zdravosť, voda, spánok; 7/14/30 dní alebo vlastné
obdobie (týždenná/mesačná agregácia), 7-dňový medián, filtre podľa kategórie,
**jedla dňa** a **bez nápojov / bez alkoholu**; neúplné dni sa nezapočítavajú

**Motivácia**
- **Odznaky a série** (zápis, kalorický cieľ, voda, ovocie, zelenina, zdravé dni,
  proteínový šejk, bez sladkého/alkoholu/tvrdého alkoholu/pečiva) s osobnými rekordmi
- **Kouč** – Web Push: ranné zhrnutie včerajška (riadok čísel + jedna veta),
  poobedné upozornenie na kalórie, večerné na ovocie, gratulácie k odznakom
- **Bubliny pri pridaní jedla** – náhodne, ale „s rozumom" (tretia klobása áno,
  espresso skoro nikdy), podľa jedla dňa, nie času zápisu; 👍/👎 → naučený vkus

**Účty** – viac používateľov, registrácia kódom, prvý účet je admin; profil
s výpočtom TDEE (Mifflin–St Jeor) a cieľmi

## 🧱 Technológie

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 5 + PostgreSQL ·
OpenAI (Chat Completions, vision) · Web Push (VAPID) · Vercel (hosting + cron)

---

## 🚀 Nasadenie na Vercel

1. **Postgres** – napr. [Neon](https://neon.tech) / Supabase, skopíruj connection string.
2. **Import repa** do [Vercel](https://vercel.com/new), produkčná vetva
   `claude/nutrition-tracker-app-mTVJ7`.
3. **Environment Variables** (detaily v `.env.example`):

   | Premenná | Povinné | Účel |
   |---|---|---|
   | `DATABASE_URL` | áno | Postgres |
   | `SESSION_SECRET` | áno | podpis prihlasovacej cookie (min. 16 znakov) |
   | `REGISTRATION_CODE` | áno | kód na vytváranie účtov |
   | `OPENAI_API_KEY` | áno (pre AI) | všetky AI funkcie |
   | `OPENAI_MODEL` | nie | default `gpt-4.1` |
   | `OPENAI_FALLBACK_MODEL` | nie | default `gpt-4o-mini` |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | pre notifikácie | `npx web-push generate-vapid-keys` |
   | `CRON_SECRET` | pre cron | ochrana `/api/cron/*` |

4. **Deploy.** Build sám spustí `prisma db push` (vytvorí/aktualizuje tabuľky)
   a `scripts/ensure-indexes.mjs` (trigramový index na vyhľadávanie).
5. Prvá registrácia vytvorí **admin** účet. Referenčné potraviny naplníš cez
   `npm run db:seed` (lokálne s produkčným `DATABASE_URL`).

**Notifikácie spúšťa GitHub Actions** (`.github/workflows/reminders.yml`) každú celú
hodinu – Vercel Hobby púšťa cron len raz denne v nepresnom čase. V GitHube nastav
*Settings → Secrets and variables → Actions*: `APP_URL` (URL appky bez lomky na konci)
a `CRON_SECRET` (rovnaký ako vo Verceli). Endpointy si samy vyberú okno v SK čase a
deduplikujú; Vercel crony vo `vercel.json` sú len záloha.

### Import Open Food Facts (voliteľné)
```bash
npm run db:import                                         # populárne produkty na SK
node scripts/import-openfoodfacts.mjs --country=slovakia --pages=30 --limit=3000
node scripts/import-openfoodfacts.mjs --search=jogurt --country=
```
Voľby: `--country`, `--pages`, `--pageSize` (max 100), `--search`, `--limit`,
`--dryRun`. Duplikáty sa rozpoznajú podľa čiarového kódu.

## 💻 Lokálny vývoj

```bash
cp .env.example .env     # doplň hodnoty
npm install
npm run db:push
npm run db:seed
npm run dev              # http://localhost:3000
```

Overenie bez databázy a bez AI kľúča:
```bash
npx tsc --noEmit -p tsconfig.json
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate
npx next build
```

## 📁 Štruktúra

```
prisma/schema.prisma          dátový model (User, Entry, Food, WaterLog, SleepLog,
                              WeightLog, Supplement*, Favorite, Achievement,
                              StreakRecord, CommentFeedback, PushSubscription, AiUsage)
src/app/(app)/                obrazovky: Dnes (page.tsx), history = Analytika, foods, profile
src/app/api/                  API routes (parse, entries, foods, history, comment, cron, …)
src/components/               UI (AddFoodSheet, CoachBubble, WaterCard, SleepCard, …)
src/lib/ai.ts                 všetky AI prompty a volania
src/lib/openai.ts             HTTP klient OpenAI (fallback modelu, parametre podľa rodiny)
src/lib/badges.ts             odznaky a série (čisté funkcie)
src/lib/coach.ts              kontext dňa pre odznaky/kouča, rekordy sérií
src/lib/food-comment.ts       kedy komentovať jedlo + učenie z 👍/👎 (čisté funkcie)
src/lib/food-tags.ts          rozpoznanie alkoholu a nápojov (zdieľané)
src/lib/nutrition.ts          výpočty (TDEE, súčty, zaokrúhľovanie)
scripts/                      indexy, import OFF, ikony
```

## 🛠️ Poznámky
- Všetky AI volania bežia **na serveri**, kľúče sa do prehliadača nedostanú.
  Repo je verejné – tajomstvá patria výhradne do env premenných hostingu.
- Hodnoty z AI sú **odhady** – pred uložením sa dajú upraviť.
- Diktovanie používa Web Speech API (`sk-SK`); na iPhone spoľahlivo funguje
  mikrofón priamo na klávesnici.
