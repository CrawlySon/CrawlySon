// Spustí `prisma migrate deploy` pri builde (Vercel) aj lokálne.
//
// PREČO nie priamo v package.json: schéma používa `directUrl = env("DIRECT_URL")`
// (migrácie potrebujú spojenie bez transaction poolera). Ak DIRECT_URL nie je
// nastavený, použije sa DATABASE_URL – tak build nespadne na chýbajúcej premennej
// a zároveň si hosting môže nastaviť osobitné priame spojenie.
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.error("migrate: chýba DATABASE_URL");
  process.exit(1);
}
process.env.DIRECT_URL ||= process.env.DATABASE_URL;

const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
