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

  const title = payload.title || "WorkPulse";
  const actions = Array.isArray(payload.actions) ? payload.actions : [];

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
      /**
       * Only the button's own identifier and label go to the browser; the
       * endpoint each one posts to is kept in `data` and looked up on click,
       * since `actions` entries are a fixed shape the browser defines.
       */
      actions: actions.map((entry) => ({
        action: entry.action,
        title: entry.title,
      })),
      /**
       * A reminder that can be answered should not vanish the moment the
       * screen is glanced at — it stays until it is acted on, or until the
       * next delivery replaces it by `tag`.
       */
      requireInteraction: actions.length > 0,
      data: { link: payload.link || "/notifications", actions: actions },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};

  /**
   * A button was pressed rather than the notification body. Answer it from
   * here with a same-origin POST — the session cookie rides along, so the
   * route authenticates it exactly as it would from a tab — and do not open
   * a window: the whole point of the button is not having to.
   *
   * A failure is swallowed deliberately. There is no UI here to report into,
   * and every action these buttons take is also available in the app; the
   * server-side sweep is what guarantees the outcome either way.
   */
  if (event.action) {
    const chosen = (data.actions || []).find(
      (entry) => entry.action === event.action
    );

    if (chosen && chosen.endpoint) {
      event.waitUntil(
        fetch(new URL(chosen.endpoint, self.location.origin).href, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }).catch(() => undefined)
      );
      return;
    }
  }

  const link = data.link || "/";
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
