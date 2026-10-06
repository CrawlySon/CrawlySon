# HANDOVER – NutriAI (CrawlySon)

Dokument na plynulé pokračovanie vývoja v novej session / inom prostredí.
Stav k commitu na vrchu vetvy `claude/nutrition-tracker-app-mTVJ7` (október 2026).

---

## 1. Kde je čo

| | |
|---|---|
| **Repozitár** | <https://github.com/CrawlySon/CrawlySon> (verejný) |
| **Vetva** | `claude/nutrition-tracker-app-mTVJ7` – jediná vetva, default aj produkčná |
| **Hosting** | Vercel, nasadzuje sa automaticky po pushi na túto vetvu |
| **DB** | PostgreSQL (Neon/Supabase), schéma cez Prisma `db push` – **žiadne migračné súbory** |
| **AI** | výhradne **OpenAI** (default `gpt-4.1`); Gemini v kóde **nie je** |
| **Jazyk** | UI, komentáre v kóde aj komunikácia s používateľom: **slovenčina** |

```bash
git clone https://github.com/CrawlySon/CrawlySon.git
cd CrawlySon
git checkout claude/nutrition-tracker-app-mTVJ7
npm ci
npx prisma generate
```

Prečítaj aj `README.md` (funkcie, env, nasadenie) a `.env.example` (všetky premenné s popisom).

---

## 2. Ako sa tu pracovalo (dôležité pre nadviazanie)

### Prostredie session
- Session typicky **nemá** `DATABASE_URL` ani `OPENAI_API_KEY` → nedá sa spustiť appka
  s dátami ani reálne AI volanie. Všetko sa overuje staticky a testami čistých funkcií.
- Po resete kontajnera býva pracovný adresár prázdny – treba `git fetch` + `checkout` vetvy
  a `npm ci`.

### Overenie pred každým commitom (vždy všetko tri)
```bash
npx tsc --noEmit -p tsconfig.json                                   # musí byť 0 chýb
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate  # pri zmene schémy
SKIP_ENV_VALIDATION=1 npx next build                                # musí prejsť
```

### Testovanie logiky
Logika sa zámerne píše ako **čisté funkcie bez DB** (`badges.ts`, `food-comment.ts`,
`food-tags.ts`, časti `ai.ts`), aby sa dala overiť ad-hoc skriptom cez `tsx`:
```bash
mkdir -p .tmp-test && cat > .tmp-test/x.test.ts <<'EOF'
import { commentTriggers } from "../src/lib/food-comment";
// … scenáre + console.log
EOF
npx tsx .tmp-test/x.test.ts; rm -rf .tmp-test
```
Testovací framework v projekte nie je; `.tmp-test/` sa po overení maže (necommituje sa).

### Schéma – POZOR
Build spúšťa `prisma db push --skip-generate` **bez** `--accept-data-loss`.
- Pridávať polia/modely: **áno** (len nullable alebo s defaultom).
- Mazať/premenovávať stĺpce s dátami: **nie** – build na Verceli by zlyhal.
  Príklad: `User.coachRoast` je nahradený `coachPersona`, ale v schéme ostáva a drží sa
  v súlade (pozri §5).

### Git konvencie
- Commit message: anglicky, conventional (`feat(scope):`, `fix(scope):`, `refactor:`),
  **telo vysvetľuje prečo**, nie len čo. Na konci attribution riadky podľa prostredia.
- Push: `git push -u origin HEAD:claude/nutrition-tracker-app-mTVJ7`.
- **PR sa nevytvára**, kým o to používateľ nepožiada.

### Ako komunikuje používateľ
- Píše po slovensky, často posiela **screenshoty z iPhonu** (PWA) s popisom problému.
- Iteruje: najprv chce **príklady/návrhy**, potom „postav to". Keď si nie si istý
  zadaním, ukáž mu konkrétne varianty (napr. vety notifikácie) a nechaj ho vybrať.
- Oceňuje **úprimné hlásenie**: čo je overené, čo nie (AI výstupy sa zo session overiť nedajú).
- Pri bugu chce vysvetlenie **príčiny**, nielen opravu.

---

## 3. Architektúra

```
src/app/(app)/page.tsx          Dnes – súhrn, voda, rýchle pridanie, jedlá, suplementy,
                                spánok, hmotnosť, bublina kouča
src/app/(app)/history/page.tsx  Analytika (graf, priemery, filtre)
src/app/(app)/foods/page.tsx    Potraviny (DB, úpravy, ☆ do rýchleho pridania, recepty)
src/app/(app)/profile/page.tsx  Profil, ciele, notifikácie, osobnosť kouča, vkus, odznaky, série
src/components/AddFoodSheet.tsx Pridávanie jedla: AI text/hlas, fotka taniera, DB, kód, obľúbené
src/lib/ai.ts                   VŠETKY prompty a AI funkcie
src/lib/openai.ts               HTTP klient: fallback modelu, parametre pre gpt-5/o-série
src/lib/coach.ts                kontext dňa (DailyStat), rekordy sérií, podklady zhrnutia
src/lib/badges.ts               katalóg odznakov a sérií (čisté funkcie)
src/lib/food-comment.ts         kedy komentovať jedlo, učenie z 👍/👎 (čisté funkcie)
src/lib/food-tags.ts            rozpoznanie alkoholu / tvrdého alkoholu / nápojov (zdieľané)
src/lib/page-cache.ts           in-memory cache stránok (len RAM, nie localStorage)
src/middleware.ts               auth (cookie), verejné cesty, /api/cron chránený CRON_SECRET
vercel.json                     cron: water 10,16 UTC; coach 6,14,17 UTC
```

### Dátový model (Prisma)
`User` (profil, ciele, nastavenia kouča, pamäť komentárov) · `Entry` (záznam jedla;
`mealType`, `category`, `healthIndex`) · `Food` (DB potravín, hodnoty na `baseGrams`;
`userId null` = zdieľaná) · `Favorite` (rýchle pridanie, `items` JSON) · `WaterLog` ·
`SleepLog` (0–10) · `WeightLog` · `Supplement` + `SupplementLog` · `Achievement` ·
`StreakRecord` · `CommentFeedback` · `PushSubscription` · `AiUsage` · `Profile` (zastaraný,
ponechaný kvôli DB).

### Typy jedál
`breakfast, snack (desiata), lunch, afternoon (olovrant), dinner, supper (druhá večera), other`.
Poradie dňa je dôležité pre kouča (§5).

### Čas a dátumy
- Dátum záznamu je reťazec `YYYY-MM-DD` (lokálny dátum klienta).
- Server/cron počíta v **Europe/Bratislava** (`skToday()`, `skHour()` v `coach.ts`).

---

## 4. AI – čo kde beží (`src/lib/ai.ts`)

| Funkcia | Použitie | Pozn. |
|---|---|---|
| `parseFood` | text/hlas → položky | rozdelí vstup podľa nadpisov jedál („Obed: …") a každú sekciu pošle **samostatne, paralelne** (jedno veľké volanie vynechávalo sekcie); jedlo dňa berie z nadpisu |
| `parseMealPhoto` | fotka taniera → položky | odhad gramáže z vizuálnych opôr, nižšia `confidence` |
| `parseNutritionLabel` | fotka tabuľky z obalu → hodnoty na 100 g | |
| `lookupProductByWeb` | dohľadanie produktu podľa názvu/kódu | z vedomostí modelu, nie reálny web |
| `scoreHealthBatch` | prehodnotenie zdravosti | posiela **hodnoty na 100 g**, nie len názov; pravidlo „rovnaké hodnoty = rovnaké skóre" |
| `writeDaySummary` | ranná veta | normálna aj `roast`; jedna veta o celom dni |
| `fallbackSummaryLine` / `roastFallbackLine` | keď AI zlyhá | deterministické, s konkrétnymi číslami |
| `writeFoodComment` | bublina pri pridaní jedla | vracia `{text, nickname, motif}` |
| `distillCommentStyle` | 👍/👎 → profil vkusu | max 700 znakov, bez citovania vtipov |

`openai.ts`: pri 404/400 s chybou modelu skúsi `OPENAI_FALLBACK_MODEL`; pre `gpt-5*` a `o1–o9`
posiela `max_completion_tokens` a vynechá `temperature`; timeout 45 s; kontroluje
`finish_reason === "length"` (odseknutý JSON → zrozumiteľná chyba).

Admin nástroj: `GET /api/admin/reevaluate-health` (náhľad) a `?apply=1` (zápis) – prehodnotí
zdravosť záznamov, obľúbených aj vlastných potravín.

---

## 5. Doménové pravidlá a rozhodnutia (nemeniť bez dôvodu)

Každé z týchto pravidiel vzniklo z konkrétnej sťažnosti používateľa.

### „Úplný / nekompletný deň"
- Deň je **úplný**, ak má zápis a aspoň **50 % kalorického cieľa** (`INCOMPLETE_FRACTION`
  v `badges.ts` aj v Analytike). Dnešok je zhovievavý (stačí akýkoľvek zápis).
- Analytika: nekompletné minulé dni sa **v grafe nezobrazujú** a nerátajú do priemerov ani
  mediánu; dnešok je vidieť priebežne. Kompletnosť sa posudzuje z kalórií **celého dňa**
  (`fullCalories`), aby filter „bez nápojov" neoznačil deň za nekompletný.
- Pri filtri jedla dňa sa namiesto 50 % prahu kontroluje len, či to jedlo v ten deň je.

### Série a rekordy (`badges.ts`, `coach.ts`)
- Série „bez …" (alkohol, tvrdý alkohol, sladké, pečivo) **vyžadujú úplný zápis dňa** –
  nezapísaný deň sériu **preruší** (nedá sa tvrdiť, že bol čistý). Používateľ si vybral
  „reset, ale s jasným dôvodom": stav série nesie `stop: {date, reason: "missing" | "unmet"}`
  a Profil ukáže „Chýba úplný záznam za 19. 8." namiesto „séria prerušená".
- Rovnaké pravidlo pre „Kalorický cieľ" a „Zdravé dni" (300 kcal deň nie je „v cieli").
  Výskytové série (ovocie, zelenina, šejk, voda) úplný deň nevyžadujú.
- Rekord **smie klesnúť**: okno 400 dní; ak najstarší načítaný deň leží za začiatkom
  okna (máme celú históriu), rekord sa počíta z dát; inak sa uložená hodnota drží ako spodná
  hranica. Dôvod: po presune/zmazaní záznamov alebo zmene cieľa ostával neplatný rekord.

### Rozpoznávanie (`food-tags.ts`)
Alkohol a nápoje sa poznajú regexom nad **kategóriou + podkategóriou + názvom** (pivo býva
pod „Nápoje"). Používa to séria aj filter v Analytike – **jedna definícia**. Pečivo:
kategória „Pečivo" + názvy (chlieb, rožok, bageta…), ryža/bulgur/cestoviny nie.

### Kouč
- **Osobnosť** `User.coachPersona` ∈ `nice | normal | roast`; `null` = odvodí sa zo
  staršieho `coachRoast` (`personaOf()` v `types.ts`). PATCH profilu drží `coachRoast`
  v súlade. Drsný: láskavé nadávky („ty pažravá prasnica"), hovorové „dodrbal" OK,
  hrubé vulgarizmy nie; komentuje **jedlo, nikdy telo**; nikdy nechváli hladovanie.
- **Ranné zhrnutie** (cron, okno 7–11 SK): **riadok čísel + JEDNA veta** o celom dni
  (čo zaostalo, čo sedelo, konkrétne jedlo, ktoré pokazilo deň, jedna rada na dnes).
  Používateľ výslovne nechce komentár ku každej metrike zvlášť. Ďalšie okná: kalórie
  15–18, ovocie 18–21; max jedna notifikácia za beh.
- **Bubliny pri pridaní jedla** (`/api/comment`, `food-comment.ts`):
  - spúšťače: `repeat` (to isté jedlo opäť), `lateMeal` (druhá večera), `saladAfterBinge`,
    `crossedGoal`, `junk`, `healthy`, `protein`; silné ~80–90 %, bežné 40–50 %,
    banality (espresso, voda, < 40 kcal) ~8 %; cooldown 15 min okrem najsilnejších
  - **všetko podľa jedla dňa, NIE času zápisu** – ľudia zapisujú spätne; deň sa radí
    raňajky → … → druhá večera a „predtým" = jedlá do daného jedla dňa
  - komentuje sa **len dnešok**
  - beží na pozadí po uložení; zápis jedla na komentár nečaká, chyba sa ticho zahodí
- **Učenie z 👍/👎**:
  - *kedy* – `commentStats` (počty na druh spúšťača), faktor 0,5–1,5 (Laplace), strop 95 %
  - *ako* – každých 5 hodnotení destilácia do `commentStyle` (bloky Baví ho / Nebaví ho /
    Obľúbené motívy), max 700 znakov; surové hodnotenia sa do promptu **nikdy** neposielajú
  - *originalita* – `commentLog` drží posledných 6 hlášok, 15 prezývok a 20 motívov
    (pointa v 2–4 slovách); sú zakázané, po ~20 bublinách motív vypadne a smie sa vrátiť
    v novej podobe. Používateľovi záleží na originalite najviac.
  - Profil vkusu je viditeľný v Profile („🧠 Čo ťa baví") s možnosťou zabudnúť.

### Potraviny a obľúbené
- `Food` má hodnoty na `baseGrams`. Zmena základnej gramáže v editore **prepočíta** kcal
  a makrá – vždy z pôvodného uloženého záznamu (pri písaní „5" → „52" by sa reťazenie
  faktorov zaokrúhľovaním rozsypalo).
- ☆ v Potravinách vytvorí obľúbené s jednou položkou (porcia = `baseGrams`); funguje aj pre
  globálne potraviny. Stav hviezdičky sa páruje **podľa názvu**.
- Vyhľadávanie v DB dáva navrch naposledy použité položky pre zvolené jedlo dňa.

---

## 6. Otvorené veci a nápady

**Na overenie (zo session sa nedali)**
- Reálne AI výstupy: tón bubliniek a ranných viet, destilácia profilu, rozpoznávanie
  fotky taniera, rozdeľovanie dňa na sekcie. Používateľ sľúbil poslať screenshoty.
- Karta **Hmotnosť** – používateľ ju po nasadení nevidel; kód je správne, podozrenie na
  zlyhaný deploy / `db push` (tabuľka `WeightLog`). Pridané zobrazenie chyby na karte.
  Overiť `GET /api/weight?date=…` (404 = starý build, 500 = chýba tabuľka).

**Známe obmedzenia / dlh**
- `@google/genai` v závislostiach je nepoužívaný – dá sa odstrániť.
- Obľúbené sa s potravinou párujú podľa názvu; čistejšie by bolo `Favorite.foodId`.
- Nové potraviny (sken, fotka) sa hodnotia zdravosťou po jednej, bez porovnania
  s podobnými – nekonzistencia sa môže vrátiť; riešenie: priložiť podobné ohodnotené
  potraviny ako referenciu.
- Milý a Normálny kouč majú rovnaké ranné zhrnutie (roast má vlastné).
- `page-cache` je len v RAM – po tvrdom refreshi sa vyprázdni (zámer).
- Model `Profile` je pozostatok jednopoužívateľskej verzie.

**Nápady, o ktorých sa hovorilo**
- Graf hmotnosti v Analytike (s trendovou krivkou).
- Odznaky pre „bez pečiva" (séria existuje, odznaky nie).
- Kontext dňa pre ranné zhrnutie pri Milom koučovi (vrúcnejší tón).
- Zdieľanie vydarených hlášok kouča (virálny potenciál – „osobnosť" je hlavná odlišnosť
  appky; precedens CARROT Weather / CARROT Fit).
- Prepnutie vision na Gemini kvôli cene (vyžaduje nový klient `src/lib/gemini.ts`).

---

## 7. Rýchly štart pre novú session

1. Naklonuj repo, `checkout claude/nutrition-tracker-app-mTVJ7`, `npm ci`, `npx prisma generate`.
2. Prečítaj `README.md`, tento súbor a `prisma/schema.prisma`.
3. Pred zmenou v kouči/sériách si prečítaj §5 – pravidlá tam majú konkrétne dôvody.
4. Po každej zmene: `tsc` → (`prisma validate`) → `next build` → commit s vysvetlením → push.
5. Používateľovi hláste po slovensky, stručne, s tým, čo je overené a čo nie.
