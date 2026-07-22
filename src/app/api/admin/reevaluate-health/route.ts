import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/server-auth";
import { scoreHealthBatch } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// Jednorazové prehodnotenie zdravosti existujúcich záznamov podľa nových pravidiel.
//   GET /api/admin/reevaluate-health            -> NÁHĽAD (nič nezapíše)
//   GET /api/admin/reevaluate-health?apply=1    -> APLIKUJE zmeny
// Autorizácia: prihlásený admin, alebo ?secret=CRON_SECRET.
async function authorize(req: Request): Promise<{ ok: true; userId: string | null } | { ok: false }> {
  const secret = process.env.CRON_SECRET;
  const provided = new URL(req.url).searchParams.get("secret");
  if (secret && provided === secret) return { ok: true, userId: null }; // secret => všetci používatelia

  const userId = await getUserId();
  if (!userId) return { ok: false };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role !== "admin") return { ok: false };
  return { ok: true, userId }; // admin => jeho vlastné záznamy
}

const BATCH = 50;

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Neautorizované (admin alebo ?secret=)." }, { status: 401 });

  const apply = new URL(req.url).searchParams.get("apply") === "1";
  const where = auth.userId ? { userId: auth.userId } : {};

  // Distinct názvy záznamov + reprezentatívna kategória a doterajší index
  const entries = await prisma.entry.findMany({
    where,
    select: { name: true, category: true, healthIndex: true },
  });

  type Grp = { name: string; category: string | null; oldIndex: number | null; count: number };
  const groups = new Map<string, Grp>();
  for (const e of entries) {
    const key = e.name.trim().toLowerCase();
    const g = groups.get(key);
    if (g) {
      g.count++;
      if (g.category == null && e.category) g.category = e.category;
      if (g.oldIndex == null && e.healthIndex != null) g.oldIndex = e.healthIndex;
    } else {
      groups.set(key, { name: e.name.trim(), category: e.category, oldIndex: e.healthIndex, count: 1 });
    }
  }

  const list = Array.from(groups.values());
  if (list.length === 0) return NextResponse.json({ ok: true, message: "Žiadne záznamy.", changes: [] });

  // Dávkové ohodnotenie cez AI
  const newIndex = new Map<string, number>(); // key (lowercased name) -> nový index
  for (let i = 0; i < list.length; i += BATCH) {
    const slice = list.slice(i, i + BATCH);
    const scores = await scoreHealthBatch(slice.map((g) => ({ name: g.name, category: g.category })));
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
  const favWhere = auth.userId ? { userId: auth.userId } : {};
  const favorites = await prisma.favorite.findMany({ where: favWhere, select: { id: true, items: true } });
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
  if (auth.userId) {
    for (const c of changes) {
      const r = await prisma.food.updateMany({
        where: { userId: auth.userId, name: { equals: c.name, mode: "insensitive" } },
        data: { healthIndex: c.new },
      });
      updatedFoods += r.count;
    }
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
