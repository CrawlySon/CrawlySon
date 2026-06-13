import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";
export const maxDuration = 20;

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
    return NextResponse.json({ found: true, source: "db", food: existing });
  }

  // 2) Open Food Facts
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_sk,brands,categories,nutriments`;
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
              fiber: num(n["fiber_100g"]),
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
