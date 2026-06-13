# 🥗 NutriAI – osobný nutričný denník s AI

Webová aplikácia (PWA) na sledovanie stravy a kalórií. Jedlo zadávaš
**voľným textom alebo diktovaním** – umelá inteligencia (Google Gemini)
rozpozná jednotlivé položky, odhadne kalórie a makrá (bielkoviny, sacharidy,
tuky), zobrazí ti návrh a **až po potvrdení** sa záznam uloží do denníka.

> Príklad: *„Zjedol som zhruba 400 g porciu sviečkovej s knedľou.“*
> → AI to rozloží na omáčku/mäso a knedľu, prepočíta podľa gramáže a navrhne hodnoty.

## ✨ Funkcie

- **AI rozpoznávanie jedál** z textu alebo hlasu (diktovanie cez mikrofón)
- **Návrh + potvrdenie** – každú položku môžeš pred uložením upraviť
- **Denník po jedlách** (raňajky, obed, večera, desiata) s dennými súčtami
- **Denné ciele** kalórií a makier s farebnými ukazovateľmi pokroku
- **História** s priemerným príjmom a grafom za 7/14/30 dní
- **Databáza potravín** – predvyplnené slovenské jedlá + vlastné položky
- **Profil** s výpočtom odporúčaného príjmu (BMR/TDEE podľa Mifflin–St Jeor)
- **PWA** – na iPhone pridáš na plochu a používaš ako appku (Safari → Zdieľať → *Pridať na plochu*)
- **Ochrana heslom** – dáta sú len tvoje

## 🧱 Technológie

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma + PostgreSQL · Google Gemini

---

## 🚀 Rýchle nasadenie na Vercel (odporúčané)

### 1. Priprav si databázu (zadarmo)
Vytvor Postgres databázu, napr. na [Neon](https://neon.tech) alebo
[Supabase](https://supabase.com). Skopíruj si **connection string**
(`postgresql://…`).

### 2. Získaj Gemini API kľúč
Na [Google AI Studio](https://aistudio.google.com/apikey) vytvor API kľúč
(má štedrý free tier).

### 3. Deploy
1. Naimportuj toto repo do [Vercel](https://vercel.com/new).
2. V **Settings → Environment Variables** nastav:

   | Premenná | Hodnota |
   |---|---|
   | `DATABASE_URL` | connection string z Neon/Supabase |
   | `GEMINI_API_KEY` | tvoj kľúč z AI Studio |
   | `GEMINI_MODEL` | `gemini-3.5-flash` (voliteľné) |
   | `APP_PASSWORD` | heslo, ktorým sa budeš prihlasovať |
   | `SESSION_SECRET` | náhodný dlhý reťazec (`openssl rand -base64 32`) |

3. Klikni **Deploy**.

### 4. Vytvor tabuľky a naplň databázu
Po prvom deployi raz spusti lokálne (s rovnakým `DATABASE_URL` v `.env`):

```bash
npm install
npm run db:push     # vytvorí tabuľky
npm run db:seed     # naplní referenčnú databázu potravín
```

Hotovo – otvor URL z Vercelu, prihlás sa heslom a na iPhone pridaj na plochu.

### 5. (Voliteľné) Import verejnej databázy potravín
Okrem predvyplnených slovenských jedál si môžeš natiahnuť tisíce produktov
z [Open Food Facts](https://openfoodfacts.org) – vrátane **čiarových kódov**
a značiek, prepočítané na 100 g:

```bash
# najpopulárnejšie produkty predávané na Slovensku (default)
npm run db:import

# vlastné voľby
node scripts/import-openfoodfacts.mjs --country=slovakia --pages=30 --limit=3000
node scripts/import-openfoodfacts.mjs --search=jogurt --country=
```

Voľby: `--country` (en názov krajiny, prázdne = celý svet), `--pages`,
`--pageSize` (max 100), `--search`, `--limit`, `--dryRun`. Import beží
slušným tempom voči verejnému API a duplikáty rozpoznáva podľa čiarového kódu.
Importované potraviny sa hneď objavia vo vyhľadávaní aj ako referencia pre AI.

> Pozn.: spúšťaj lokálne alebo z prostredia s prístupom na internet
> (nie z obmedzeného sandboxu).

---

## 💻 Lokálny vývoj

```bash
cp .env.example .env     # doplň hodnoty
npm install
npm run db:push
npm run db:seed
npm run dev              # http://localhost:3000
```

## 🔐 Premenné prostredia
Pozri `.env.example`. Všetky AI volania bežia **na serveri**, takže
`GEMINI_API_KEY` sa nikdy nedostane do prehliadača.

## 📁 Štruktúra
```
prisma/schema.prisma     – dátový model (Profile, Entry, Food)
prisma/seed.ts           – referenčná databáza potravín
src/lib/gemini.ts        – rozpoznávanie jedál cez Gemini (structured output)
src/lib/nutrition.ts     – výpočty (TDEE, súčty, makrá)
src/app/api/*            – API (parse, entries, foods, profile, history, auth)
src/app/(app)/*          – obrazovky: Dnes, História, Potraviny, Profil
src/components/*         – UI komponenty (AddFoodSheet = AI vkladanie)
```

## 🛠️ Poznámky
- Diktovanie používa Web Speech API (`sk-SK`). Na iPhone v Safari funguje
  spoľahlivo aj systémový mikrofón priamo na klávesnici.
- Hodnoty z AI sú **odhady** – pri presnom vážení si ich uprav v návrhu.
- Aplikácia je jednopoužívateľská (personalizovaná pre teba).
