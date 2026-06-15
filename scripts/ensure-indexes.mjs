// Jednorazové (idempotentné) zaistenie indexov, ktoré Prisma schema nevie vyjadriť.
// Trigramový GIN index zrýchli vyhľadávanie potravín cez ILIKE '%slovo%'
// (bežný B-tree index na to nestačí), takže referenčný výber pri AI spracovaní
// ostane rýchly aj pri veľkej tabuľke Food.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS food_name_trgm_idx ON "Food" USING gin (name gin_trgm_ops)`
  );
  console.log("✓ indexy zaistené (pg_trgm na Food.name)");
} catch (e) {
  // Nech zlyhanie (napr. chýbajúce práva) nezhodí build – appka funguje aj bez indexu.
  console.error("ensure-indexes preskočené (ignorované):", e?.message || e);
} finally {
  await prisma.$disconnect();
}
