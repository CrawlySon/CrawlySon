import { timingSafeEqual } from "node:crypto";

// Autorizácia cron endpointov (/api/cron/*), ktoré middleware zámerne púšťa
// bez prihlásenia. PREČO fail-closed: pôvodne „bez CRON_SECRET povolíme“ –
// na verejnom repe to znamenalo, že ktokoľvek vedel spustiť push všetkým
// používateľom a platené AI volania. Teraz: bez tajomstva 401 a jasný log.
// Tajomstvo sa prijíma LEN v hlavičke Authorization (nie v URL – končilo by
// v logoch a histórii prehliadača) a porovnáva sa v konštantnom čase.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET nie je nastavený – cron endpointy odmietajú všetky požiadavky.");
    return false;
  }
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return secretsEqual(provided, secret);
}

export function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}
