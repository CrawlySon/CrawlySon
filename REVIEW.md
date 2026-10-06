# REVIEW – NutriAI → „Rypák“ (október 2026)

Komplexná review appky a návrh, ako z nej spraviť serióznejší produkt postavený
okolo kouča s osobnosťou a maskota. Stav k commitu `80b12c2` na vetve
`claude/nutrition-tracker-app-mTVJ7`. Zatiaľ **nič sa nemení** – toto je podklad
na rozhodnutie, kam ísť.

Vizuálne návrhy (3 smery dizajnu + maskot) sú na plátne:
<https://claude.ai/artifact/J8dzEzbEQePz1nbPBouBxG>

---

## 0. Zhrnutie na jednu obrazovku

**Čo appka je dnes:** veľmi slušný osobný nutričný denník (AI zápis textom /
hlasom / fotkou / kódom, voda, spánok, hmotnosť, suplementy, analytika,
odznaky, série) s **nedávno prilepeným** koučom s osobnosťou. Kód je čitateľný,
doménová logika je rozumne oddelená do čistých funkcií, história commitov
(132 commitov od júna 2026) ukazuje disciplínu. Ale appka vznikala prilepovaním –
dizajn je generický „zelený health tracker“, kouč je jedna plávajúca bublina
a emoji, a viacpoužívateľský režim je funkčný, no nie pripravený na cudzích ľudí.

**Kam ísť:** otočiť hierarchiu. Dnes je appka *denník, ktorý má kouča*. Má byť
*postava (prasa Rypák), ktorá vedie denník*. Maskot a jeho výraz sú stred
obrazovky „Dnes“, kouč má 4 úrovne (milý → bez servítky), hlášky sa dajú zdieľať.
Dáta a funkcie zostávajú – mení sa, kto je hlavný hrdina.

**Čo treba spraviť skôr, než sa čokoľvek prerába (Fáza 0):**
1. **Záloha produkčnej DB** a skúšobná obnova – kým nie je overená, nič sa nemení.
2. Prechod z `prisma db push` na **`prisma migrate`** (história migrácií, žiadne
   prekvapenia pri builde).
3. Tri bezpečnostné diery, ktoré pri viacerých používateľoch bolia:
   cron endpointy bez tajomstva **prepúšťajú** (fail-open), `/api/seed` nemá
   kontrolu admina, ktokoľvek zapisuje do **zdieľanej** tabuľky potravín cez
   `/api/barcode/ai`.
4. **Limity na AI** na používateľa (dnes neobmedzené, platíš ty).
5. Next.js 14.2.18 → 14.2.35 (bezpečnostná oprava middleware, CVE-2025-29927).
6. Tri **potvrdené chyby v klientovi**, ktoré vidíš už dnes: Analytika je
   posunutá o deň dozadu (v grafe chýba dnešok), „Dnes“ sa po polnoci
   nepreklopí (ranný zápis ide do včerajška) a odhlásenie nechá dáta aj push
   odber ďalšiemu používateľovi na tom istom zariadení (§5.2).

**Rozhodnutia (potvrdené používateľom 6. 10. 2026):**
- Názov appky aj maskota: **Rypák** (rypák = prasací ňufák, a zároveň „rýpať
  do niekoho“). Úrovne kouča: Pašík · Suchár · Rypák · Rypák bez servítky.
- Smer dizajnu: **A „Mäsiarstvo“** (§4.2); tmavý režim ako „čierna tabuľa“.
- Pravidlá 4. úrovne kouča (§3.4) platia **tak, ako sú navrhnuté**.
- Tento dokument je súčasťou repa ako pokračovanie HANDOVER.md.

---

## 1. Zadanie a čo sme si ujasnili

Z tvojho zadania a odpovedí na otázky:

| Téma | Rozhodnutie |
|---|---|
| Používatelia | **Uzavretá teraz (ty + známi), ale pripravená na verejnú.** Architektúra sa robí tak, aby sa dala otvoriť. |
| Hranice kouča | **Aj váha a telo, ale ako voliteľný 4. stupeň**, ktorý si používateľ zapne sám. Nižšie stupne ostávajú „komentuje jedlo, nie telo“. |
| Maskot | **Prasiatko, kreslený vektor (SVG)** – navrhujem ja; viac výrazov, animovateľné, bez externých obrázkov. |
| Databáza | **Supabase + Vercel.** Zálohu spravím ja – postup v §7 (potrebujem k tomu `DATABASE_URL` lokálne v `.env`, nie do chatu). |
| Dáta | **Nič sa nemaže.** Pri každej zmene schémy: záloha → test na kópii → až potom produkcia. |

---

## 2. Čo je dnes dobré (a čo zachovať)

- **Doménové pravidlá sú premyslené a zdokumentované** (HANDOVER §5): úplný deň
  = 50 % cieľa, série „bez…“ vyžadujú zápis, rekord smie klesnúť, kouč súdi podľa
  jedla dňa a nie podľa času zápisu. Toto je know-how, ktoré by si inde dlho
  ladil – prenáša sa 1:1.
- **Čisté funkcie bez DB** (`badges.ts`, `food-comment.ts`, `food-tags.ts`,
  časti `ai.ts`) – ideálny základ pre testy (dnes ich niet, pozri §5).
- **AI vrstva je rozumne izolovaná**: jeden klient (`openai.ts`) s fallbackom
  modelu, všetky prompty na jednom mieste (`ai.ts`), parsovanie po sekciách,
  kontrola odseknutého JSON-u, deterministické záložné vety.
- **Učenie z 👍/👎 je dobre navrhnuté**: surové hodnotenia sa do promptu
  neposielajú, profil vkusu je destilát s pevným stropom, originalita cez
  `commentLog` (hlášky, prezývky, motívy). Toto je jadro budúcej „osobnosti“.
- **Oddelenie dát medzi používateľmi je správne**: audit 40 API route nenašiel
  ani jeden prípad, kde by sa dalo čítať alebo meniť cudzie záznamy (IDOR).
  Profil má whitelist polí, heslá sú scrypt + constant-time porovnanie, cookie
  httpOnly + SameSite=Lax, session secret fail-closed.
- **PWA základy**: manifest, service worker, Web Push, safe-area, cache stránok v RAM.
- **Git disciplína**: conventional commits s vysvetlením „prečo“.

---

## 3. Produkt: od denníka k postave

### 3.1 Pozicionovanie

Trh nutričných trackerov je plný (MyFitnessPal, Yazio, Lifesum, Cronometer).
Všetky sú *nástroje*. Nikto z nich nemá **osobnosť**. Precedensy, že osobnosť
predáva: CARROT Weather / CARROT Fit (sarkastická AI), Duolingo (pasívne-agresívna
sova – jej notifikácie sa stali memom a marketingom zadarmo), Finch (maskot ako
spoločník). Tvoja odlišnosť teda nie je „ďalší tracker“, ale **„prasa, ktoré ti
vytmaví makovník“**. Všetko ostatné (voda, spánok, analytika) je podpora tejto
hlavnej veci, nie naopak.

### 3.2 Názov a maskot

| Návrh | Prečo | Riziko |
|---|---|---|
| **Rypák** (odporúčam) | rypák = ňufák prasaťa; „rýpať do niekoho“ = presne to, čo kouč robí. Krátke, slovenské, pamätateľné, funguje ako meno maskota aj appky. | Mimo SK/CZ nezrozumiteľné (teraz nevadí). |
| Pašík | milé, roztomilé – sedí k 1. úrovni kouča | protirečí „fat shame“ charakteru; skôr meno pre milý režim |
| Bachor | vtipné, priame („bachor“ = brucho) | hrubšie, menej univerzálne |
| NutriAI (ponechať) | nič netreba meniť | generické, znie ako tisíc iných „AI“ appiek, nič nehovorí o postave |

Odporúčanie: appka **Rypák**, maskot **Rypák**, úrovne kouča môžu mať vlastné
mená (Pašík · Suchár · Rypák · Rypák bez servítky). Doménu (napr. `rypak.app`)
treba overiť.

### 3.3 Maskot ako systém, nie obrázok

Dnes: emoji 🐷/🥰/🤨 v `CoachBubble.tsx:51`. Návrh:

- **Jeden SVG komponent `<Pig mood size />`** – spoločné telo (hlava, uši, rypák,
  líca), vymeniteľné oči / obočie / ústa. Na plátne je 7 nálad:
  *spokojný, podozrievavý, znechutený, šokovaný, hrdý, spí, bez servítky*.
- **Nálada sa počíta deterministicky z čísel dňa** (nová čistá funkcia
  `lib/mood.ts` nad `DailyStat` + hmotnostným trendom), **AI nie je potrebná** –
  výraz je okamžitý, zadarmo a testovateľný. AI píše len text.
- **Kde maskot žije:**
  - *hero karta na „Dnes“* – veľký Rypák s náladou a poslednou hláškou
    (nahrádza dnešný anonymný `MacroSummary` ako prvý prvok obrazovky),
  - *bublina pri pridaní jedla* (dnešný `CoachBubble`, ale s postavou a animáciou
    – pokrútenie hlavy pri roastе, žmurknutie pri pochvale),
  - *push notifikácie* – ikona notifikácie podľa nálady (PNG generované
    skriptom ako dnes `scripts/gen-icons.mjs`),
  - *onboarding* – výber úrovne kouča = výber, ako sa k tebe Rypák bude správať,
  - *prázdne stavy, odznaky, prihlásenie*.
- **Animácie**: idle dýchanie, žmurkanie, krátke „otrasenie“ pri šoku – CSS,
  bez knižníc. Rešpektovať `prefers-reduced-motion`.

### 3.4 Kouč: 4 úrovne a pravidlá 4. úrovne

Dnes `coachPersona ∈ nice | normal | roast` (+ zastarané `coachRoast`). Návrh
pridať `coachLevel` 1–4 (aditívne, staré polia ostávajú):

| Úroveň | Meno | Čo smie | Príklad |
|---|---|---|---|
| 1 | Pašík (milý) | povzbudzuje, pošťuchne | „Brokolica k večeri? Tvoje telo ti práve posiela srdiečko.“ |
| 2 | Suchár (normálny) | irónia bez urážok | „Tretia klobása dnes – rozhodol si sa stať údeninou?“ |
| 3 | Rypák (drsný) | láskavé nadávky, **len jedlo** (dnešný roast) | „Šalát po 2 000 kcal, ty bravček, to je ako umyť si ruky po bitke.“ |
| 4 | Rypák bez servítky | **aj váha, trend a telo** – opt-in | „+1,4 kg za mesiac a k tomu makovník. Rypák si nevymýšľa, len číta tvoju váhu.“ |

**Pravidlá 4. úrovne (navrhujem, potvrď alebo uprav):**

1. **Výslovný opt-in** s vysvetlením a potvrdením („Áno, chcem, aby Rypák
   komentoval aj moju váhu“) + čestné vyhlásenie 18+. Uloží sa čas súhlasu
   (`fatShameConsentAt`). Dá sa kedykoľvek vypnúť jedným ťuknutím.
2. **Pracuje len s dátami z appky** – zapísaná hmotnosť, trend za 7/30 dní,
   BMI z profilu, čísla dňa. Nikdy nevymýšľa čísla, nikdy nehodnotí vzhľad,
   ktorý nevidí.
3. **Nikdy nechváli hladovanie ani extrémne malé jedenie.** Pri dni pod 50 %
   kalorického cieľa (alebo < 1 000 kcal) sa 4. úroveň **automaticky stlmí na 3.**
   a „úspech“ nekomentuje. Žiadne medicínske rady, žiadne diéty, nič o poruchách
   príjmu potravy.
4. **Pri cieli „priberať“** (`goalType = gain`) sa 4. úroveň správa ako 3. –
   fat shame tam nedáva zmysel.
5. **Pri klesajúcom trende a splnenom cieli** je to pochvala s rýpnutím, nie
   urážka („−2 kg za mesiac… a aj tak si dal punč. Ale dobre, Rypák uznáva.“).
6. **Tlačidlo „Dnes ma nechaj“** – stlmí komentáre na 24 h. 👎 funguje ako
   doteraz; 3× 👎 za týždeň na 4. úrovni → appka sama ponúkne zníženie úrovne.
7. **Nikdy neporovnáva s inými ľuďmi**, nekomentuje cudzie telá, nepoužíva
   hrubé vulgarizmy (ako dnes).
8. **Keď model odmietne** (OpenAI môže pri „fat shame“ odmietnuť častejšie),
   nasadí sa deterministická záložná veta s číslami – ako dnes `roastFallbackLine`.
   Pri nasadení treba reálne otestovať mieru odmietnutí a tón; zo session sa to
   overiť nedá.

Prečo takto: humor funguje, keď je *o jedle a číslach* a používateľ ho má pod
kontrolou. Bez pravidiel 3–5 by appka mohla reálne ublížiť (hladovanie ako
„úspech“) a pri otvorení verejnosti je to aj právne riziko.

### 3.5 Nové spúšťače a formáty kouča

Dnes: `repeat, lateMeal, saladAfterBinge, crossedGoal, junk, healthy, protein`
(`food-comment.ts`), ranné zhrnutie, poobedné kalórie, večerné ovocie.

Pridať (všetko ako čisté funkcie, testovateľné):
- `alcohol` / `hardAlcohol` – punč k obedu, tretie pivo (`food-tags.ts` už to vie rozpoznať),
- `sweetsCount` – druhé/tretie sladké dňa (makovník!),
- `weightTrend` – len 4. úroveň: +X kg za 30 dní, pridané pri sladkom/junk,
- `noVegStreak` – 3. deň bez zeleniny,
- `weekendPattern` – sobota/nedeľa systematicky +30 % (z histórie),
- `streakBroken` / `streakRecord` – zlom alebo rekord série.

Nové formáty:
- **Ambientná hláška pri otvorení** (hero karta) – nie len pri pridaní jedla.
  Jedna veta k stavu dňa, 1× za pár hodín, bez AI (šablóny) alebo s AI
  pri výrazných dňoch.
- **Týždenný „Rypákov výkaz“** (nedeľa večer) – 3 čísla + verdikt + najlepšia
  hláška týždňa. Ako push aj ako **zdieľateľná karta** (obrázok) – toto je
  virálny kanál appky (CARROT a Duolingo žijú zo screenshotov).
- **Sieň slávy** – hlášky s 👍 sa ukladajú (nový model `CoachLine`), v Profile
  je zoznam najlepších, dajú sa zdieľať. Dnes sa hlášky držia len v JSON
  `commentLog` a po 6 ďalších zmiznú.

---

## 4. Dizajn

### 4.1 Súčasný stav (z kódu a `design/*.png`)

- Generický „health“ vzhľad: `slate` + `brand` zelená (`tailwind.config.ts`),
  systémový font, biele karty. Nič v ňom nehovorí „prasa, humor“.
- **Len svetlý režim** (`globals.css: color-scheme: light`), žiadne dizajnové
  tokeny – farby sú natvrdo v triedach (`bg-brand-600`, `text-slate-400`…) v 14
  komponentoch a 4 stránkach. Tmavý režim by dnes znamenal prejsť každý súbor.
- **Emoji ako ikony** (`BottomNav.tsx`, karty, tlačidlá): na iOS, Androide
  a Windows vyzerajú inak, nedajú sa farbiť, nesedia k značke.
- Kouč je prilepený: `CoachBubble` je plávajúci box nad FAB tlačidlom, maskot je
  emoji, žiadna stála prítomnosť na obrazovke.
- `viewport: userScalable: false, maximumScale: 1` – blokuje zoom (prístupnosť);
  pri PWA sa to zvykne robiť kvôli dvojkliku, ale lepšie riešiť cez
  `touch-action: manipulation`.
- Komponentové triedy `.card/.btn/.input` v `globals.css` sú dobrý zárodok
  systému, ale používajú sa nedôsledne (veľa ad-hoc tried priamo v JSX).

### 4.2 Tri smery (na plátne)

| | A · Mäsiarstvo | B · Nočná smena | C · Pašík |
|---|---|---|---|
| Nálada | retro mäsiarstvo / baliaci papier, pečiatky „ZATIAĽ V LIMITE“, tvrdé tiene | tmavý režim, neónová ružová, herný „ring“ | mäkký, svetlý, zaoblený; maskot ako spoločník |
| Farby | krémová #F6EEDC, tuš #1B1A17, prasacia ružová #F2A3B3, kečup #C8322B, horčica #E0A526 | #0E0B12, #FF4F9A, limetka #C3F73A | #FFF6F8, #E85D86, mäta #3FBF8F, jantár #E8A73A |
| Písmo | Archivo Black + Archivo | Space Grotesk | Nunito |
| Silné stránky | **najvýraznejšia identita**, humor je už vo vizuále (prasa = mäso = výčitka), pečiatky ako „verdikt“ kouča sú skvelý nosič hlášok | moderné, OLED-friendly, dobre vyzerá na screenshotoch | najčitateľnejšie pre denné používanie, najbližšie k tomu, čo ľudia čakajú od appky |
| Slabé stránky | krémová + tvrdé okraje treba robiť disciplinovane, inak pôsobí „hipstersky“; tmavý režim = „tabuľa s kriedou“ | tmavé čísla sa cez deň horšie čítajú, pôsobí ako hra | zameniteľné s Finch/Duolingo pastelmi, menej odvahy |

**Odporúčanie: A ako značka, vykonané čisto a moderne** (veľa vzduchu, jasná
hierarchia čísel, pečiatky striedmo), **s tmavým režimom ako „čierna tabuľa“**
vo Fáze 1. Ak sa ti A zdá priveľa, **C** je bezpečná voľba a maskot unesie
osobnosť sám. B by som nechal ako voliteľnú tému neskôr, nie ako základ.

### 4.3 Dizajnový systém (bez ohľadu na smer)

- **Tokeny v CSS premenných** (`--bg, --surface, --ink, --muted, --pig,
  --pig-deep, --good, --warn, --bad, --radius…`), Tailwind ich mapuje
  (`colors: { ink: "var(--ink)" }`). Svetlý/tmavý režim = prepnutie premenných
  (`prefers-color-scheme` + ručný prepínač v Profile).
- **Písma cez `next/font/google`** – self-hostované pri builde, funguje offline
  v PWA, žiadny externý request.
- **Ikony: `lucide-react`** namiesto emoji (tree-shaking, farbiteľné, konzistentné).
  Emoji ostávajú len v texte kouča.
- **Základné komponenty** (nové `src/components/ui/`): `Card`, `Button`, `Chip`
  / `Stamp`, `Stat`, `ProgressBar`, `Sheet` (spodný panel s focus-trapom
  a Escape), `Toast`, `Pig`, `SpeechBubble`. Dnešné karty a sheety sa postupne
  prepíšu na ne.
- **Typografia čísel**: tabulárne číslice (`font-variant-numeric: tabular-nums`),
  jedna veľkosť pre kcal, jedna pre makrá – dnes sa veľkosti rôznia.
- **Prístupnosť**: kontrast 4.5:1 (dnešné `text-slate-400` na bielej nespĺňa),
  dotykové ciele ≥ 44 px (dnešné ✎ ★ ✕ v riadku záznamu sú ~20 px), `aria-label`
  na ikonových tlačidlách (väčšinou chýbajú), focus v sheetoch.

### 4.4 Štruktúra appky a toky (UX) – prečo je to „kakolomné“ a čo s tým

Appka je navrhnutá pre jedného človeka, ktorý ju pozná. Každá funkcia dostala
vlastné tlačidlo tam, kde práve vznikla. Konkrétne:

1. **Päť miest pre obľúbené a štyri miesta na pridanie jedla.** Pridať: plávajúce
   tlačidlo, „+ pridať“ pri každom jedle, pás „⚡ Rýchle pridanie“, záložka
   „★ Obľúbené“ v sheete. Obľúbené: ★ na riadku, ★ na hlavičke jedla, ☆ v Potravinách,
   výber položiek → „Uložiť“, pás Rýchle pridanie (edit mód maže).
2. **Sheet „Pridať jedlo“ mieša *spôsob vstupu* s *tým, čo pridávaš*.** 7 chipov
   jedla dňa + 3 záložky (AI / Databáza / Obľúbené) + v záložke AI ďalšie 3 tlačidlá
   (Diktovať, Spracovať AI, Odfotiť jedlo) + v Databáze 2 (Čiarový kód, Odfotiť
   tabuľku) + skrytý formulár nového produktu s ďalšími 3 cestami (Dohľadať cez AI,
   Odfotiť tabuľku, Zadať ručne). Kým napíšeš prvé slovo, vidíš ~12 ovládacích
   prvkov. Predvolené jedlo dňa z plávajúceho tlačidla je **„Iné“**
   (`page.tsx:480`), takže zápisy končia v sekcii Iné.
3. **Údržba katalógu žije uprostred zápisu.** „Neznámy kód → dohľadať → odfotiť
   tabuľku → ručne na 100 g → uložiť ku kódu“ je správa databázy potravín, ale beží
   v oranžovom boxe vnútri toku „zapíš, čo si zjedol“.
4. **„Dnes“ je dlhý zoznam nesúvisiacich kariet**: súhrn, voda, obľúbené, jedlá,
   odkaz na presun dňa, suplementy, spánok, hmotnosť. To hlavné – *čo som jedol
   a ako na tom som* – súperí so štyrmi vedľajšími trackermi v plnej veľkosti.
5. **Pokročilé akcie sú stále na očiach**: „✓ Vybrať položky“, „⇄ Presunúť záznamy
   dňa“, úchyt na drag & drop, ✎ ★ ✕ na každom riadku, ★ na každej hlavičke jedla.
6. **Technický slovník**: „Spracovať AI“, „AI / diktovanie“, „Z databázy“, „Návrh“.
   Používateľ myslí v slovách *napísať, odfotiť, naskenovať, vybrať*.
7. **Profil je všetko naraz**: osobné údaje, TDEE, ciele, push, pravidlá vody, kouč,
   vkus, test notifikácie, odznaky, série, odhlásenie – jeden nekonečný scroll.

**Princípy nového usporiadania**

- Jedna vec = jedno miesto. Najprv *čo*, až potom *ako*.
- Hlavná cesta (zapísať jedlo) na 1–2 rozhodnutia; všetko ostatné o krok ďalej.
- Pokročilé akcie cez podržanie / ⋯ menu, nie trvalé ikony.
- Katalóg (potraviny, obľúbené, recepty) sa spravuje v Potravinách, nie pri zápise.
- Slová používateľa, nie technológie. „AI“ sa v UI nespomína – prosto to funguje.

**Navrhovaná mapa appky**

```
Spodné menu (5 slotov):  Dnes · Analytika · [ ＋ ] · Potraviny · Profil
                         plus v strede menu nahrádza plávajúce tlačidlo
                         (neprekrýva obsah, rešpektuje safe-area)

Dnes
 ├ Rypák – nálada dňa + posledná hláška (hero)
 ├ Súhrn dňa – kcal, makrá, verdikt-pečiatka
 ├ Denník – jedlá dňa; riadok = názov · gramáž · kcal
 │    ťuknutie = detail / gramáž · podržanie alebo ⋯ = Presunúť do…,
 │    Uložiť ako obľúbené, Zmazať (swipe s možnosťou vrátiť)
 ├ Ďalšie záznamy – JEDEN riadok dlaždíc: Voda 1,2 l · Spánok 7 · Váha 84,2 ·
 │    Suplementy 2/3 → ťuknutie otvorí malý sheet (dnešné karty sa stanú sheetmi)
 └ hlavička: dátum, kalendár, ⋯ (Vybrať položky, Presunúť záznamy dňa,
      Uložiť celý deň ako obľúbené)

＋ Pridať = JEDEN kompozér (krok 1) → Návrh (krok 2)
 ├ „do: Olovrant ▾“ – predvolené podľa hodiny (nie „Iné“); rozpoznanie
 │    z textu to môže prepísať pri položke
 ├ pole „Čo si zjedol?“ s tromi ikonami vo vnútri: diktovať · odfotiť · skenovať
 ├ Rýchlo – obľúbené + naposledy pre toto jedlo dňa (zlučuje Rýchle pridanie,
 │    záložku Obľúbené aj „naposledy“ z databázy)
 ├ písanie = hľadanie: „mak“ hneď ukáže zhody z databázy (ťuk = do návrhu);
 │    celá veta → tlačidlo „Rozpoznať“. Záložky AI / Databáza zaniknú – je to jedno pole.
 ├ odfotiť → malá voľba „Jedlo na tanieri“ / „Tabuľka z obalu“
 ├ skenovať → nájdené: rovno do návrhu s porciou; neznáme: krok „Neznámy produkt“
 │    (Dohľadať · Odfotiť tabuľku · Zadať ručne) → uloží do mojich potravín + do návrhu
 └ Návrh: položky s gramážou (stepper), istota ako pečiatka, jedlo dňa pri položke,
      voda, Spolu, „Pridať (3)“. Späť = kompozér s položkami (dnes ich rozpoznanie prepíše)

Analytika – ako dnes, v novom vizuáli; + hmotnosť s trendom, týždenný Rypákov výkaz

Potraviny – správa katalógu: moje / zdieľané, recepty, SPRÁVA OBĽÚBENÝCH
      (premenovať, upraviť položky, zmazať), seed len admin

Profil – sekcie / podstránky:
 ├ Tvoj Rypák – úroveň (4), vkus „Čo ťa baví“, sieň slávy, týždenný výkaz
 ├ Telo a ciele – údaje, TDEE, ciele
 ├ Pripomienky – push, voda, kouč
 ├ Odznaky a série
 └ Účet – heslo, export, zmazanie, odhlásenie

Onboarding (3 kroky, nový účet): výber úrovne Rypáka s ukážkami hlášok →
      telo a cieľ → notifikácie (iOS: „pridaj na plochu“)
Prázdne „Dnes“: spiaci Rypák + jediná výzva „Čo si mal na raňajky?“
```

**Čo sa tým získa:** hlavná cesta zápisu klesne z ~5 rozhodnutí (kam, ako, ktorá
záložka, ktoré tlačidlo, čo s návrhom) na 1–2; žiadna funkcia nezmizne, len sa
presunie tam, kam patrí; nový používateľ pochopí prvú obrazovku bez návodu.
Pre teba ako power-usera ostanú skratky (podržanie, ⋯, diktovanie celého dňa).

Vizuál kompozéra, návrhu, dlaždíc „Ďalšie záznamy“ a onboardingu je na plátne
(druhý rad, smer A).

---

## 5. Architektúra a kvalita kódu

### 5.1 Celkový obraz

- Next.js 14.2.18 (App Router), TypeScript, Tailwind 3, Prisma 5.22, Postgres,
  OpenAI cez `fetch`, web-push. ~11 400 riadkov TS/TSX, 40 API route,
  14 komponentov, 4 obrazovky.
- **Všetko je `"use client"`** – každá stránka načíta dáta až po vykreslení
  cez `useEffect` + `fetch`, prvé zobrazenie je prázdny stav/spinner
  (zmierňuje to RAM cache `page-cache.ts`). Server components sa nepoužívajú.
- Stavy sa držia lokálne v stránkach (`useState` + `reloadSignal` čísla,
  ktorými sa karty nútia prenačítať – `page.tsx:78-79`). Funguje, ale je to
  krehké: každá karta má vlastný fetch, vlastné loading/error, vlastnú cache.
- **Veľké komponenty**: `AddFoodSheet.tsx` 1 040 riadkov, `history/page.tsx`
  823, `page.tsx` 734, `profile/page.tsx` 693, `foods/page.tsx` 523,
  `SupplementCard.tsx` 497. Pridávanie jedla (text, hlas, fotka, DB, kód,
  obľúbené) je jeden súbor.
- **Žiadne testy, žiadny lint config** (`next lint` je v `package.json`, ale
  `.eslintrc` neexistuje), **žiadna validácia vstupov** (bez zod; všade `String()`,
  `Number()`), chybové hlášky z OpenAI/Prismy sa posielajú klientovi
  (`err.message`).
- `window.prompt` / `alert` na vstupy a chyby (`page.tsx:196, 204, 261, 191`) –
  na iOS PWA vyzerajú ako systémové dialógy a nedajú sa štýlovať.
- Stale dokumentácia: `DEPLOY.md` popisuje Gemini + Neon, kým README hovorí
  OpenAI + Supabase; `@google/genai` je nepoužívaná závislosť.
- Vercel Hobby spúšťa cron len 1× denne → `.github/workflows/reminders.yml`
  každú hodinu „štuchá“ endpointy. Funguje, ale GitHub plánované workflowy
  **bežia s oneskorením až desiatky minút a po 60 dňoch bez aktivity v repe sa
  automaticky vypnú** – pri verejnej appke to treba nahradiť (Vercel Pro cron,
  alebo externý plánovač).

### 5.2 Detailná review UI kódu

Z auditu `AddFoodSheet`, všetkých štyroch stránok, kariet, sheetov, `api.ts`,
`page-cache.ts`, `sw.js` a manifestu. Najprv **potvrdené chyby**, potom
štruktúra.

**Potvrdené chyby (overil som ich spustením / čítaním):**

| Chyba | Kde | Prečo | Dopad |
|---|---|---|---|
| **Analytika je posunutá o deň dozadu.** `shiftISO`/`weekStartISO` v Analytike vytvoria lokálnu polnoc a potom `.toISOString()` → UTC → v SK čase vždy o deň menej. Overené: `shiftISO("2026-10-06", 0)` vráti `2026-10-05`. | `history/page.tsx:40-44, 51-56` | duplikovaná pomocná funkcia; správna verzia už existuje v `page.tsx:48-56` a `badges.ts:43` (aj s komentárom, ktorý pred týmto varuje) | v grafe **chýba dnešok**, prvý stĺpec je deň, ktorý sa nenačítal, 14-dňový výber má 15 dní („z 15 dní“), týždenné koše sú označené predchádzajúcou nedeľou |
| **„Dnes“ sa nikdy nepreklopí cez polnoc.** Dátum sa nastaví raz pri štarte (`useState(todayISO())`), nikde nie je `visibilitychange`/focus handler. | `page.tsx:72` | PWA na iPhone ostáva v pamäti dni | ráno otvoríš appku, hlavička píše „Včera“ a nové jedlo sa zapíše do včerajška |
| **Odhlásenie nechá dáta ďalšiemu používateľovi.** `router.push("/login")` zachová JS pamäť, `page-cache` sa nevyčistí, push odber ostáva na starého používateľa. | `profile/page.tsx:116-119`, `badge-check.ts:12-30` | cache je modulová `Map` bez kľúča používateľa | ďalší prihlásený na tom istom zariadení chvíľu vidí cudzie záznamy, dostane falošné toasty „Nový odznak“ a zariadenie ďalej dostáva cudzie notifikácie kouča |
| **~20 API volaní bez `.catch`** – pri chybe sa spinner nikdy nezastaví a nič sa neukáže. | napr. `page.tsx:136`, `history:188,202`, `profile:36,52-58`, `foods:40-116`, `WaterCard:26`, `SleepCard:32` | 6 rôznych štýlov spracovania chýb (žiadne / ticho / inline / toast / `alert` / tichý reload) | profil ostane na „Načítavam…“, analytika točí donekonečna |
| **Odpovede môžu prísť v inom poradí.** Pri rýchlom ‹ › sa pod hlavičkou ukážu záznamy iného dňa; karty bez cache nového dňa držia stav starého. | `page.tsx:119-133`, `SleepCard:31,41-48`, `SupplementCard:70-134` | žiadny „ignoruj, ak je zastarané“ príznak | ťuknutie na zastarané číslo spánku **zmaže** spánok nového dňa; v suplementoch môže vzniknúť záporný počet a „−“ potom zmaže 2 záznamy |
| **AI rozpoznanie prepíše rozpracovaný návrh.** `setItems(items)` namiesto pridania. | `AddFoodSheet.tsx:180, 330` | | položky pridané z DB/obľúbených sa stratia |
| Pole „voda“ v návrhu sa nedá prepísať (pri vymazaní zmizne celý riadok); uloženie nie je atomické (zápis prejde, voda zlyhá → opakované uloženie zduplikuje jedlá); `saveUnknown` bez busy-flagu → dvojité ťuknutie = duplicitná potravina. | `AddFoodSheet.tsx:755-763, 399-416, 379-397` | | |
| `CoachBubble` bez `key` – druhý komentár počas prvého zdedí stav `rated` a časovač starej bubliny ju zavrie. | `page.tsx:517`, `CoachBubble.tsx:20-27` | | hláška zmizne skôr, než sa prečíta |
| `MoveDaySheet` povolí budúce dátumy („Zajtra“), ktoré sa v appke nedajú zobraziť. | `MoveDaySheet.tsx:95-104` | | presunuté záznamy „zmiznú“ |
| Uloženie profilu neaktualizuje cache `"profile"` → Dnes/Analytika chvíľu ukazujú staré ciele. | `profile/page.tsx:52-58` | | |

**Štruktúra a duplicita**

- Blok „ukáž cache, potom načítaj“ je skopírovaný **8×** (Dnes, Water, Sleep,
  Weight, Supplement, QuickFavorites, Analytika ×2, Odznaky); kľúče cache sú
  voľné reťazce zdieľané medzi súbormi (`"profile"`, `"favorites"`, `"badges"`).
- Debounce vyhľadávania 3× bez ochrany pred zastaranou odpoveďou; prepočet
  živín podľa gramáže 6×; vážený index zdravosti 2× len v `page.tsx`;
  prahy farieb zdravosti (7/4) 5×; progress bar 5×; overlay/sheet 5×;
  číselný input 6× (každý parsuje inak); slovenské množné čísla ad hoc
  (`"položky/iek"`).
- Duplicitné typy: `Day`, `Usage`, `BadgesData`, tvar položky komentára (4×);
  `Food` typ existuje len lokálne vo `foods`, API vracia `any`.
- Po jednom pridaní jedla ide **~8 requestov** (entries, profile, 4 karty,
  badges, comment); `/api/badges` sa volá aj po každom pridaní vody.
- `@dnd-kit`, `AddFoodSheet`, `CalendarPopup`, `MoveDaySheet` sa načítavajú
  hneď, hoci sa používajú až na akciu (`next/dynamic`); skener (`html5-qrcode`,
  ~375 kB) je správne lazy.
- z-indexy ad hoc (20/30/40/50/60) – Toaster má 50 ako sheety a je skôr v DOM,
  takže **toast sa zobrazí pod otvoreným sheetom**.
- Nič nie je memoizované; pri dnešných objemoch to nevadí.

**Prístupnosť a iOS**

- 5 overlayov, **0×** `role="dialog"`, `aria-modal`, Escape, presun/zámok fokusu;
  pozadie sa pri scrollovaní sheetu hýbe (chýba scroll-lock, `overscroll-behavior`).
- Len 12 `aria-label` v celom klientovi; ikonové tlačidlá bez mena (✕ zmazať
  záznam nemá ani `title`); dotykové ciele ~20–28 px (akcie v riadku záznamu,
  +/− suplementov, 11 tlačidiel spánku na 375 px šírke ≈ 25 px).
- Zmazanie záznamu = jedno ťuknutie na malé ✕ bez potvrdenia/undo.
- `maximumScale: 1` blokuje zoom; inputy menšie než 16 px (`text-sm`, aj 12 px
  zdedené z `text-xs` labelu) – na iOS by bez blokovania zoomovali.
- Fixné prvky ignorujú spodný safe-area inset (`bottom-24` FAB, lišta výberu,
  bublina `bottom-40`); `92vh` sheet s otvorenou klávesnicou má pätu za klávesnicou
  (treba `dvh`).
- Toaster bez `aria-live`, grafy bez textovej alternatívy, `<span role="button">`
  vnútri `<button>` v Analytike, labely bez `htmlFor`.
- Dobre: diktovanie sa po 15 s samo zastaví s radou použiť mikrofón klávesnice;
  fotky sa pred odoslaním zmenšujú; BottomNav prefetchuje záložky.

**PWA / service worker**

- `sw.js` rieši len `push` a `notificationclick`; **žiadny cache app-shellu,
  žiadny offline režim**, registruje sa až keď používateľ zapne push.
- Notifikácie bez `tag` (pripomienky vody sa kopia), `badge` je farebná ikona
  (má byť monochromatická), chýba `pushsubscriptionchange` (obnovený odber sa
  ticho stratí), `notificationclick` naviguje bez `await` a vynúti reload
  (zahodí rozpracovaný sheet).
- `manifest.ts` bez `id`, `scope`, `lang`; maskable ikona je tá istá 512 px;
  chýba apple-touch-icon.

**Kde sa maskot prirodzene usadí (z pohľadu kódu)**

1. slot avatara v `CoachBubble:61` (dnes emoji) – API už vracia `kind`, nálada
   sa z neho dá odvodiť hneď;
2. **globálny `<CoachHost/>` v `(app)/layout.tsx`** vedľa `<Toaster/>` s event
   busom ako `lib/toast.ts` – dnes sa komentár stratí, ak používateľ prepne
   záložku skôr, než AI odpovie; zároveň to rieši bugy s `key`/časovačom
   a umožní hovoriť koučovým hlasom aj pri odznakoch, vode, sérii;
3. pás „ostáva / nad cieľom“ v `MacroSummary:77-94` → trvalý avatar s náladou dňa;
4. prázdne a načítavacie stavy (Dnes, Analytika, obľúbené, suplementy,
   „Spracúvam…“ pri AI);
5. Profil – výber osobnosti a panel „Čo ťa baví“;
6. ranné zhrnutie aj **v appke** (dnes len push, a iOS push vyžaduje inštaláciu
   na plochu) + tlačidlo „zdieľať hlášku“.

### 5.3 Odporúčané technické smerovanie

- **Zostať na Next.js App Router**, upgrade na 14.2.35 hneď (bezpečnosť),
  Next 15/16 až po Fáze 1 (nie je dôvod naháňať).
- **Dátová vrstva**: zaviesť `swr` (alebo TanStack Query) namiesto ručného
  `useEffect` + `page-cache`: dedupe, revalidácia pri návrate na záložku,
  optimistické zmeny, jednotné loading/error. Zmena po jednej karte, bez big-bangu.
  Neskôr prvé načítanie „Dnes“ cez server component (dáta prídu s HTML).
- **Validácia**: `zod` schémy zdieľané API ↔ klient (`lib/schemas.ts`):
  dátum `YYYY-MM-DD`, konečné čísla, enumy (`mealType`, `source`, `persona`),
  dĺžky textov, veľkosť fotky. Jedna pomocná funkcia `apiError()` – klient
  dostane zrozumiteľnú hlášku, surová chyba ide len do logu.
- **Testy**: `vitest` nad existujúcimi čistými funkciami (`food-comment`,
  `badges`, `food-tags`, nový `mood`). Do checklistu pred commitom pribudne
  `npm test`. Toto je lacné – funkcie už sú napísané testovateľne.
- **Rozdelenie veľkých komponentov** pozdĺž už existujúcich hraníc:
  `AddFoodSheet` → `AiTab`, `PhotoTab`, `DbTab`, `BarcodeTab`, `ProposalList`;
  `page.tsx` → `DayHeader`, `MealList`, `EntryRow`, `SelectionBar`.
- **AI**: logovať spotrebu **všetkých** volaní (dnes chýba pri komentároch,
  destilácii, rannom zhrnutí a prehodnotení zdravosti), denný rozpočet na
  používateľa, limit dĺžky textu a počtu sekcií v `/api/parse`, limit veľkosti
  fotky. Modely: `gpt-4.1` nechať na rozpoznávanie a humor (slabšie modely
  vynechávajú položky a sú menej vtipné), `gpt-4.1-mini` stačí na destiláciu vkusu.
- **Pozorovateľnosť**: aspoň štruktúrované logy s `userId` a druhom AI volania;
  neskôr Sentry (free tier) na chyby klienta.

---

## 6. Bezpečnosť a viac používateľov

Z auditu všetkých 40 API route, middleware a auth vrstvy. Zoradené podľa závažnosti.
(Kľúčové body som overil priamo v kóde.)

### 6.1 Vysoká závažnosť

| # | Nález | Kde | Dopad | Oprava |
|---|---|---|---|---|
| 1 | **Cron endpointy prepúšťajú, keď `CRON_SECRET` nie je nastavený** (`if (!secret) return true`), middleware ich úplne vynecháva, tajomstvo sa prijíma aj v URL (`?secret=`). | `api/cron/coach/route.ts:22-28`, `api/cron/water/route.ts:34-41`, `middleware.ts:20` | Ktokoľvek vie spustiť push všetkým používateľom a AI volania (ranné zhrnutie). Workflow v `.github` k tomu navyše radí „ak kľúč nemáš, nechaj prázdne“. | fail-closed (bez tajomstva → 401), len hlavička `Authorization`, constant-time porovnanie. |
| 2 | **Žiadne limity na AI.** `/api/parse` spustí jedno volanie gpt-4.1 **paralelne za každú sekciu** bez stropu, text bez limitu dĺžky, fotky bez limitu veľkosti, `AiUsage` sa len zapisuje, nikdy nečíta. | `api/parse/route.ts:63-66`, `ai.ts:170-171`, `api/parse/photo/route.ts:31-33` | Jeden používateľ (alebo unikajúci registračný kód) = neobmedzený účet za OpenAI. | denný rozpočet na používateľa z `AiUsage`, max. dĺžka textu a počet sekcií, max. veľkosť fotky, jednoduchý rate-limit. |
| 3 | **Ktokoľvek zapisuje do zdieľanej tabuľky potravín** – `/api/barcode/ai` ukladá výsledok AI ako `userId: null`, kód bez validácie, názov bez limitu, bez deduplikácie; ak model nevráti názov, názvom sa stane surový vstup používateľa (`ai.ts:451`). Zdieľané riadky **nikto cez API nevie zmazať** (`foods/[id]` vyžaduje vlastníka). | `api/barcode/ai/route.ts:49-64` | Otrávené/urážlivé položky u všetkých používateľov; **cross-user prompt injection** – názvy zdieľaných potravín idú doslovne do promptov ostatných (`buildReferenceBlock`; `parse/photo` berie 15 najnovších potravín vždy). | nové potraviny z AI ukladať ako súkromné; zdieľané len z OFF/seedu; validácia kódu (`^\d{6,14}$` ako v GET), dedupe podľa kódu; admin mazanie. |

### 6.2 Stredná závažnosť

- **`/api/seed` nemá kontrolu admina ani auth v handleri** (spolieha len na
  middleware) a tlačidlo „Naplniť globálnu databázu“ vidí každý používateľ
  (`foods/page.tsx:188`). → admin-only alebo zrušiť (README radí `npm run db:seed`).
- **`/api/admin/reevaluate-health` zapisuje na GET** (`?apply=1`), tajomstvo v URL
  (logy, história prehliadača), v „secret“ režime číta a prepisuje **dáta všetkých
  používateľov** vrátane súkromných potravín. → POST-only, bez `?secret`, len admin.
- **Prihlásenie bez ochrany pred hádaním**: žiadny rate-limit ani lockout na
  login a registračný kód; `scryptSync` blokuje event loop; čas odpovede prezrádza,
  či používateľ existuje (`if (!user || !verifyPassword)` – scrypt sa pri
  neexistujúcom mene nespustí). → throttling, async `scrypt`, „dummy“ overenie
  pri neznámom mene.
- **Sedenia sú bezstavové, 60 dní, neodvolateľné**; pri overení sa nekontroluje,
  či používateľ ešte existuje / jeho rola. → tabuľka `Session` (alebo
  `tokenVersion` na používateľovi), odhlásenie všade.
- **Push `endpoint` sa nevaliduje** → server neskôr POST-uje na ľubovoľnú URL
  (blind SSRF cez web-push). → povoliť len `https:` a známe push služby.
- **Next.js 14.2.18** < 14.2.25 (oprava CVE-2025-29927, obídenie middleware
  hlavičkou). Na Verceli je dopad obmedzený (handlery si auth kontrolujú samy,
  výnimka je `/api/seed`), ale upgrade je triviálny. Aktuálne 14.2.35.
- **Registrácia**: jeden zdieľaný kód bez limitu účtov a bez možnosti odvolať
  pozvánku; prvý účet bez kódu sa stane adminom (bootstrap – OK, ale `count →
  create` nie je atomické).

### 6.3 Nízka závažnosť / hygiena

- Bez schémovej validácie: `date` sa väčšinou nekontroluje (`entries`, `water`,
  `sleep`, `weight`, `supplements/log`, `favorites/[id]/log`), `Number()` bez
  `isFinite` (NaN do DB), voľné enumy (`mealType`, `source`), neobmedzené polia
  a texty, `req.json()` bez `.catch` → 500 pri zlom JSON-e.
- Surové `err.message` ide klientovi (`parse`, `parse/photo`, `barcode/*`,
  `seed`, `push/test`) – vrátane až 300 znakov odpovede OpenAI.
- Žiadne bezpečnostné hlavičky (CSP, X-Frame-Options, Referrer-Policy).
- Legacy riadky `WaterLog` a `AiUsage` s `userId: null` sa pri registrácii
  prvého používateľa **neadoptovali** (adoptovali sa len `Entry` a časť `Food`) –
  sú neviditeľné pre všetkých. Treba ich priradiť tebe (overíme v zálohe).
- `Profile` model je nepoužívaný pozostatok (len seed).
- `.env.example` má placeholder `SESSION_SECRET` dlhý 38 znakov → **prejde**
  kontrolou min. 16; pri omylom nasadenom placeholderi sa dá sfalšovať cookie.
  → kontrola proti známemu placeholderu + odporúčanie `openssl rand`.

### 6.4 Čo chýba, kým appku použije niekto cudzí

- **Zmazanie účtu** (schéma je pripravená – všetky relácie majú
  `onDelete: Cascade`), **export dát**, **zmena a reset hesla** (User nemá e-mail,
  žiadne mailové závislosti → zabudnuté heslo = ručný zásah do DB).
- **Správa používateľov pre admina** (zoznam, zablokovať, resetovať heslo,
  spotreba AI a náklady na používateľa – dnes `/api/usage` ukazuje len vlastné).
- **Pozvánky** namiesto jedného kódu (kód na jedno použitie / s limitom).
- **GDPR**: hmotnosť, spánok, **lieky** (`Supplement.kind = medication`) a strava
  sú zdravotné údaje (čl. 9). Pri otvorení treba: informáciu o spracovaní,
  súhlas so spracovaním cez OpenAI, export + zmazanie, 18+ pri 4. úrovni kouča.
  Pre uzavretý okruh známych to stačí mať pripravené, nie hotové.

---

## 7. Dáta, záloha a migrácie

### 7.1 Záloha (urobím ja, pred akoukoľvek zmenou)

Supabase **Free** plán nemá automatické zálohy (Pro má denné). Preto vlastný
`pg_dump`. Na tomto Macu nie je `pg_dump`, ale je **Docker** → použijem oficiálny
obraz Postgresu (verzia dumpu ≥ verzia servera, čo je v poriadku):

1. Ty: do lokálneho `.env` (je v `.gitignore`) daj `DATABASE_URL` zo Supabase –
   **priame pripojenie** (port 5432, nie pooler 6543). Nikdy do chatu.
2. Ja: `docker run --rm postgres:17 pg_dump "$DATABASE_URL" -Fc -f …` do
   `~/Backups/rypak/<dátum>.dump` (mimo repa) + čitateľný `.sql`.
3. Overenie: lokálny Postgres v Dockeri, `pg_restore`, porovnanie počtov riadkov
   v každej tabuľke s produkciou (`SELECT count(*)`), skúšobný `prisma migrate`
   nad kópiou, spustenie appky nad kópiou.
4. Až potom čokoľvek v produkcii. Pred každou ďalšou zmenou schémy nový dump.

### 7.2 Z `db push` na `prisma migrate`

Dnes build spúšťa `prisma db push --skip-generate` – bez histórie, pri
konfliktoch zlyhá build, pri „data loss“ sa zastaví. Pre serióznu appku:

- baseline: `prisma migrate diff --from-empty --to-schema-datamodel … --script`
  → `prisma/migrations/0_init/migration.sql`; na produkcii
  `prisma migrate resolve --applied 0_init`;
- build: `prisma migrate deploy` namiesto `db push`;
- pravidlo **expand → migrate → contract**: najprv pridať, dáta preliať, staré
  odstrániť až keď nič staré nebeží (napr. `coachRoast` → `coachLevel`).

### 7.3 Plánované zmeny schémy (všetky aditívne = bezpečné)

| Zmena | Načo |
|---|---|
| `User.coachLevel Int?` (1–4), `User.fatShameConsentAt DateTime?`, `User.coachMutedUntil DateTime?`, `User.theme String?`, `User.email String? @unique` | 4 úrovne kouča, súhlas, „dnes ma nechaj“, tmavý režim, reset hesla |
| `CoachLine` (userId, text, kind, persona/level, mood, rating, shared, createdAt) | história hlášok, sieň slávy, zdieľanie; dnes len JSON `commentLog` |
| `Session` (id, userId, createdAt, lastSeenAt, userAgent, revokedAt) | odvolateľné prihlásenie |
| `Invite` (code, createdBy, maxUses, uses, expiresAt) | pozvánky namiesto jedného kódu |
| `WeeklyReport` (userId, weekStart, facts JSON, text, imageUrl?) | nedeľný výkaz, zdieľateľná karta |
| `Favorite.foodId String?` | čistejšie párovanie hviezdičky (HANDOVER §6) |
| skript: `WaterLog/AiUsage.userId null → admin` | adopcia legacy dát |

Nič sa nemaže ani nepremenúva. `Profile`, `coachRoast` ostávajú, kým ich kód číta.

---

## 8. Náklady na AI a limity

Orientačne (gpt-4.1: ~2 $/M vstupných, ~8 $/M výstupných tokenov):
rozpoznanie textu ~1,5k in / 0,4k out ≈ 0,006 $; komentár ≈ 0,003 $; fotka
≈ 0,01 $; ranné zhrnutie ≈ 0,003 $. Aktívny používateľ (10 zápisov + 5 komentárov
+ 1 fotka denne) ≈ 0,10 $/deň ≈ **2–3 € mesačne**. Desať známych ≈ 25 €/mesiac –
zvládnuteľné, **ale len s limitmi** (§6.1 bod 2), inak jeden chybný skript alebo
žartík z 300 riadkami „obed:“ spraví stovky volaní naraz.

Návrh limitov: 60 AI volaní / používateľ / deň (soft, kouč stíchne skôr než
zápis), 20 fotiek / deň, text do 2 000 znakov a 8 sekcií, fotka do 2 MB.
Admin vidí spotrebu a náklady na používateľa.

---

## 9. Roadmapa

Odhad v „sessionách“ (jeden sústredený blok práce, každý končí commitom a pushom).

### Fáza 0 – Bezpečná pôda (1–2 sessions, bez viditeľnej zmeny)
- záloha + skúšobná obnova (§7.1), `prisma migrate` baseline (§7.2),
- Next 14.2.35, cron fail-closed + bez `?secret`, `/api/seed` admin-only,
  `reevaluate-health` POST-only, push endpoint validácia,
- AI limity + logovanie všetkých volaní, limity vstupov,
- `barcode/ai` → súkromné potraviny, dedupe,
- zod na dátumy/čísla/enumy, `apiError()` bez surových hlášok,
- odstrániť `@google/genai`, opraviť `DEPLOY.md`, eslint config, vitest
  s testami nad existujúcimi čistými funkciami,
- adopcia legacy `WaterLog`/`AiUsage` riadkov,
- **rýchle opravy potvrdených chýb** (§5.2): jeden `lib/dates.ts` (oprava
  posunu v Analytike, preklopenie „Dnes“ po polnoci), vyčistenie cache
  a push odberu pri odhlásení, `key` na `CoachBubble`, ochrana pred
  zastaranými odpoveďami pri prepínaní dní, `.catch` + toast na API volania.

### Fáza 1 – Identita Rypák (2–3 sessions)
- názov, manifest, ikony, prihlásenie/registrácia v novom vizuáli,
- tokeny + tmavý režim, písma cez `next/font`, `lucide-react` namiesto emoji,
- `<Pig>` so 7 náladami + `lib/mood.ts`, hero karta na „Dnes“, nový `CoachBubble`,
- výber úrovne kouča (4 úrovne, 4. za súhlasom), ikony notifikácií podľa nálady.

### Fáza 2 – Kouč do hĺbky (2–3 sessions)
- prompty a pravidlá 4. úrovne (§3.4) + fallbacky; reálne otestovať tón
  a odmietnutia modelu (ty, screenshoty),
- nové spúšťače (§3.5), ambientná hláška, „Dnes ma nechaj“,
- `CoachLine` + sieň slávy, týždenný výkaz + zdieľateľná karta.

### Fáza 3 – Viac používateľov (2–3 sessions)
- pozvánky, e-mail + reset hesla (napr. Resend, free tier), zmena hesla,
- zmazanie účtu a export dát, tabuľka `Session`, throttling prihlásenia,
- admin obrazovka (používatelia, spotreba AI, náklady), texty o súkromí a súhlas,
- náhrada GitHub Actions plánovača (Vercel Pro cron alebo externý).

### Fáza 4 – Leštenie (priebežne)
- Analytika v novom vizuáli (graf hmotnosti s trendom, odznaky „bez pečiva“),
- rozdelenie `AddFoodSheet`/`page.tsx`, `swr` dátová vrstva, dynamický import
  skenera, prístupnosť, landing stránka pre pozvaných.

**Poradie je zámerné**: Fáza 0 chráni tvoje dáta a peňaženku a nič nerozbije;
Fáza 1 je viditeľná zmena, ktorú chceš; Fáza 2 je to, čím sa appka odlišuje;
Fáza 3 až keď švagor reálne nastupuje.

---

## 10. Čo potrebujem od teba

1. **Rozhodnutia**: názov, smer dizajnu (A/B/C), pravidlá 4. úrovne (§3.4 –
   súhlas / úpravy), commit tohto dokumentu.
2. **Pre zálohu**: `DATABASE_URL` (priame pripojenie) do lokálneho `.env`;
   informáciu, či je Supabase Free alebo Pro.
3. **Pre cron**: či sú v GitHube nastavené secrets `APP_URL` a `CRON_SECRET`
   a či je `CRON_SECRET` nastavený aj vo Verceli (ak nie, je to dnes diera č. 1).
4. **Pre tón kouča**: po nasadení Fázy 2 screenshoty hlášok – zo session sa
   AI výstupy overiť nedajú.
5. **Kedy nastupuje švagor** – podľa toho posuniem Fázu 3 skôr alebo neskôr.
