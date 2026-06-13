import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../src/lib/foodSeed";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding profil + potraviny…");
  const { added, total } = await seedDatabase(prisma);
  console.log(`Hotovo. Pridaných ${added}, celkovo ${total} potravín.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
