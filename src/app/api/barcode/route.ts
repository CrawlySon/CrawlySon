import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 20;

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampHealth(n: number): number {
  return Math.min(10, Math.max(0, Math.round(n)));
}

// Odhad indexu zdravosti (0–10). Najprv Nutri-Score (a–e) + NOVA, inak
// heuristika z hodnôt na 100 g. Pri balených výrobkoch orientačné.
function estimateHealthIndex(d: {
  nutriscore?: string | null;
  nova?: number | null;
  kcal?: number | null;
  protein?: number | null;
  fat?: number | null;
  fiber?: number | null;
  sugars?: number | null;
  satFat?: number | null;
}): number | null {
  const grade = (d.nutriscore || "").toLowerCase();
  if (["a", "b", "c", "d", "e"].includes(grade)) {
    let s = { a: 9, b: 7, c: 5, d: 3, e: 1 }[grade]!;
    if (d.nova === 4) s -= 1;
    else if (d.nova === 1) s += 1;
    return clampHealth(s);
  }

  const { kcal, protein, fat, fiber, sugars, satFat } = d;
  if (kcal == null && protein == null && fat == null) return null;
  let s = 5;
  if (fiber != null) s += fiber >= 6 ? 2 : fiber >= 3 ? 1 : 0;
  if (protein != null) s += protein >= 15 ? 1.5 : protein >= 8 ? 0.5 : 0;
  if (sugars != null) s += sugars >= 22.5 ? -2.5 : sugars >= 10 ? -1 : sugars <= 2 ? 0.5 : 0;
  if (satFat != null) s += satFat >= 5 ? -1.5 : satFat >= 2 ? -0.5 : 0;
  else if (fat != null) s += fat >= 25 ? -1.5 : fat >= 15 ? -0.5 : 0;
  if (kcal != null) s += kcal >= 450 ? -1.5 : kcal >= 300 ? -0.5 : kcal <= 80 ? 0.5 : 0;
  return clampHealth(s);
}

// GET /api/barcode?code=EAN -> nájde potravinu (naša DB → Open Food Facts)
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "").trim();
  if (!/^\d{6,14}$/.test(code)) {
    return NextResponse.json({ error: "Neplatný čiarový kód." }, { status: 400 });
  }

  // 1) Naša databáza – uprednostni vlastnú, inak zdieľanú
  const own = await prisma.food.findFirst({ where: { barcode: code, userId } });
  const shared = own ? null : await prisma.food.findFirst({ where: { barcode: code, userId: null } });
  const existing = own || shared;
  if (existing) {
    // Doplň chýbajúci index zdravosti aj k staršie uloženým produktom
    if (existing.healthIndex == null) {
      const hi = estimateHealthIndex({
        kcal: existing.calories,
        protein: existing.protein,
        fat: existing.fat,
        fiber: existing.fiber,
      });
      if (hi != null) {
        try {
          const updated = await prisma.food.update({ where: { id: existing.id }, data: { healthIndex: hi } });
          return NextResponse.json({ found: true, source: "db", food: updated });
        } catch {
          /* ak sa nepodarí update, vráť aspoň pôvodné */
        }
      }
    }
    return NextResponse.json({ found: true, source: "db", food: existing });
  }

  // 2) Open Food Facts
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_sk,brands,categories,nutriments,nutriscore_grade,nova_group`;
    const res = await fetch(url, {
      headers: { "User-Agent": "NutriAI/1.0 (osobny nutricny dennik)" },
      cache: "no-store",
    });
    if (res.ok) {
      const json: any = await res.json();
      const p = json?.product;
      if (json?.status === 1 && p) {
        const n = p.nutriments || {};
        let kcal = num(n["energy-kcal_100g"]);
        if (kcal == null && num(n["energy_100g"]) != null) kcal = Math.round(num(n["energy_100g"])! / 4.184);
        const protein = num(n["proteins_100g"]);
        const carbs = num(n["carbohydrates_100g"]);
        const fat = num(n["fat_100g"]);
        const name = (p.product_name_sk || p.product_name || "").trim();

        if (name && kcal != null && kcal > 0 && protein != null && carbs != null && fat != null) {
          const fiber = num(n["fiber_100g"]);
          const healthIndex = estimateHealthIndex({
            nutriscore: p.nutriscore_grade,
            nova: num(p.nova_group),
            kcal,
            protein,
            fat,
            fiber,
            sugars: num(n["sugars_100g"]),
            satFat: num(n["saturated-fat_100g"]),
          });
          // Ulož ako zdieľanú (globálnu) potravinu, nech je nabudúce „známa" pre všetkých
          const food = await prisma.food.create({
            data: {
              userId: null,
              barcode: code,
              name,
              brand: (p.brands || "").split(",")[0]?.trim() || null,
              category: (p.categories || "").split(",")[0]?.trim() || null,
              baseGrams: 100,
              calories: Math.round(kcal),
              protein: Math.round(protein * 10) / 10,
              carbs: Math.round(carbs * 10) / 10,
              fat: Math.round(fat * 10) / 10,
              fiber,
              healthIndex,
              source: "openfoodfacts",
            },
          });
          return NextResponse.json({ found: true, source: "openfoodfacts", food });
        }
      }
    }
  } catch (e) {
    console.error("OFF lookup error:", e);
  }

  // 3) Nenájdené – klient ponúkne manuálne zadanie
  return NextResponse.json({ found: false, code });
}
