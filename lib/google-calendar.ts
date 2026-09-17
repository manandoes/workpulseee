/**
 * Google Calendar access (Plan.md Phase 17), read + write.
 *
 * Plain `fetch` against Google's REST endpoints rather than the `googleapis`
 * package — ~50MB of surface for a handful of HTTPS calls, which Rules.md
 * section 1 rules out (the same reasoning `lib/mailer.ts`/`lib/whatsapp.ts`
 * already follow for their own providers).
 *
 * Access tokens are never stored: every call exchanges the stored refresh
 * token for a fresh access token first. That costs one extra round trip per
 * call, but needs no token-expiry bookkeeping at all — the simplest correct
 * option for a feature that calls Google a handful of times, not per request.
 *
 * Booking/cancelling a WorkPulse `Meeting` mirrors it onto the organizer's own
 * Google Calendar (`createEvent`/`deleteEvent`) when they are connected — the
 * WorkPulse `Meeting` row stays the source of truth, so booking still works
 * for colleagues who never connected Google at all.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const FREEBUSY_ENDPOINT = "https://www.googleapis.com/calendar/v3/freeBusy";

const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

// `openid email` alongside the calendar scope so the connect flow can learn
// which Google address was just connected. `calendar.events` (not the
// broader `calendar` scope) is the least-privilege grant that still lets
// WorkPulse create/delete events it books — it cannot touch calendar
// settings or other calendars (Plan.md's confirmed decision).
const SCOPE =
  "openid email https://www.googleapis.com/auth/calendar.events";

function clientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/** The consent-screen URL to send someone to, carrying our signed `state`. */
export function buildAuthUrl(state: string): string | null {
  const credentials = clientCredentials();
  if (!credentials) return null;

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", credentials.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  // Guarantees a refresh token on first connect; without both, Google only
  // hands one back the very first time an account ever consents at all.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export type ExchangedTokens = { refreshToken: string; accessToken: string };

/** Trade a one-time OAuth `code` for a refresh token, never throws. */
export async function exchangeCode(
  code: string
): Promise<ExchangedTokens | null> {
  const credentials = clientCredentials();
  if (!credentials) return null;

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: credentials.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      console.error("[google-calendar] Code exchange rejected", {
        status: response.status,
      });
      return null;
    }

    const body = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!body.access_token || !body.refresh_token) return null;

    return { accessToken: body.access_token, refreshToken: body.refresh_token };
  } catch (cause) {
    console.error("[google-calendar] Could not reach Google's token endpoint", {
      cause,
    });
    return null;
  }
}

/** Trade a stored refresh token for a fresh access token, never throws. */
export async function refreshAccessToken(
  refreshToken: string
): Promise<string | null> {
  const credentials = clientCredentials();
  if (!credentials) return null;

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error("[google-calendar] Token refresh rejected", {
        status: response.status,
      });
      return null;
    }

    const body = (await response.json()) as { access_token?: string };
    return body.access_token ?? null;
  } catch (cause) {
    console.error("[google-calendar] Could not reach Google's token endpoint", {
      cause,
    });
    return null;
  }
}

export type GoogleEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location: string | null;
};

/** The signed-in person's own events, with titles. Never throws. */
export async function listOwnEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date
): Promise<GoogleEvent[]> {
  try {
    const url = new URL(EVENTS_ENDPOINT);
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      console.error("[google-calendar] events.list rejected", {
        status: response.status,
      });
      return [];
    }

    const body = (await response.json()) as {
      items?: {
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        location?: string;
      }[];
    };

    return (body.items ?? [])
      .map((item) => {
        const start = item.start?.dateTime ?? item.start?.date;
        const end = item.end?.dateTime ?? item.end?.date;
        if (!start || !end) return null;
        return {
          id: item.id,
          title: item.summary ?? "(No title)",
          start: new Date(start),
          end: new Date(end),
          location: item.location ?? null,
        };
      })
      .filter((event): event is GoogleEvent => event !== null);
  } catch (cause) {
    console.error("[google-calendar] Could not reach Google's events API", {
      cause,
    });
    return [];
  }
}

/** The Google account's own email address, for `GoogleCalendarConnection.googleEmail`. */
export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { email?: string };
    return body.email ?? null;
  } catch (cause) {
    console.error("[google-calendar] Could not reach Google's userinfo API", {
      cause,
    });
    return null;
  }
}

export type BusyOnly = { start: Date; end: Date };

/**
 * Busy intervals for a set of Google emails, no titles. Per Google's own
 * `freeBusy` contract, a calendar that hasn't shared free/busy with the
 * caller comes back with an `errors` entry rather than failing the whole
 * request — that calendar is simply treated as "no data available", not an
 * error, which is the right degradation for a colleague who hasn't shared
 * visibility. Never throws.
 */
export async function queryFreeBusy(
  accessToken: string,
  emails: readonly string[],
  timeMin: Date,
  timeMax: Date
): Promise<Record<string, BusyOnly[]>> {
  if (emails.length === 0) return {};

  try {
    const response = await fetch(FREEBUSY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: emails.map((email) => ({ id: email })),
      }),
    });

    if (!response.ok) {
      console.error("[google-calendar] freeBusy rejected", {
        status: response.status,
      });
      return {};
    }

    const body = (await response.json()) as {
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    };

    const result: Record<string, BusyOnly[]> = {};
    for (const [email, calendar] of Object.entries(body.calendars ?? {})) {
      result[email] = (calendar.busy ?? []).map((slot) => ({
        start: new Date(slot.start),
        end: new Date(slot.end),
      }));
    }
    return result;
  } catch (cause) {
    console.error("[google-calendar] Could not reach Google's freeBusy API", {
      cause,
    });
    return {};
  }
}

export type GoogleEventInput = {
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  location: string | null;
  attendeeEmails: readonly string[];
};

/**
 * Create an event on the organizer's own primary Google Calendar, inviting
 * any attendees who have their own Google email on file. `sendUpdates=all`
 * so those attendees actually receive Google's own invite email. Returns the
 * new event's id, or `null` on any failure — the caller treats this as
 * best-effort and never lets it block the WorkPulse-side booking.
 */
export async function createEvent(
  accessToken: string,
  event: GoogleEventInput
): Promise<string | null> {
  try {
    const url = new URL(EVENTS_ENDPOINT);
    url.searchParams.set("sendUpdates", "all");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description ?? undefined,
        location: event.location ?? undefined,
        start: { dateTime: event.start.toISOString() },
        end: { dateTime: event.end.toISOString() },
        attendees: event.attendeeEmails.map((email) => ({ email })),
      }),
    });

    if (!response.ok) {
      console.error("[google-calendar] events.insert rejected", {
        status: response.status,
      });
      return null;
    }

    const body = (await response.json()) as { id?: string };
    return body.id ?? null;
  } catch (cause) {
    console.error("[google-calendar] Could not reach Google's events API", {
      cause,
    });
    return null;
  }
}

/**
 * Delete an event from the organizer's own primary Google Calendar.
 * `sendUpdates=all` so attendees are notified the meeting was cancelled. An
 * event already gone (404/410 — e.g. the organizer deleted it by hand on
 * Google's side) is treated as success, not a failure. Never throws.
 */
export async function deleteEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  try {
    const url = new URL(`${EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`);
    url.searchParams.set("sendUpdates", "all");

    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok && response.status !== 404 && response.status !== 410) {
      console.error("[google-calendar] events.delete rejected", {
        status: response.status,
      });
    }
  } catch (cause) {
    console.error("[google-calendar] Could not reach Google's events API", {
      cause,
    });
  }
}
