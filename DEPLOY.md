# 📦 Nasadenie Rypáka (NutriAI) – Vercel + Supabase + GitHub

Aktuálny stav (október 2026): appka beží na **Verceli** (Hobby), databáza je
**Supabase Postgres** (Free), AI je **OpenAI**, hodinové pripomienky spúšťa
**GitHub Actions** (Vercel Hobby cron beží len raz denne).

## 1. Premenné prostredia vo Verceli

Vercel → projekt → Settings → Environment Variables (Production):

| Premenná | Povinné | Načo |
|---|---|---|
| `DATABASE_URL` | áno | Postgres (Supabase). Odporúčané **Session pooler** (port 5432) alebo priame pripojenie. Transaction pooler (6543) len s `?pgbouncer=true` a vtedy nastav aj `DIRECT_URL`. |
| `DIRECT_URL` | odporúčané | Spojenie pre migrácie pri builde (`prisma migrate deploy`). Ak chýba, použije sa `DATABASE_URL`. |
| `SESSION_SECRET` | áno | podpis prihlasovacej cookie, min. 16 znakov (`openssl rand -base64 32`) |
| `REGISTRATION_CODE` | áno | kód, ktorým sa vytvárajú účty |
| `OPENAI_API_KEY` | áno (pre AI) | rozpoznávanie jedla, fotky, kouč |
| `OPENAI_MODEL` | nie | default `gpt-4.1` |
| `OPENAI_FALLBACK_MODEL` | nie | default `gpt-4o-mini` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | pre notifikácie | `npx web-push generate-vapid-keys` |
| `CRON_SECRET` | **áno** | heslo pre `/api/cron/*`. Bez neho cron endpointy odmietajú všetko (fail-closed) a pripomienky nechodia. |

## 2. GitHub Actions (hodinové pripomienky)

Repo → Settings → Secrets and variables → Actions:

| Secret | Hodnota |
|---|---|
| `APP_URL` | produkčná adresa bez lomky, napr. `https://nieco.vercel.app` |
| `CRON_SECRET` | **rovnaká** hodnota ako vo Verceli |

Workflow `.github/workflows/reminders.yml` beží každú celú hodinu (UTC) na
default vetve a volá `/api/cron/coach` a `/api/cron/water` s hlavičkou
`Authorization: Bearer <CRON_SECRET>`. Endpointy si samy vyberú správne okno
(SK čas) a deduplikujú.

Pozor: GitHub plánované workflowy sa po 60 dňoch bez aktivity v repe vypnú
a bežia s oneskorením až desiatky minút.

## 3. Build a migrácie

`npm run build` = `prisma generate && node scripts/migrate.mjs && node scripts/ensure-indexes.mjs && next build`.

- `scripts/migrate.mjs` spustí `prisma migrate deploy` (migrácie v `prisma/migrations/`).
  Pri prvom prechode z `db push` sa existujúca databáza označí ako „baseline“:
  `DIRECT_URL=$DATABASE_URL npx prisma migrate resolve --applied 0_init`.
- Nová zmena schémy = nová migrácia (`prisma migrate dev --create-only` nad
  lokálnou kópiou), nikdy ručná úprava produkcie.
- Pred každou zmenou schémy záloha: `scripts/db-backup.sh dump` (Docker,
  `DATABASE_URL` z lokálneho `.env`), overenie `scripts/db-backup.sh restore-test <dir>`.

## 4. Supabase Free – na čo si dať pozor

- Projekt sa **pozastaví po ~7 dňoch bez prevádzky**. Pozastavený projekt treba
  v Supabase ručne obnoviť („Restore project“); dovtedy appka databázu nevidí.
- Free plán **nemá automatické zálohy** – jediná záloha je `scripts/db-backup.sh`.
- Priame pripojenie `db.<ref>.supabase.co` je len cez IPv6; z lokálneho Macu
  alebo Dockera použi **Session pooler** (`aws-0-<región>.pooler.supabase.com:5432`).

## 5. Lokálny vývoj a overenie

```bash
cp .env.example .env        # doplň DATABASE_URL (lokálna kópia alebo Supabase), OPENAI_API_KEY
npm ci
npx prisma generate
npm run dev                 # http://localhost:3000
```

Pred každým commitom:

```bash
npx tsc --noEmit -p tsconfig.json
npm test
DATABASE_URL="postgresql://u:p@localhost:5432/db" DIRECT_URL="postgresql://u:p@localhost:5432/db" npx prisma validate
SKIP_ENV_VALIDATION=1 npx next build
```

Po pushi over nasadenie: `curl https://<app>/api/version` vráti bežiaci commit.
