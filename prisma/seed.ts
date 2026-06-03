import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Hodnoty sú orientačné, na 100 g (resp. baseGrams), zdroj: bežné nutričné tabuľky.
type Seed = {
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  baseGrams?: number;
};

const FOODS: Seed[] = [
  // Mäso a ryby
  { name: "Kuracie prsia (pečené)", category: "Mäso", calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: "Bravčová sviečková (pečená)", category: "Mäso", calories: 242, protein: 27, carbs: 0, fat: 14 },
  { name: "Hovädzie (chudé, varené)", category: "Mäso", calories: 217, protein: 26, carbs: 0, fat: 12 },
  { name: "Mleté mäso bravčovo-hovädzie", category: "Mäso", calories: 250, protein: 18, carbs: 0, fat: 20 },
  { name: "Losos (pečený)", category: "Ryby", calories: 208, protein: 20, carbs: 0, fat: 13 },
  { name: "Tuniak vo vlastnej šťave", category: "Ryby", calories: 116, protein: 26, carbs: 0, fat: 1 },
  { name: "Šunka kuracia", category: "Mäso", calories: 110, protein: 18, carbs: 1, fat: 3.5 },
  { name: "Klobása", category: "Mäso", calories: 330, protein: 14, carbs: 2, fat: 30 },

  // Prílohy a obilniny
  { name: "Knedľa (houskový)", category: "Príloha", calories: 215, protein: 7, carbs: 43, fat: 1.5, fiber: 2 },
  { name: "Ryža varená", category: "Príloha", calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
  { name: "Zemiaky varené", category: "Príloha", calories: 87, protein: 2, carbs: 20, fat: 0.1, fiber: 1.8 },
  { name: "Zemiaková kaša", category: "Príloha", calories: 110, protein: 2, carbs: 16, fat: 4 },
  { name: "Cestoviny varené", category: "Príloha", calories: 158, protein: 6, carbs: 31, fat: 0.9, fiber: 1.8 },
  { name: "Hranolky", category: "Príloha", calories: 312, protein: 3.4, carbs: 41, fat: 15, fiber: 3.8 },
  { name: "Chlieb ražný", category: "Pečivo", calories: 250, protein: 8, carbs: 48, fat: 1.5, fiber: 6 },
  { name: "Rožok biely", category: "Pečivo", calories: 290, protein: 9, carbs: 56, fat: 3, fiber: 3 },
  { name: "Ovsené vločky", category: "Obilniny", calories: 379, protein: 13, carbs: 67, fat: 7, fiber: 10 },

  // Mliečne
  { name: "Mlieko polotučné", category: "Mliečne", calories: 47, protein: 3.3, carbs: 4.8, fat: 1.5 },
  { name: "Jogurt biely", category: "Mliečne", calories: 61, protein: 3.5, carbs: 4.7, fat: 3.3 },
  { name: "Tvaroh polotučný", category: "Mliečne", calories: 130, protein: 18, carbs: 4, fat: 4.5 },
  { name: "Syr eidam 30%", category: "Mliečne", calories: 280, protein: 28, carbs: 1, fat: 18 },
  { name: "Maslo", category: "Tuky", calories: 717, protein: 0.8, carbs: 0.6, fat: 81 },
  { name: "Vajce (1 ks ~60 g)", category: "Vajcia", calories: 143, protein: 13, carbs: 1.1, fat: 9.5 },

  // Ovocie a zelenina
  { name: "Jablko", category: "Ovocie", calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4 },
  { name: "Banán", category: "Ovocie", calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6 },
  { name: "Paradajka", category: "Zelenina", calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  { name: "Uhorka", category: "Zelenina", calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5 },
  { name: "Mrkva", category: "Zelenina", calories: 41, protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8 },
  { name: "Zeleninový šalát (miešaný)", category: "Zelenina", calories: 25, protein: 1.2, carbs: 4, fat: 0.3, fiber: 1.8 },

  // Strukoviny a orechy
  { name: "Šošovica varená", category: "Strukoviny", calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 8 },
  { name: "Fazuľa varená", category: "Strukoviny", calories: 127, protein: 8.7, carbs: 22, fat: 0.5, fiber: 6.4 },
  { name: "Arašidy", category: "Orechy", calories: 567, protein: 26, carbs: 16, fat: 49, fiber: 8.5 },
  { name: "Mandle", category: "Orechy", calories: 579, protein: 21, carbs: 22, fat: 50, fiber: 12.5 },

  // Tuky a sladké
  { name: "Olivový olej", category: "Tuky", calories: 884, protein: 0, carbs: 0, fat: 100 },
  { name: "Cukor", category: "Sladké", calories: 387, protein: 0, carbs: 100, fat: 0 },
  { name: "Med", category: "Sladké", calories: 304, protein: 0.3, carbs: 82, fat: 0 },
  { name: "Mliečna čokoláda", category: "Sladké", calories: 535, protein: 7.6, carbs: 59, fat: 30, fiber: 3.4 },

  // Typické slovenské jedlá (hodnoty na 100 g hotového jedla)
  { name: "Sviečková na smotane (omáčka)", category: "Hotové jedlo", calories: 130, protein: 4, carbs: 9, fat: 8 },
  { name: "Bryndzové halušky", category: "Hotové jedlo", calories: 170, protein: 6, carbs: 22, fat: 7, fiber: 1.5 },
  { name: "Guláš hovädzí", category: "Hotové jedlo", calories: 130, protein: 11, carbs: 6, fat: 7 },
  { name: "Vyprážaný rezeň bravčový", category: "Hotové jedlo", calories: 280, protein: 18, carbs: 12, fat: 18 },
  { name: "Pizza (margherita)", category: "Hotové jedlo", calories: 266, protein: 11, carbs: 33, fat: 10, fiber: 2.3 },
  { name: "Kapustnica", category: "Hotové jedlo", calories: 75, protein: 4, carbs: 6, fat: 4, fiber: 2 },

  // Nápoje
  { name: "Pivo svetlé (12°)", category: "Nápoje", calories: 43, protein: 0.5, carbs: 3.5, fat: 0 },
  { name: "Coca-Cola", category: "Nápoje", calories: 42, protein: 0, carbs: 10.6, fat: 0 },
  { name: "Pomarančový džús", category: "Nápoje", calories: 45, protein: 0.7, carbs: 10, fat: 0.2 },
  { name: "Káva čierna (bez cukru)", category: "Nápoje", calories: 2, protein: 0.1, carbs: 0, fat: 0 },
];

async function main() {
  console.log("Seeding profil…");
  await prisma.profile.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  console.log(`Seeding ${FOODS.length} potravín…`);
  for (const f of FOODS) {
    const existing = await prisma.food.findFirst({ where: { name: f.name } });
    if (existing) continue;
    await prisma.food.create({
      data: {
        name: f.name,
        category: f.category,
        baseGrams: f.baseGrams ?? 100,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
        fiber: f.fiber ?? null,
      },
    });
  }
  console.log("Hotovo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
