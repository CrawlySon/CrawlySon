# 📦 Nasadenie NutriAI – návod krok za krokom (bez terminálu)

Tento postup zvládneš celý cez webové rozhrania. Potrebuješ len účet Google
(máš) a prístup k tomuto GitHub repozitáru.

Celkový čas: ~10 minút. Poradie: **① Gemini kľúč → ② databáza Neon →
③ nasadenie na Vercel → ④ naplnenie databázy v appke**.

---

## ① Gemini API kľúč (Google AI Studio)

1. Otvor **https://aistudio.google.com/app/apikey** a prihlás sa svojím Google účtom.
2. Klikni modré tlačidlo **„Create API key"** (vpravo hore / v strede).
3. Ak sa spýta na projekt, v rozbaľovacom poli vyber **„Create a new project"**
   (alebo ľubovoľný existujúci), prípadne zadaj názov projektu, napr. `NutriAI`.
4. Klikni **„Create key"**.
5. Zobrazí sa kľúč (začína `AIza...`). Klikni ikonu **kopírovať** a niekam si ho
   dočasne ulož (budeš ho vkladať v kroku ③).

> Kľúč Gemini má štedrý bezplatný limit, na osobné používanie bohato stačí.

---

## ② Databáza (Neon – Postgres zadarmo)

1. Otvor **https://neon.tech** a klikni **„Sign up"** → prihlás sa cez
   **Continue with Google** (alebo GitHub).
2. Po prihlásení ťa Neon vyzve vytvoriť projekt (**„Create project"**):
   - **Project name:** `nutriai`
   - **Postgres version:** nechaj predvolenú (najvyššiu)
   - **Database name:** nechaj `neondb`
   - **Region / Cloud:** vyber najbližší – pre Európu napr.
     **„Europe (Frankfurt)"** (`aws eu-central-1`)
   - Klikni **„Create project"**.
3. Otvorí sa obrazovka projektu s panelom **„Connection Details"** (ak nie,
   klikni tlačidlo **„Connect"** vpravo hore).
4. Dôležité: **vypni prepínač „Connection pooling"** (chceme priame pripojenie,
   funguje spoľahlivo aj pre vytvorenie tabuliek).
5. Skopíruj celý **connection string** – vyzerá takto:
   ```
   postgresql://neondb_owner:HESLO@ep-cool-darkness-123.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   Ulož si ho (vkladáš v kroku ③ ako `DATABASE_URL`).

---

## ③ Nasadenie na Vercel

1. Otvor **https://vercel.com** a klikni **„Sign Up"** → **„Continue with GitHub"**
   a povoľ prístup.
2. V hornom menu klikni **„Add New…"** → **„Project"**.
3. V sekcii **„Import Git Repository"** nájdi **`CrawlySon/CrawlySon"`** a klikni
   **„Import"**.
   - Ak repo nevidíš, klikni **„Adjust GitHub App Permissions"** /
     **„Configure GitHub App"**, vyber repozitár `CrawlySon/CrawlySon` a ulož.
4. Na konfiguračnej obrazovke:
   - **Framework Preset:** automaticky sa zistí **Next.js** – nechaj tak.
   - **Root Directory:** nechaj `./`.
   - **Build & Output Settings:** nič nemeň (projekt si build aj vytvorenie
     tabuliek rieši sám).
   - Rozbaľ **„Environment Variables"** a pridaj **5 premenných** (Name = Value):

     | Name | Value |
     |------|-------|
     | `DATABASE_URL` | connection string z Neonu (krok ②) |
     | `GEMINI_API_KEY` | kľúč z AI Studio (krok ①) |
     | `APP_PASSWORD` | heslo, ktorým sa budeš prihlasovať do appky (vymysli si) |
     | `SESSION_SECRET` | ľubovoľný dlhý náhodný text (napr. 30+ znakov) |
     | `GEMINI_MODEL` | `gemini-3.5-flash` |

     > Tip: každý riadok pridáš poľami Name/Value a tlačidlom **„Add"**. Alebo
     > môžeš naraz vložiť všetky riadky vo formáte `NAZOV=hodnota` – Vercel ich
     > sám rozparsuje.
5. Klikni **„Deploy"** a počkaj ~1–2 minúty (vytvorí sa build aj tabuľky v DB).
6. Po dokončení klikni **„Continue to Dashboard"** a navrchu nájdeš **URL**
   tvojej appky (napr. `https://crawlyson.vercel.app`). Klikni **„Visit"**.

---

## ④ Prvé spustenie + naplnenie databázy

1. Otvor URL appky → zobrazí sa prihlásenie. Zadaj **`APP_PASSWORD`** z kroku ③.
2. Choď do spodného menu na **„Potraviny"** 🥗 a klikni
   **„Naplniť základnými potravinami"** – pridá sa 47 slovenských potravín.
   (Toto stačí spraviť raz.)
3. Späť na **„Dnes"** 🍽️ → klikni **„✨ Pridať jedlo"**, do textu napíš alebo
   nadiktuj napr. *„zjedol som 200 g kuracích pŕs s ryžou"* a daj **„Spracovať
   AI"**. Skontroluj návrh a **„Pridať"**. 🎉

---

## 📱 Pridanie na plochu iPhonu (ako appka)

1. Otvor URL v **Safari** na iPhone.
2. Ťukni na ikonu **Zdieľať** (štvorček so šípkou) → **„Pridať na plochu"** →
   **„Pridať"**. Na ploche ti pribudne ikona NutriAI, ktorá sa otvára na celú
   obrazovku ako natívna appka.

---

## 🔧 Časté problémy

- **Po prihlásení appka hlási chybu DB** → skontroluj `DATABASE_URL` vo Verceli
  (Settings → Environment Variables), že je to celý reťazec aj s
  `?sslmode=require`. Po zmene daj **Redeploy** (Deployments → … → Redeploy).
- **AI vracia chybu o kľúči** → `GEMINI_API_KEY` je zlý alebo zablokovaný;
  vytvor nový v AI Studio a aktualizuj premennú vo Verceli + Redeploy.
- **Zmena premenných sa neprejaví** → vždy treba **Redeploy** (env premenné sa
  načítajú pri builde).

## 🌍 (Voliteľné) Import tisícov potravín z Open Food Facts
Toto vyžaduje krátke spustenie v termináli na tvojom počítači – pozri
`README.md`, sekcia *„Import verejnej databázy potravín"*.
