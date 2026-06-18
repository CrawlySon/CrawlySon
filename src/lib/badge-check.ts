// Klientsky pomocník: zistí stav odznakov a pri novo odomknutom odznaku
// ukáže in-app toast. Volá sa po akciách, ktoré menia dáta (pridanie jedla,
// vody, obľúbeného) a pri štarte stránky Dnes (na založenie základnej línie).
import { api } from "./api";
import { getCache, setCache } from "./page-cache";
import { showToast } from "./toast";
import type { Badge, Streak } from "./types";

type BadgesData = { badges: Badge[]; streaks: Streak[]; earnedCount: number; total: number };

export async function checkBadges(): Promise<void> {
  const prev = getCache<BadgesData>("badges");
  let data: BadgesData;
  try {
    data = await api.getBadges();
  } catch {
    return;
  }
  setCache("badges", data);

  // Pri úplne prvom načítaní (žiadny predošlý stav) netoastujeme – inak by
  // sa naraz vysypali všetky historicky splnené odznaky.
  if (!prev) return;

  const prevEarned = new Set(prev.badges.filter((b) => b.earned).map((b) => b.key));
  for (const b of data.badges) {
    if (b.earned && !prevEarned.has(b.key)) {
      showToast({ emoji: b.emoji, title: `Nový odznak: ${b.title}`, body: b.desc });
    }
  }
}
