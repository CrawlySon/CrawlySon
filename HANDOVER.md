# HANDOVER – NutriAI (CrawlySon)

Dokument na plynulé pokračovanie vývoja v novej session / inom prostredí.
Stav k vrcholu vetvy `claude/nutrition-tracker-app-mTVJ7` (október 2026, ~130 commitov).

Obsah: 1 Kde je čo · 2 Ako appka funguje (obrazovky a toky) · 3 Ako sa tu pracuje ·
4 Architektúra · 5 AI · 6 Doménové pravidlá a ich dôvody · 7 Posledná práca ·
8 História vývoja · 9 Rozhodnutia, ktoré sa nemajú opakovať · 10 Otvorené veci ·
11 Rýchly štart

---

## 1. Kde je čo

| | |
|---|---|
| **Repozitár** | <https://github.com/CrawlySon/CrawlySon> (verejný – žiadne tajomstvá do kódu!) |
| **Vetva** | `claude/nutrition-tracker-app-mTVJ7` – jediná vetva, default aj produkčná |
| **Hosting** | Vercel, nasadzuje sa automaticky po pushi; build sám spraví `prisma db push` |
| **Notifikácie** | GitHub Actions `.github/workflows/reminders.yml` – každú hodinu „štuchne" `/api/cron/coach` a `/api/cron/water` (viď §4) |
| **DB** | PostgreSQL (Neon/Supabase), Prisma `db push` – **žiadne migračné súbory** |
| **AI** | výhradne **OpenAI** (default `gpt-4.1`); Gemini bolo zámerne odstránené (§9) |
| **Jazyk** | UI, komentáre v kóde aj komunikácia s používateľom: **slovenčina**; commity anglicky |
| **Používateľ** | autor appky ju denne používa na iPhone ako PWA |

```bash
git clone https://github.com/CrawlySon/CrawlySon.git
cd CrawlySon
git checkout claude/nutrition-tracker-app-mTVJ7
npm ci
npx prisma generate
```

**Kde hľadať detaily:** `README.md` (funkcie, env, nasadenie), `.env.example` (všetky
premenné s popisom), komentáre v kóde (po slovensky vysvetľujú *prečo*), a hlavne
**`git log`** – každý commit má telo s dôvodom zmeny. Pri otázke „prečo je to takto?"
pomôže `git log -S "<kus kódu>"` alebo `git log --follow <súbor>`.

---

## 2. Ako appka funguje (obrazovky a toky)

Spodné menu: **Dnes · Analytika · Potraviny · Profil**.

### Dnes (`src/app/(app)/page.tsx`)
Zhora nadol:
1. **Hlavička s dátumom** – šípky deň dozadu/dopredu, ťuknutím vlastný kalendár s bodkami
   pri dňoch so záznamom.
2. **Súhrn dňa** (`MacroSummary`) – kalorický krúžok (žltý/červený oblúk pri prekročení),
   makrá, priemerná zdravosť dňa.
3. **💧 Pitný režim** (`WaterCard`) – +250/500/750 ml, späť.
4. **⚡ Rýchle pridanie** (`QuickFavorites`) – obľúbené položky/zostavy, jedno ťuknutie = zápis.
5. **Jedlá dňa** – Raňajky, Desiata, Obed, Olovrant, Večera, Druhá večera, (Iné).
   Drag & drop medzi jedlami, ✎ úprava gramáže (prepočíta makrá), ★ uložiť ako obľúbené,
   **„✓ Vybrať položky"** → kopírovať na dnes / uložiť ako jedno jedlo.
6. **⇄ Presunúť záznamy dňa** – presun/kópia všetkých jedál dňa na iný dátum.
7. **💊 Suplementy a lieky** (`SupplementCard`) – katalóg + denné −/+ (optimistické,
   debounce), forma z výberu.
8. **😴 Spánok** (`SleepCard`) – hodnotenie 0–10.
9. **⚖️ Hmotnosť** (`WeightCard`) – jeden záznam/deň, zmena oproti minulému meraniu,
   synchronizuje `User.weightKg` (len z najnovšieho záznamu).
10. Plávajúce **„✨ Pridať jedlo"** → `AddFoodSheet`.
11. **Bublina kouča** (`CoachBubble`) – občas vyskočí po pridaní jedla, 👍/👎.

### Pridať jedlo (`src/components/AddFoodSheet.tsx`)
Hore výber jedla dňa, potom tri záložky:
- **✨ AI** – textové pole + 🎤 diktovanie → „Spracovať AI" (zvládne aj celý deň s nadpismi
  „Raňajky: … / Obed: …"); **📷 Odfotiť jedlo** → odhad z fotky taniera. Výsledkom je
  **návrh**, každá položka sa dá upraviť/zmazať, ukladá sa až tlačidlom „Pridať (n)".
- **🔍 Databáza** – vyhľadávanie (naposledy použité pre dané jedlo dňa navrchu, štítok
  „naposledy"), **▮▮ Čiarový kód** (skener s baterkou → Open Food Facts / vlastná DB → pri
  neznámom kóde dohľadanie cez AI alebo fotka tabuľky), **📸 Odfotiť tabuľku** (aj bez kódu).
- **★ Obľúbené**.

### Analytika (`src/app/(app)/history/page.tsx`)
Rozsah 7/14/30 dní alebo vlastný (dlhé obdobie → týždenná/mesačná agregácia), filter
kategórie, filter **jedla dňa**, prepínače **bez nápojov / bez alkoholu**, metriky Kalórie /
Zdravosť / Voda / Spánok, 7d medián, stĺpcový graf (farby podľa cieľa), súhrnné karty,
zoznam dní (nekompletné označené).

### Potraviny (`src/app/(app)/foods/page.tsx`)
Vyhľadávanie (všetko / moje / globálne), pridanie potraviny, **skladanie receptu zo surovín**,
☆ do rýchleho pridania, úprava vlastných potravín (zmena „Na koľko g" prepočíta hodnoty).

### Profil (`src/app/(app)/profile/page.tsx`)
Osobné údaje + výpočet TDEE, denné ciele, notifikácie (push, pravidlá pripomienok vody),
🏅 Motivačný kouč, **🎭 Osobnosť kouča** (Milý/Normálny/Drsný), 💬 Komentáre k jedlu,
**🧠 Čo ťa baví** (naučený vkus + zabudnúť), test notifikácie, **odznaky** (výzvy po 4
úrovniach), **🔥 Série a rekordy**, odhlásenie.

### Notifikácie (Web Push)
- **Ráno (7–11 SK):** zhrnutie včerajška – riadok čísel + jedna veta (pri Drsnom koučovi
  s nadpisom „🐷 Včerajšie žrádlo").
- **Poobede (15–18):** blížiš sa ku kalorickému cieľu / si nad ním.
- **Večer (18–21):** ešte žiadne ovocie.
- Kedykoľvek: nový odznak (najvyššia priorita). Max jedna notifikácia za beh, deduplikácia
  cez `User.coachState`.
- Voda: pravidlá „do hodiny H aspoň X ml" (`User.waterReminders`).

---

## 3. Ako sa tu pracuje

### Prostredie session
- Session typicky **nemá** `DATABASE_URL` ani `OPENAI_API_KEY` → appka sa nedá spustiť
  s dátami a AI sa nedá zavolať. Overuje sa staticky a testami čistých funkcií.
  **Vždy povedz používateľovi, čo overené je a čo nie** (AI výstupy).
- Po resete kontajnera býva pracovný adresár prázdny → `git fetch origin
  claude/nutrition-tracker-app-mTVJ7 && git checkout -B claude/nutrition-tracker-app-mTVJ7
  origin/claude/nutrition-tracker-app-mTVJ7 && npm ci`.

### Overenie pred každým commitom
```bash
npx tsc --noEmit -p tsconfig.json                                      # 0 chýb
DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma validate  # pri zmene schémy
SKIP_ENV_VALIDATION=1 npx next build                                   # musí prejsť
```

### Testovanie logiky
Logika sa zámerne píše ako **čisté funkcie bez DB** (`badges.ts`, `food-comment.ts`,
`food-tags.ts`, `fallbackSummaryLine` v `ai.ts`), aby sa dala overiť ad-hoc skriptom:
```bash
mkdir -p .tmp-test && cat > .tmp-test/x.test.ts <<'EOF'
import { commentTriggers } from "../src/lib/food-comment";
// … scenáre + console.log
EOF
npx tsx .tmp-test/x.test.ts; rm -rf .tmp-test
```
Testovací framework v projekte nie je; `.tmp-test/` sa necommituje. Osvedčilo sa testovať
presne scenár zo screenshotu používateľa a pravdepodobnosti odhadnúť z ~2000 pokusov.

### Schéma – POZOR
Build spúšťa `prisma db push --skip-generate` **bez** `--accept-data-loss`.
- Pridávať polia/modely: áno (nullable alebo s defaultom).
- Mazať/premenovávať stĺpce s dátami: **nie** – build na Verceli zlyhá. Príklad:
  `User.coachRoast` je nahradený `coachPersona`, ale v schéme ostáva a drží sa v súlade.

### Gotchy, na ktoré sa už narazilo
- Slovenské úvodzovky `„…"` v JS reťazci ohraničenom `"` – uzatváracia `"` reťazec
  ukončí. V takých reťazcoch používaj `“` alebo jednoduché úvodzovky okolo reťazca.
- `Json` polia Prismy sú typovo voľné – `tsc` neodhalí, keď uložíš objekt namiesto textu.
- Klient počíta dátum lokálne (`todayISO()`), server v Europe/Bratislava (`skToday()`).

### Git konvencie
- Commit: anglicky, conventional (`feat(scope):`, `fix(scope):`…), **telo vysvetľuje prečo**.
  Na konci attribution riadky podľa prostredia.
- Push: `git push -u origin HEAD:claude/nutrition-tracker-app-mTVJ7`. **PR len na požiadanie.**

### Ako komunikuje používateľ
- Píše po slovensky, posiela **screenshoty z iPhonu** s popisom problému.
- Často chce najprv **návrhy / príklady** („daj mi príklady, aby som vedel, či sme sa
  pochopili") a až potom „postav to". Keď si nie si istý, ukáž konkrétne varianty.
- Pri bugu chce vysvetlenie **príčiny**, nielen opravu. Oceňuje úprimnosť a nadhľad
  (napr. „tvoje zadanie by ten omyl neopravilo – myslel si presun?").
- Píše počas behu práce doplňujúce správy – zohľadni ich v rozpracovanej úlohe.

---

## 4. Architektúra

```
src/app/(app)/page.tsx          Dnes
src/app/(app)/history/page.tsx  Analytika
src/app/(app)/foods/page.tsx    Potraviny
src/app/(app)/profile/page.tsx  Profil (+ TasteProfile, StreaksSection, BadgesSection)
src/components/                 AddFoodSheet, CoachBubble, QuickFavorites, WaterCard,
                                SleepCard, WeightCard, SupplementCard, MoveDaySheet,
                                MacroSummary, CalendarPopup, BarcodeScanner, BottomNav, Toaster
src/lib/ai.ts                   VŠETKY prompty a AI funkcie
src/lib/openai.ts               HTTP klient OpenAI
src/lib/coach.ts                kontext dňa (DailyStat), rekordy sérií, podklady zhrnutia,
                                skToday()/skHour()
src/lib/badges.ts               katalóg odznakov a sérií (čisté funkcie)
src/lib/food-comment.ts         kedy komentovať + učenie z 👍/👎 (čisté funkcie)
src/lib/food-tags.ts            alkohol / tvrdý alkohol / nápoje (zdieľané)
src/lib/nutrition.ts            TDEE, súčty, zaokrúhľovanie
src/lib/page-cache.ts           in-memory cache stránok (stale-while-revalidate)
src/lib/auth.ts, server-auth.ts session cookie, getUserId()
src/middleware.ts               auth; /api/cron/* je verejné, chránené CRON_SECRET
```

**API** (`src/app/api/…`): `parse`, `parse/photo`, `entries` (+`[id]`, `move`), `foods`,
`favorites` (+`log`), `history`, `water`, `sleep`, `weight`, `supplements` (+`log`),
`barcode` (+`ai`, `photo`), `comment` (+`feedback`), `badges`, `calendar`, `profile`,
`push/*`, `cron/coach`, `cron/water`, `admin/reevaluate-health`, `usage`, `seed`, `auth/*`.

**Plánovač:** hlavný je GitHub Actions (`reminders.yml`, každú celú hodinu UTC, vyžaduje
repo secrets `APP_URL` a `CRON_SECRET`). Endpointy si samy vyberú okno v SK čase a
deduplikujú. `vercel.json` obsahuje aj Vercel crony (Hobby: raz denne, nepresný čas) –
sú len záloha.

**Dátový model:** `User` (profil, ciele, nastavenia kouča, `coachState`, `commentLog`,
`commentStyle`, `commentStats`) · `Entry` (`mealType`, `category`, `subcategory`,
`healthIndex`, `source`) · `Food` (hodnoty na `baseGrams`; `userId null` = zdieľaná) ·
`Favorite` (`items` JSON) · `WaterLog` · `SleepLog` (0–10) · `WeightLog` · `Supplement` +
`SupplementLog` · `Achievement` · `StreakRecord` · `CommentFeedback` · `PushSubscription` ·
`AiUsage` · `Profile` (pozostatok, nepoužívaný).

**Typy jedál:** `breakfast, snack (desiata), lunch, afternoon (olovrant), dinner,
supper (druhá večera), other`. Poradie je dôležité pre kouča (§6).

---

## 5. AI (`src/lib/ai.ts`, `src/lib/openai.ts`)

| Funkcia | Použitie | Pozn. |
|---|---|---|
| `parseFood` | text/hlas → položky | delí vstup podľa nadpisov jedál, **každá sekcia samostatne a paralelne**; jedlo dňa z nadpisu; ak sekcia zlyhá, ostatné prejdú + varovanie |
| `parseMealPhoto` | fotka taniera → položky | gramáž z vizuálnych opôr (tanier, príbor), nižšia `confidence` |
| `parseNutritionLabel` | fotka tabuľky → hodnoty na 100 g | |
| `lookupProductByWeb` | produkt podľa názvu/kódu | z vedomostí modelu |
| `scoreHealthBatch` | prehodnotenie zdravosti | **hodnoty na 100 g**, rovnaké hodnoty = rovnaké skóre |
| `writeDaySummary` | ranná veta | normálna / roast; vyhýba sa nedávnym prezývkam |
| `fallbackSummaryLine`, `roastFallbackLine` | keď AI zlyhá | deterministické, s číslami |
| `writeFoodComment` | bublina | `{text, nickname, motif}` |
| `distillCommentStyle` | 👍/👎 → profil vkusu | max 700 znakov, bez citácie vtipov |

`openai.ts`: pri 404/400 s chybou modelu skúsi `OPENAI_FALLBACK_MODEL`; pre `gpt-5*` a
`o1–o9` posiela `max_completion_tokens` bez `temperature` (prepnutie modelu = len env);
timeout 45 s; `finish_reason === "length"` → zrozumiteľná chyba namiesto „neplatný JSON".

Rubrika zdravosti (0–10) je v `SYSTEM_INSTRUCTION` aj `HEALTH_RUBRIC`: 9–10 ovocie/zelenina/
ryby; 7–8 celozrnné, vajcia, biele mäso, neslazené mliečne; 5–6 prílohy, syry; 3–4 biele
pečivo, údeniny, vyprážané, sladené nápoje a ochutené mliečne (proteínové +1); 0–2 fast food,
sladkosti, alkohol. Admin: `GET /api/admin/reevaluate-health` (náhľad), `?apply=1` (zápis).

---

## 6. Doménové pravidlá a ich dôvody

Každé pravidlo vzniklo z konkrétnej sťažnosti používateľa – nemeniť bez dôvodu.

### „Úplný / nekompletný deň"
- Úplný = zápis + aspoň **50 % kalorického cieľa** (`INCOMPLETE_FRACTION` v `badges.ts`
  aj Analytike). Dnešok je zhovievavý.
- Analytika: nekompletné minulé dni sa v grafe nezobrazujú a nerátajú do priemerov ani
  mediánu; dnešok je vidieť priebežne. Kompletnosť z kalórií **celého dňa** (`fullCalories`),
  aby filter „bez nápojov" nezmenil, ktoré dni sa počítajú. Priemer vody len z dní s vodou.
- Pri filtri jedla dňa sa kontroluje len, či to jedlo v ten deň existuje.

### Série a rekordy
- Série „bez …" (alkohol, tvrdý alkohol, sladké, pečivo) **vyžadujú úplný zápis dňa** –
  nezapísaný deň sériu preruší. Používateľ zvolil „reset, ale s jasným dôvodom": stav nesie
  `stop: {date, reason: "missing" | "unmet"}`, Profil ukáže „Chýba úplný záznam za 19. 8.".
  (Pôvodne sa nezapísané dni rátali ako čisté – používateľ to odmietol.)
- To isté pre „Kalorický cieľ" a „Zdravé dni". Výskytové série (ovocie, zelenina, šejk,
  voda) úplný deň nevyžadujú.
- „Zápis jedál" počíta len úplné dni. „Proteínový šejk" sa nespúšťa na tyčinky/jogurty/mlieko.
- Rekord **smie klesnúť**: okno 400 dní; ak najstarší načítaný deň je za začiatkom okna
  (celá história), rekord sa počíta z dát, inak sa uložená hodnota drží ako spodná hranica.

### Rozpoznávanie (`food-tags.ts`)
Alkohol a nápoje regexom nad **kategóriou + podkategóriou + názvom** (pivo býva pod
„Nápoje"); používa séria aj filter Analytiky. Pečivo: kategória „Pečivo" + názvy.

### Kouč
- **Osobnosť** `coachPersona` ∈ `nice | normal | roast`; `null` → odvodí sa z `coachRoast`
  (`personaOf()` v `types.ts`). Drsný: láskavé nadávky, hovorové „dodrbal" OK, hrubé
  vulgarizmy nie; **komentuje jedlo, nikdy telo**; nikdy nechváli hladovanie.
- **Ranné zhrnutie**: riadok čísel + **jedna veta o celom dni** (čo zaostalo, čo sedelo,
  konkrétne jedlo, ktoré deň pokazilo, s kcal, jedna rada). Používateľ výslovne nechce
  komentár ku každej metrike zvlášť ani výpis bez čísel – trvalo tri iterácie, kým sme
  sa pochopili (vybral štýl „fokus + vinník + rada").
- **Bubliny pri pridaní jedla** (`/api/comment` + `food-comment.ts`):
  - spúšťače `repeat`, `lateMeal` (druhá večera), `saladAfterBinge`, `crossedGoal`, `junk`,
    `healthy`, `protein`; silné ~80–90 %, bežné 40–50 %, banality (espresso, voda,
    < 40 kcal) ~8 %; cooldown 15 min okrem najsilnejších
  - **podľa jedla dňa, NIE času zápisu** – používateľ zapisuje spätne („ranná káva zapísaná
    večer je raňajková"); „predtým" = jedlá do daného jedla dňa
  - len dnešok; beží na pozadí po uložení, chyba sa ticho zahodí
- **Učenie z 👍/👎**: *kedy* – `commentStats`, faktor 0,5–1,5, strop 95 %; *ako* – každých
  5 hodnotení destilácia do `commentStyle` (Baví ho / Nebaví ho / Obľúbené motívy), surové
  hodnotenia sa do promptu nikdy neposielajú; *originalita* – `commentLog` drží 6 hlášok,
  15 prezývok, 20 motívov ako zákaz, po ~20 bublinách motív vypadne. **Originalita je
  používateľovi najdôležitejšia.**

### Potraviny a obľúbené
- Zmena `baseGrams` v editore prepočíta hodnoty **z pôvodného záznamu** (pri písaní cez
  medzistavy by sa reťazenie faktorov rozsypalo).
- ☆ v Potravinách = obľúbené s jednou položkou (porcia = `baseGrams`), aj pre globálne
  potraviny; párovanie hviezdičky **podľa názvu**.

---

## 7. Posledná práca (september – október 2026)

Posledný blok sa venoval **„osobnosti" appky**. Používateľ prišiel s myšlienkou, že
nutričných appiek je veľa, ale žiadna si zo stravovania nerobí vtipnú srandu cez LLM –
a že to môže byť hlavná odlišnosť. Postupne vzniklo:
1. Ranné zhrnutie z reálnych dát → ladenie tvaru vety (3 iterácie).
2. Drsný (roast) mód zhrnutia → zovšeobecnený na osobnosť Milý/Normálny/Drsný.
3. Bubliny pri pridaní jedla s rozumnou náhodnosťou.
4. Oprava: kontext podľa jedla dňa, nie času zápisu.
5. 👍/👎 a učenie vkusu; doplnok o originalite (prezývky a motívy).
6. Zobrazenie naučeného vkusu v Profile.

**Stav:** všetko nasadené, typy a build overené, logika otestovaná scenármi. **Neoverené:**
reálne výstupy AI (tón, originalita, destilácia) – používateľ sľúbil screenshoty prvých
bublín. Ďalší logický krok je ladenie podľa nich.

Predtým (august–september): fotka taniera, hviezdičky v Potravinách, prepočet gramáže,
oprava zdravosti podľa hodnôt na 100 g, prechod na `gpt-4.1`, spracovanie dňa po sekciách,
série vyžadujúce úplný zápis, hmotnosť, séria bez pečiva, filtre Analytiky.

---

## 8. História vývoja (fázy)

| Obdobie | Čo vzniklo |
|---|---|
| jún 2026 | základ: AI z textu, denník po jedlách, DB potravín, multi-user, voda, drag&drop, graf, skener kódov, obľúbené, push notifikácie, odznaky, kouč, série |
| jún–júl | ladenie AI (fallbacky, zdravostná rubrika), fotka tabuľky, analytika (vlastný rozsah, medián), suplementy, spánok, baterka |
| 22. 7. | **prechod z Gemini na OpenAI** ako jediný engine |
| júl–august | nekompletné dni v analytike, výber položiek, presun dňa, filtre jedla dňa a nápojov/alkoholu, opravy sérií a rekordov, hmotnosť |
| september | fotka taniera, ☆ v Potravinách, prepočet `baseGrams` |
| október | osobnosť kouča, bubliny, učenie z 👍/👎, profil vkusu, dokumentácia |

Kompletný zoznam: `git log --reverse --format='%ad %s' --date=short`.

---

## 9. Rozhodnutia, ktoré sa nemajú opakovať bez opýtania

- **Neumorphism dizajn** (18. 7.) sa skúsil a o dva dni bol **revertnutý** – používateľovi
  nesedel. Neskôr naň padla ešte otázka a používateľ ju zamietol. Neponúkať znova.
- **Gemini** bolo 22. 7. zámerne odstránené (spoľahlivosť). Používateľ neskôr spomenul,
  že má prístup aj ku Gemini modelom (vrátane obrazových) – návrh prepnúť vision na Gemini
  kvôli cene je otvorený, ale nie rozhodnutý. `@google/genai` v závislostiach je zvyšok.
- **„Mini" modely** (`gpt-4o-mini`) vynechávali položky z dlhých zoznamov – preto `gpt-4.1`.
- Spánok bol pôvodne 1–10, zmenený na **0–10**.
- Kouč nesmie komentovať telo ani chváliť hladovanie (aj v drsnom móde).

---

## 10. Otvorené veci

**Na overenie**
- Reálne AI výstupy kouča a fotky taniera (screenshoty od používateľa).
- Karta **Hmotnosť** – používateľ ju po nasadení nevidel; kód je v poriadku, podozrenie na
  zlyhaný deploy / `db push` tabuľky `WeightLog`. Na karte sa teraz zobrazí chyba.
  Overiť `GET /api/weight?date=…` (404 = starý build, 500 = chýba tabuľka).
- GitHub Actions secrets `APP_URL` a `CRON_SECRET` – bez nich hodinové pripomienky nebežia.

**Dlh / obmedzenia**
- `@google/genai` nepoužívaný – ostal zámerne, aby sa pri deployi nerozišiel `package-lock.json`;
  pri odstránení treba spraviť `npm uninstall @google/genai` a commitnúť aj lockfile.
- `Profile` model nepoužívaný.
- Obľúbené párované s potravinou podľa názvu (lepšie `Favorite.foodId`).
- Nové potraviny (sken, fotka) sa hodnotia zdravosťou po jednej – nekonzistencia sa môže
  vrátiť; riešenie: priložiť podobné ohodnotené potraviny ako referenciu.
- Milý a Normálny kouč majú rovnaké ranné zhrnutie.
- `page-cache` len v RAM (zámer).

**Nápady**
- Graf hmotnosti v Analytike s trendom.
- Odznaky „bez pečiva" (séria existuje).
- Zdieľanie vydarených hlášok kouča (osobnosť = hlavná odlišnosť appky; precedens
  CARROT Weather / CARROT Fit).
- Vision cez Gemini kvôli cene (nový klient `src/lib/gemini.ts`).

---

## 11. Rýchly štart pre novú session

1. Klon, `checkout claude/nutrition-tracker-app-mTVJ7`, `npm ci`, `npx prisma generate`.
2. Prečítaj tento súbor, `README.md`, `prisma/schema.prisma`, a pri práci na kouči
   `src/lib/food-comment.ts` + koniec `src/lib/ai.ts`.
3. Pred zmenou v kouči/sériách/analytike si prečítaj §6 a §9.
4. Po každej zmene: `tsc` → (`prisma validate`) → `next build` → commit s dôvodom → push.
5. Hlás po slovensky, stručne, s jasným rozlíšením overené / neoverené.
