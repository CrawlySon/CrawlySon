import webpush from "web-push";
import { prisma } from "./db";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("Chýbajú VAPID kľúče (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@nutriai.app", pub, priv);
  configured = true;
}

export type PushPayload = { title: string; body: string; url?: string };

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

// Pošle notifikáciu na všetky odbery; neplatné (404/410) zmaže.
export async function sendToSubs(subs: SubRow[], payload: PushPayload): Promise<number> {
  ensureConfigured();
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.error("push send error:", code, e?.body || e?.message);
        }
      }
    })
  );
  return sent;
}
