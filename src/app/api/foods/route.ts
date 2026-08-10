import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

// GET /api/foods?q=...  -> vyhľadávanie v zdieľanej + vlastnej databáze
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const scope = searchParams.get("scope") || "all"; // mine | global | all
  // Voliteľný typ jedla – posunie hore to, čo si doň naposledy pridával.
  const meal = (searchParams.get("meal") || "").trim();

  const visibility =
    scope === "mine" ? { userId } : scope === "global" ? { userId: null } : { OR: [{ userId: null }, { userId }] };
  const matchQ = (where: any) => (q ? { AND: [where, { name: { contains: q, mode: "insensitive" as const } }] } : where);

  const foods = await prisma.food.findMany({
    where: matchQ(visibility),
    orderBy: { name: "asc" },
    take: 200,
  });

  // Naposledy pridané položky v rámci daného jedla dňa (najnovšie prvé).
  // Doťahujeme ich zvlášť, aby sa dostali hore aj vtedy, keď by sa do
  // abecedného výrezu 200 potravín vôbec nezmestili.
  const recentRank = new Map<string, number>();
  if (meal) {
    const recent = await prisma.entry.groupBy({
      by: ["name"],
      where: { userId, mealType: meal },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 25,
    });
    recent.forEach((r, i) => recentRank.set(r.name.toLowerCase(), i));

    const recentNames = recent.map((r) => r.name);
    if (recentNames.length) {
      const recentFoods = await prisma.food.findMany({
        where: matchQ({ AND: [visibility, { name: { in: recentNames } }] }),
        take: 50,
      });
      const seen = new Set(foods.map((f) => f.id));
      for (const f of recentFoods) if (!seen.has(f.id)) foods.push(f);
    }
  }

  // Koľkokrát používateľ daný názov použil vo svojich záznamoch.
  // Zoskupujeme len cez názvy práve nájdených potravín (max 200), nie cez
  // celý denník – to drží dotaz rýchly aj pri tisíckach záznamov.
  const names = foods.map((f) => f.name);
  const usage = names.length
    ? await prisma.entry.groupBy({
        by: ["name"],
        where: { userId, name: { in: names } },
        _count: { _all: true },
      })
    : [];

  const useMap = new Map<string, number>();
  for (const u of usage) useMap.set(u.name.toLowerCase(), u._count._all);

  // Zoradenie: najprv naposledy pridané do tohto jedla dňa (najnovšie hore),
  // potom najpoužívanejšie (u mňa) a nakoniec abecedne.
  foods.sort((a, b) => {
    const ra = recentRank.get(a.name.toLowerCase());
    const rb = recentRank.get(b.name.toLowerCase());
    if (ra !== rb) {
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    }
    const ua = useMap.get(a.name.toLowerCase()) || 0;
    const ub = useMap.get(b.name.toLowerCase()) || 0;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name, "sk");
  });

  const withUse = foods.map((f) => ({
    ...f,
    useCount: useMap.get(f.name.toLowerCase()) || 0,
    recentForMeal: recentRank.has(f.name.toLowerCase()),
  }));
  return NextResponse.json({ foods: withUse });
}

// POST /api/foods -> pridá vlastnú (súkromnú) potravinu
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Neprihlásený" }, { status: 401 });

  const b = await req.json();
  if (!b.name) return NextResponse.json({ error: "Chýba názov." }, { status: 400 });
  const food = await prisma.food.create({
    data: {
      userId,
      name: String(b.name),
      barcode: b.barcode ? String(b.barcode) : null,
      category: b.category ? String(b.category) : null,
      subcategory: b.subcategory ? String(b.subcategory) : null,
      baseGrams: b.baseGrams ? Number(b.baseGrams) : 100,
      calories: Math.max(0, Number(b.calories || 0)),
      protein: Math.max(0, Number(b.protein || 0)),
      carbs: Math.max(0, Number(b.carbs || 0)),
      fat: Math.max(0, Number(b.fat || 0)),
      fiber: b.fiber != null ? Number(b.fiber) : null,
      healthIndex: b.healthIndex != null && b.healthIndex !== "" ? Number(b.healthIndex) : null,
      source: "manual",
    },
  });
  return NextResponse.json({ food });
}
