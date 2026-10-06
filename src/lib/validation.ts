import { z } from "zod";
import { isISODate } from "./dates";
import { UserFacingError } from "./errors";

// Spoločné schémy vstupov pre API. Doteraz sa všade robilo `String()`/`Number()`
// bez kontroly: do DB sa dostal NaN, nezmyselný dátum rozbil rozsahové dotazy
// a nesprávny JSON hodil 500. Tu je jedna pravda pre dátum, čísla a enumy.

export const MEAL_TYPES = ["breakfast", "snack", "lunch", "afternoon", "dinner", "supper", "other"] as const;
export const mealTypeSchema = z.enum(MEAL_TYPES);

export const isoDateSchema = z
  .string()
  .refine(isISODate, { message: "Dátum musí byť v tvare YYYY-MM-DD." });

// Konečné číslo; `min`/`max` ohraničia rozsah, inak len vylúči NaN/Infinity.
export const finite = (opts: { min?: number; max?: number } = {}) =>
  z
    .number()
    .finite()
    .refine((n) => (opts.min == null || n >= opts.min) && (opts.max == null || n <= opts.max), {
      message: "Číslo mimo povoleného rozsahu.",
    });

// Čísla často prídu ako reťazce z inputov – prijmeme oboje, výsledok je number.
export const numberish = (opts: { min?: number; max?: number } = {}) =>
  z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    if (typeof v === "string") return Number(v.replace(",", "."));
    return v;
  }, finite(opts).optional());

export const nullableNumberish = (opts: { min?: number; max?: number } = {}) =>
  z.preprocess((v) => {
    if (v === "" || v === undefined) return null;
    if (typeof v === "string") return Number(v.replace(",", "."));
    return v;
  }, finite(opts).nullable());

const MAX_NAME = 200;
export const nameSchema = z.string().trim().min(1).max(MAX_NAME);
export const optionalText = (max: number) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().trim().max(max).nullable());

// Jedna položka jedla tak, ako ju posiela klient (návrh z AI, DB, obľúbené…).
export const foodItemSchema = z.object({
  name: nameSchema.catch("Jedlo"),
  quantityGrams: nullableNumberish({ min: 0, max: 20000 }).catch(null),
  calories: numberish({ min: 0, max: 20000 }).catch(0).transform((n) => n ?? 0),
  protein: numberish({ min: 0, max: 2000 }).catch(0).transform((n) => n ?? 0),
  carbs: numberish({ min: 0, max: 2000 }).catch(0).transform((n) => n ?? 0),
  fat: numberish({ min: 0, max: 2000 }).catch(0).transform((n) => n ?? 0),
  fiber: nullableNumberish({ min: 0, max: 500 }).catch(null),
  category: optionalText(80).catch(null),
  subcategory: optionalText(80).catch(null),
  healthIndex: nullableNumberish({ min: 0, max: 10 }).catch(null),
  note: optionalText(500).catch(null),
  mealType: mealTypeSchema.optional().catch(undefined),
});
export type FoodItemInput = z.infer<typeof foodItemSchema>;

// Prečíta JSON telo; pri chybnom JSON-e vráti zrozumiteľnú 400 namiesto 500.
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new UserFacingError("Neplatná požiadavka (JSON).", 400);
  }
}

// Vyparsuje telo podľa schémy; ZodError nechá prejsť do apiError (→ 400).
export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  const raw = await readJson(req);
  return schema.parse(raw);
}

// Dátum z query/tela: platný ISO dátum alebo fallback (dnešok klienta/servera).
export function dateOr(value: unknown, fallback: string): string {
  return isISODate(value) ? value : fallback;
}

export function requireDate(value: unknown): string {
  if (!isISODate(value)) throw new UserFacingError("Dátum musí byť v tvare YYYY-MM-DD.", 400);
  return value;
}
