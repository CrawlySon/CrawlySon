import type { PrismaClient } from "@prisma/client";

// Hodnoty sú orientačné, na 100 g, zdroj: bežné nutričné tabuľky.
export type FoodSeed = {
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  baseGrams?: number;
};

export const FOODS: FoodSeed[] = [
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

  // --- Rozšírenie na ~100 základných potravín ---
  // Mäso a údeniny
  { name: "Kuracie stehno (pečené)", category: "Mäso", calories: 209, protein: 26, carbs: 0, fat: 11 },
  { name: "Morčacie prsia", category: "Mäso", calories: 135, protein: 30, carbs: 0, fat: 1 },
  { name: "Bravčový bôčik", category: "Mäso", calories: 518, protein: 9, carbs: 0, fat: 53 },
  { name: "Slanina údená", category: "Mäso", calories: 541, protein: 12, carbs: 0, fat: 53 },
  { name: "Párky", category: "Mäso", calories: 270, protein: 12, carbs: 2, fat: 24 },
  { name: "Saláma (gazdovská)", category: "Mäso", calories: 380, protein: 15, carbs: 1, fat: 35 },

  // Ryby a morské plody
  { name: "Makrela údená", category: "Ryby", calories: 305, protein: 19, carbs: 0, fat: 25 },
  { name: "Treska (filé, varené)", category: "Ryby", calories: 82, protein: 18, carbs: 0, fat: 0.7 },
  { name: "Krevety varené", category: "Ryby", calories: 99, protein: 24, carbs: 0, fat: 0.3 },

  // Mliečne a vajcia
  { name: "Kefír", category: "Mliečne", calories: 52, protein: 3.3, carbs: 4, fat: 2.5 },
  { name: "Grécky jogurt", category: "Mliečne", calories: 97, protein: 9, carbs: 4, fat: 5 },
  { name: "Cottage cheese", category: "Mliečne", calories: 98, protein: 11, carbs: 3.4, fat: 4.3 },
  { name: "Mozzarella", category: "Mliečne", calories: 280, protein: 22, carbs: 2, fat: 21 },
  { name: "Parmezán", category: "Mliečne", calories: 392, protein: 36, carbs: 3, fat: 26 },
  { name: "Smotana na varenie 12%", category: "Mliečne", calories: 127, protein: 3, carbs: 4, fat: 12 },
  { name: "Vaječný bielok", category: "Vajcia", calories: 52, protein: 11, carbs: 0.7, fat: 0.2 },

  // Pečivo a obilniny
  { name: "Chlieb celozrnný", category: "Pečivo", calories: 247, protein: 9, carbs: 41, fat: 3.4, fiber: 7 },
  { name: "Toastový chlieb", category: "Pečivo", calories: 265, protein: 8, carbs: 49, fat: 3.2, fiber: 2.5 },
  { name: "Croissant", category: "Pečivo", calories: 406, protein: 8, carbs: 45, fat: 21, fiber: 2.6 },
  { name: "Müsli", category: "Obilniny", calories: 367, protein: 10, carbs: 66, fat: 6, fiber: 8 },
  { name: "Kuskus varený", category: "Príloha", calories: 112, protein: 3.8, carbs: 23, fat: 0.2, fiber: 1.4 },
  { name: "Quinoa varená", category: "Príloha", calories: 120, protein: 4.4, carbs: 21, fat: 1.9, fiber: 2.8 },
  { name: "Bulgur varený", category: "Príloha", calories: 83, protein: 3, carbs: 19, fat: 0.2, fiber: 4.5 },
  { name: "Ryža basmati varená", category: "Príloha", calories: 121, protein: 3, carbs: 25, fat: 0.4, fiber: 0.6 },
  { name: "Gnocchi", category: "Príloha", calories: 160, protein: 4, carbs: 33, fat: 1 },

  // Ovocie
  { name: "Pomaranč", category: "Ovocie", calories: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4 },
  { name: "Hrozno", category: "Ovocie", calories: 69, protein: 0.7, carbs: 18, fat: 0.2, fiber: 0.9 },
  { name: "Jahody", category: "Ovocie", calories: 32, protein: 0.7, carbs: 7.7, fat: 0.3, fiber: 2 },
  { name: "Čučoriedky", category: "Ovocie", calories: 57, protein: 0.7, carbs: 14, fat: 0.3, fiber: 2.4 },
  { name: "Hruška", category: "Ovocie", calories: 57, protein: 0.4, carbs: 15, fat: 0.1, fiber: 3.1 },
  { name: "Mandarínka", category: "Ovocie", calories: 53, protein: 0.8, carbs: 13, fat: 0.3, fiber: 1.8 },
  { name: "Avokádo", category: "Ovocie", calories: 160, protein: 2, carbs: 9, fat: 15, fiber: 7 },
  { name: "Vodný melón", category: "Ovocie", calories: 30, protein: 0.6, carbs: 8, fat: 0.2, fiber: 0.4 },

  // Zelenina
  { name: "Brokolica varená", category: "Zelenina", calories: 35, protein: 2.4, carbs: 7, fat: 0.4, fiber: 3.3 },
  { name: "Špenát", category: "Zelenina", calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  { name: "Paprika červená", category: "Zelenina", calories: 31, protein: 1, carbs: 6, fat: 0.3, fiber: 2.1 },
  { name: "Cibuľa", category: "Zelenina", calories: 40, protein: 1.1, carbs: 9, fat: 0.1, fiber: 1.7 },
  { name: "Cuketa", category: "Zelenina", calories: 17, protein: 1.2, carbs: 3.1, fat: 0.3, fiber: 1 },
  { name: "Kukurica sladká", category: "Zelenina", calories: 86, protein: 3.3, carbs: 19, fat: 1.2, fiber: 2.7 },
  { name: "Kyslá kapusta", category: "Zelenina", calories: 19, protein: 0.9, carbs: 4.3, fat: 0.1, fiber: 2.9 },
  { name: "Huby (šampiňóny)", category: "Zelenina", calories: 22, protein: 3.1, carbs: 3.3, fat: 0.3, fiber: 1 },

  // Strukoviny a orechy/semená
  { name: "Cícer varený", category: "Strukoviny", calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6 },
  { name: "Hrach varený", category: "Strukoviny", calories: 84, protein: 5.4, carbs: 14, fat: 0.4, fiber: 5.5 },
  { name: "Vlašské orechy", category: "Orechy", calories: 654, protein: 15, carbs: 14, fat: 65, fiber: 6.7 },
  { name: "Kešu", category: "Orechy", calories: 553, protein: 18, carbs: 30, fat: 44, fiber: 3.3 },
  { name: "Slnečnicové semienka", category: "Orechy", calories: 584, protein: 21, carbs: 20, fat: 51, fiber: 8.6 },
  { name: "Arašidové maslo", category: "Orechy", calories: 588, protein: 25, carbs: 20, fat: 50, fiber: 6 },

  // Tuky a sladké
  { name: "Slnečnicový olej", category: "Tuky", calories: 884, protein: 0, carbs: 0, fat: 100 },
  { name: "Nutella", category: "Sladké", calories: 539, protein: 6, carbs: 57, fat: 31 },
  { name: "Sušienky (maslové)", category: "Sladké", calories: 480, protein: 6, carbs: 64, fat: 22 },
  { name: "Zmrzlina vanilková", category: "Sladké", calories: 207, protein: 3.5, carbs: 24, fat: 11 },
  { name: "Croissant čokoládový", category: "Sladké", calories: 467, protein: 8, carbs: 46, fat: 27 },
  { name: "Proteínová tyčinka", category: "Sladké", calories: 350, protein: 32, carbs: 35, fat: 9 },

  // Hotové jedlá / fast food
  { name: "Špagety bolognese", category: "Hotové jedlo", calories: 150, protein: 7, carbs: 18, fat: 5 },
  { name: "Kuracie kari s ryžou", category: "Hotové jedlo", calories: 140, protein: 8, carbs: 16, fat: 5 },
  { name: "Hamburger (fast food)", category: "Fast food", calories: 250, protein: 13, carbs: 30, fat: 9 },
  { name: "Cheeseburger (fast food)", category: "Fast food", calories: 280, protein: 15, carbs: 30, fat: 12 },
  { name: "Kebab v pite", category: "Fast food", calories: 215, protein: 12, carbs: 18, fat: 11 },
  { name: "Hot dog", category: "Fast food", calories: 290, protein: 10, carbs: 24, fat: 17 },
  { name: "Sushi (losos maki)", category: "Hotové jedlo", calories: 145, protein: 5, carbs: 28, fat: 1.5 },
  { name: "Zemiakový šalát", category: "Hotové jedlo", calories: 190, protein: 2.5, carbs: 14, fat: 14 },

  // Nápoje
  { name: "Mlieko plnotučné", category: "Nápoje", calories: 64, protein: 3.3, carbs: 4.8, fat: 3.6 },
  { name: "Energetický nápoj", category: "Nápoje", calories: 45, protein: 0, carbs: 11, fat: 0 },
  { name: "Víno červené", category: "Nápoje", calories: 85, protein: 0.1, carbs: 2.6, fat: 0 },
  { name: "Čaj (bez cukru)", category: "Nápoje", calories: 1, protein: 0, carbs: 0.2, fat: 0 },
  { name: "Proteínový kokteil (voda)", category: "Nápoje", calories: 45, protein: 9, carbs: 1, fat: 0.5 },
];

// Orientačný index zdravosti podľa kategórie (0..10) pre seed potraviny.
const HEALTH_BY_CATEGORY: Record<string, number> = {
  Ovocie: 9,
  Zelenina: 9,
  Strukoviny: 8,
  Ryby: 8,
  Vajcia: 7,
  Orechy: 7,
  Obilniny: 7,
  Mliečne: 6,
  Mäso: 5,
  Príloha: 5,
  Pečivo: 4,
  Tuky: 4,
  "Hotové jedlo": 4,
  "Fast food": 2,
  Nápoje: 4,
  Sladké: 2,
};

// Idempotentne naplní profil a referenčné potraviny. Vráti počet pridaných potravín.
export async function seedDatabase(prisma: PrismaClient): Promise<{ added: number; total: number }> {
  await prisma.profile.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  let added = 0;
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
        healthIndex: HEALTH_BY_CATEGORY[f.category] ?? 5,
        source: "seed",
      },
    });
    added++;
  }
  const total = await prisma.food.count();
  return { added, total };
}
