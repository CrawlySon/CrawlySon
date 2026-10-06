import { prisma } from "./db";
import { skToday } from "./coach";
import { UserFacingError } from "./errors";

// Denné limity AI volaní na používateľa. PREČO: doteraz nebol žiadny strop –
// jeden účet (alebo uniknutý registračný kód) = neobmedzený účet za OpenAI.
// Limity sú zámerne štedré pre bežné používanie (10–20 zápisov denne) a tvrdé
// voči skriptom. Kouč (comment) stíchne skôr než samotný zápis jedla.
export type AiKind = "parse" | "parse-photo" | "barcode-web" | "barcode-photo" | "comment" | "distill" | "summary" | "rescore";

const DAILY_LIMIT: Record<AiKind, number> = {
  parse: 80,
  "parse-photo": 25,
  "barcode-web": 30,
  "barcode-photo": 25,
  comment: 60,
  distill: 20,
  summary: 5, // cron – 1 denne, rezerva na opakovanie
  rescore: 10,
};
const DAILY_TOTAL = 180;

export const LIMITS = {
  parseTextChars: 2000,
  parseSections: 8,
  imageBase64Chars: 2_800_000, // ≈ 2,1 MB binárne – klient posiela ~1280 px JPEG, to je <0,5 MB
  imageMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

export type AiUsageInfo = { model: string; promptTokens: number; outputTokens: number; totalTokens: number };

// Vyhodí 429, ak používateľ dnes vyčerpal limit pre daný druh alebo celkový.
export async function checkAiQuota(userId: string, kind: AiKind): Promise<void> {
  const date = skToday();
  const [forKind, total] = await Promise.all([
    prisma.aiUsage.count({ where: { userId, kind, date } }),
    prisma.aiUsage.count({ where: { userId, date } }),
  ]);
  if (forKind >= DAILY_LIMIT[kind] || total >= DAILY_TOTAL) {
    throw new UserFacingError("Dnešný limit AI volaní je vyčerpaný. Zajtra to pôjde znova – dovtedy zapisuj z databázy alebo obľúbených.", 429);
  }
}

// Zapíše spotrebu (best-effort – chyba logu nesmie zhodiť odpoveď).
export async function logAiUsage(userId: string | null, kind: AiKind, usage: AiUsageInfo | null | undefined): Promise<void> {
  if (!usage) return;
  try {
    await prisma.aiUsage.create({
      data: {
        userId,
        kind,
        model: usage.model,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        date: skToday(),
      },
    });
  } catch (e) {
    console.error("aiUsage log error:", e);
  }
}

// Overí veľkosť a typ fotky posielanej do vision modelu.
export function checkImageInput(imageBase64: unknown, mimeType: unknown): { imageBase64: string; mimeType: string } {
  if (typeof imageBase64 !== "string" || !imageBase64.trim()) throw new UserFacingError("Chýba fotka.", 400);
  if (imageBase64.length > LIMITS.imageBase64Chars) throw new UserFacingError("Fotka je príliš veľká (max ~2 MB). Skús ju odfotiť znova.", 413);
  const mime = typeof mimeType === "string" && LIMITS.imageMimeTypes.includes(mimeType) ? mimeType : "image/jpeg";
  return { imageBase64: imageBase64.trim(), mimeType: mime };
}
