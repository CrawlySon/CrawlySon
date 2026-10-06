import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminId } from "@/lib/server-auth";
import { scoreHealthBatch } from "@/lib/ai";
import { checkAiQuota } from "@/lib/ai-quota";
import { apiError, forbidden } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

// Jednorazové prehodnotenie zdravosti existujúcich záznamov podľa nových pravidiel.
//   POST /api/admin/reevaluate-health            -> NÁHĽAD (nič nezapíše)
//   POST /api/admin/reevaluate-health?apply=1    -> APLIKUJE zmeny
// Len prihlásený admin a len jeho vlastné záznamy. Predtým existoval aj režim
// „?secret=" nad dátami všetkých používateľov a zápis bežal na GET – odkaz
// v prehliadači tak vedel prepísať cudzie dáta (CSRF). POST + admin to rieši.
const BATCH = 50;

export async function GET() {
  return NextResponse.json({ error: "Použi POST (náhľad) alebo POST ?apply=1 (zápis)." }, { status: 405 });
}

export async function POST(req: Request) {
  try {
    return await run(req);
  } catch (e) {
    return apiError(e, "admin/reevaluate-health");
  }
}

async function run(req: Request) {
  const adminId = await getAdminId();
  if (!adminId) return forbidden();
  await checkAiQuota(adminId, "rescore");

  const apply = new URL(req.url).searchParams.get("apply") === "1";
  const where = { userId: adminId };

  // Zoznam staviame z denníka AJ z databázy potravín – inak by sa potravina,
  // ktorú používateľ ešte nezjedol, nikdy neprehodnotila.
  const [entries, foods] = await Promise.all([
    prisma.entry.findMany({
      where,
      select: { name: true, category: true, healthIndex: true, quantityGrams: true, calories: true, protein: true, carbs: true, fat: true, fiber: true },
    }),
    prisma.food.findMany({
      where,
      select: { name: true, category: true, healthIndex: true, baseGrams: true, calories: true, protein: true, carbs: true, fat: true, fiber: true },
    }),
  ]);

  type Per100 = { calories: number; protein: number; carbs: number; fat: number; fiber: number | null };
  type Grp = { name: string; category: string | null; oldIndex: number | null; count: number; per100: Per100 | null };

  // Zdravosť je vlastnosť potraviny, nie porcie – hodnoty preto normalizujeme
  // na 100 g. Bez toho by 400 g balenie vyzeralo horšie než to isté v 100 g.
  const scale = (base: number | null | undefined, v: { calories: number; protein: number; carbs: number; fat: number; fiber: number | null }): Per100 | null => {
    if (!base || base <= 0) return null;
    const f = 100 / base;
    return {
      calories: v.calories * f,
      protein: v.protein * f,
      carbs: v.carbs * f,
      fat: v.fat * f,
      fiber: v.fiber != null ? v.fiber * f : null,
    };
  };

  const groups = new Map<string, Grp>();
  const add = (name: string, category: string | null, oldIndex: number | null, per100: Per100 | null, counts: boolean) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    const g = groups.get(key);
    if (g) {
      if (counts) g.count++;
      if (g.category == null && category) g.category = category;
      if (g.oldIndex == null && oldIndex != null) g.oldIndex = oldIndex;
      if (g.per100 == null && per100) g.per100 = per100;
    } else {
      groups.set(key, { name: name.trim(), category, oldIndex, count: counts ? 1 : 0, per100 });
    }
  };

  // Najprv potraviny – ich hodnoty na baseGrams sú spoľahlivejšie než z porcie.
  for (const f of foods) add(f.name, f.category, f.healthIndex, scale(f.baseGrams, f), false);
  for (const e of entries) add(e.name, e.category, e.healthIndex, scale(e.quantityGrams, e), true);

  // Abecedne, nech podobné výrobky („Müllermilch", „Müllermilch pistácia…")
  // skončia v rovnakej dávke a model ich hodnotí vedľa seba.
  const list = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, "sk"));
  if (list.length === 0) return NextResponse.json({ ok: true, message: "Žiadne záznamy.", changes: [] });

  // Dávkové ohodnotenie cez AI
  const newIndex = new Map<string, number>(); // key (lowercased name) -> nový index
  for (let i = 0; i < list.length; i += BATCH) {
    const slice = list.slice(i, i + BATCH);
    const scores = await scoreHealthBatch(slice.map((g) => ({ name: g.name, category: g.category, per100: g.per100 })));
    for (const [idx, hi] of scores) {
      const g = slice[idx];
      if (g) newIndex.set(g.name.trim().toLowerCase(), hi);
    }
  }

  // Zostav zoznam zmien
  const changes = list
    .map((g) => {
      const key = g.name.trim().toLowerCase();
      const next = newIndex.get(key);
      return next == null ? null : { name: g.name, category: g.category, old: g.oldIndex, new: next, count: g.count };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null && c.new !== c.old)
    .sort((a, b) => b.count - a.count);

  if (!apply) {
    return NextResponse.json({
      ok: true,
      mode: "nahlad",
      distinctNames: list.length,
      scored: newIndex.size,
      willChange: changes.length,
      changes,
      hint: "Pre uloženie zopakuj s &apply=1",
    });
  }

  // Aplikuj: záznamy + obľúbené (+ vlastné potraviny)
  let updatedEntries = 0;
  for (const c of changes) {
    const r = await prisma.entry.updateMany({
      where: { ...where, name: { equals: c.name, mode: "insensitive" } },
      data: { healthIndex: c.new },
    });
    updatedEntries += r.count;
  }

  // Obľúbené (items JSON)
  let updatedFavorites = 0;
  const favorites = await prisma.favorite.findMany({ where, select: { id: true, items: true } });
  for (const f of favorites) {
    const items = Array.isArray(f.items) ? (f.items as any[]) : [];
    let changed = false;
    const nextItems = items.map((it) => {
      const key = String(it?.name ?? "").trim().toLowerCase();
      const ni = newIndex.get(key);
      if (ni != null && it?.healthIndex !== ni) {
        changed = true;
        return { ...it, healthIndex: ni };
      }
      return it;
    });
    if (changed) {
      await prisma.favorite.update({ where: { id: f.id }, data: { items: nextItems } });
      updatedFavorites++;
    }
  }

  // Vlastné potraviny používateľa (zdieľané/seed nechávame tak)
  let updatedFoods = 0;
  for (const c of changes) {
    const r = await prisma.food.updateMany({
      where: { userId: adminId, name: { equals: c.name, mode: "insensitive" } },
      data: { healthIndex: c.new },
    });
    updatedFoods += r.count;
  }

  return NextResponse.json({
    ok: true,
    mode: "aplikovane",
    changedNames: changes.length,
    updatedEntries,
    updatedFavorites,
    updatedFoods,
  });
}
