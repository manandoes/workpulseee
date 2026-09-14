/**
 * Service worker for Web Push (Phase 13).
 *
 * Deliberately minimal: this app is server-rendered and online-only, so there
 * is no caching or offline behaviour here to get wrong. The worker exists for
 * one reason — a push message can only be received by a service worker, and
 * only a service worker can show the notification.
 *
 * Registered on demand by `components/dashboard/notification-settings-form.tsx`
 * when somebody turns push on in this browser, never on page load: asking for
 * notification permission unprompted is the pattern browsers now penalise.
 *
 * The payload shape is `PushPayload` in `lib/push.ts`.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // A push we cannot parse is not worth showing a broken notification for.
    return;
  }

  const title = payload.title || "Talking Lens Media";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      /**
       * Collapses repeats of the same notification rather than stacking them:
       * a phone that was asleep through three deliveries should not wake up to
       * three copies of the same sentence.
       */
      tag: payload.notificationId || undefined,
      data: { link: payload.link || "/notifications" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link = (event.notification.data && event.notification.data.link) || "/";
  const url = new URL(link, self.location.origin).href;

  /**
   * Focus a tab already on the app rather than opening another one. People
   * leave this app open all day, and a notification that spawns a fourth copy
   * of the dashboard is a notification that gets turned off.
   */
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (new URL(client.url).origin === self.location.origin) {
            return client
              .focus()
              .then((focused) =>
                focused && "navigate" in focused
                  ? focused.navigate(url)
                  : focused
              );
          }
        }

        return self.clients.openWindow(url);
      })
  );
});
