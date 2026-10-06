// Service worker pre Web Push notifikácie (Rypák)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Rypák", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Rypák";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
    vibrate: [80, 40, 80],
    // Rovnaký tag = novšia notifikácia nahradí staršiu (pripomienky vody sa nekopia).
    tag: data.tag || "rypak",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Ťuknutie na notifikáciu: ak už je okno appky otvorené, len ho zameraj
// (a presuň na cieľovú stránku, ak je iná) – bez vynúteného reloadu, ktorý by
// zahodil rozpracovaný zápis. Inak otvor nové okno.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      const win = list.find((c) => c.url.startsWith(self.location.origin));
      if (win) {
        try {
          if (win.url !== target && "navigate" in win) await win.navigate(target);
        } catch (e) {
          /* nekontrolované okno nemusí dovoliť navigate – stačí focus */
        }
        return win.focus();
      }
      return clients.openWindow(target);
    })
  );
});

// Prehliadač môže odber obnoviť (nový endpoint) – bez tohto by sa starý potichu
// stratil a notifikácie by prestali chodiť. Nový odber pošleme na server.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/api/push/vapid");
        const { key } = await res.json();
        if (!key) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
      } catch (e) {
        /* best effort */
      }
    })()
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
