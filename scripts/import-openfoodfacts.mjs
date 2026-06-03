/**
 * Import potravín z verejnej databázy Open Food Facts (https://openfoodfacts.org).
 *
 * Stiahne najpopulárnejšie produkty (predvolene predávané na Slovensku) aj s
 * čiarovým kódom a uloží ich do tabuľky Food (hodnoty na 100 g).
 *
 * Použitie:
 *   node scripts/import-openfoodfacts.mjs [voľby]
 *
 * Voľby (cez premenné prostredia alebo argumenty --kľúč=hodnota):
 *   --country=slovakia     krajina predaja (en názov), prázdne = celý svet
 *   --pages=20             počet stránok (á page-size)
 *   --pageSize=100         počet produktov na stránku (max 100)
 *   --search=              voliteľný textový filter (napr. "jogurt")
 *   --limit=2000           max. počet uložených produktov
 *   --dryRun               nič neukladá, len vypíše čo by importoval
 *
 * Open Food Facts vyžaduje identifikujúci User-Agent – nastav si vlastný kontakt.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── parsovanie argumentov ────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);
const COUNTRY = args.country ?? process.env.OFF_COUNTRY ?? "slovakia";
const PAGES = Number(args.pages ?? 20);
const PAGE_SIZE = Math.min(100, Number(args.pageSize ?? 100));
const SEARCH = args.search ?? "";
const LIMIT = Number(args.limit ?? 2000);
const DRY_RUN = Boolean(args.dryRun);
const USER_AGENT =
  process.env.OFF_USER_AGENT ?? "NutriAI/1.0 (osobny nutricny dennik)";

const BASE = "https://world.openfoodfacts.org/api/v2/search";
const FIELDS = [
  "code",
  "product_name",
  "product_name_sk",
  "brands",
  "categories",
  "nutriments",
  "nutrition_data_per",
].join(",");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Zmysluplne spracuje jeden produkt na záznam Food (alebo null, ak nepoužiteľný).
function mapProduct(p) {
  const n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null && num(n["energy_100g"]) != null) {
    kcal = Math.round(num(n["energy_100g"]) / 4.184); // kJ → kcal
  }
  const protein = num(n["proteins_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  const fat = num(n["fat_100g"]);

  // potrebujeme aspoň energiu a makrá, inak je záznam bezcenný
  if (kcal == null || kcal <= 0 || protein == null || carbs == null || fat == null) return null;

  const name = (p.product_name_sk || p.product_name || "").trim();
  if (!name || name.length < 2) return null;
  const code = (p.code || "").trim();
  if (!code) return null;

  return {
    barcode: code,
    name,
    brand: (p.brands || "").split(",")[0]?.trim() || null,
    category: (p.categories || "").split(",")[0]?.trim() || null,
    baseGrams: 100,
    calories: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fiber: num(n["fiber_100g"]),
    source: "openfoodfacts",
  };
}

async function fetchPage(page) {
  const url = new URL(BASE);
  if (COUNTRY) url.searchParams.set("countries_tags_en", COUNTRY);
  if (SEARCH) url.searchParams.set("search_terms", String(SEARCH));
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("sort_by", "unique_scans_n"); // najpopulárnejšie
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`OFF HTTP ${res.status} (str. ${page})`);
  const json = await res.json();
  return json.products || [];
}

async function main() {
  console.log(
    `Import z Open Food Facts → krajina="${COUNTRY || "svet"}"${SEARCH ? `, hľadanie="${SEARCH}"` : ""}, ` +
      `stránok=${PAGES}, na stránku=${PAGE_SIZE}, limit=${LIMIT}${DRY_RUN ? " [DRY RUN]" : ""}`
  );

  let saved = 0;
  let skipped = 0;
  let seen = 0;

  for (let page = 1; page <= PAGES && saved < LIMIT; page++) {
    let products;
    try {
      products = await fetchPage(page);
    } catch (e) {
      console.error(`  ! ${e.message} – pokračujem`);
      await sleep(2000);
      continue;
    }
    if (!products.length) {
      console.log("  (žiadne ďalšie produkty)");
      break;
    }

    for (const p of products) {
      if (saved >= LIMIT) break;
      seen++;
      const food = mapProduct(p);
      if (!food) {
        skipped++;
        continue;
      }
      if (DRY_RUN) {
        saved++;
        if (saved <= 20) console.log(`  • ${food.name}${food.brand ? ` (${food.brand})` : ""} – ${food.calories} kcal`);
        continue;
      }
      try {
        await prisma.food.upsert({
          where: { barcode: food.barcode },
          update: food,
          create: food,
        });
        saved++;
      } catch {
        skipped++;
      }
    }
    console.log(`  str. ${page}: spolu uložené ${saved}, preskočené ${skipped}`);
    await sleep(800); // slušné tempo voči API
  }

  console.log(`\nHotovo. Spracované ${seen}, uložené/aktualizované ${saved}, preskočené ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
