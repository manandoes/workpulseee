/**
 * The Google OAuth handshake, shared by every Google integration.
 *
 * Extracted from `lib/google-calendar.ts` when hiring (Plan: hiring) needed
 * the same three steps against the Forms API: build a consent URL, trade the
 * one-time code for a refresh token, and trade that refresh token for an
 * access token on each call. Only the scope and the redirect URI differ per
 * integration, so those are arguments and everything else lives here once.
 *
 * Every function returns `null` rather than throwing. A Google outage must
 * degrade a feature, never break the page around it — the same rule
 * `lib/mailer.ts` and `lib/whatsapp.ts` follow for their providers.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export function googleClientCredentials(): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** The consent-screen URL to send someone to, carrying our signed `state`. */
export function buildGoogleAuthUrl(input: {
  scope: string;
  redirectUri: string;
  state: string;
}): string | null {
  const credentials = googleClientCredentials();
  if (!credentials) return null;

  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scope);
  // Guarantees a refresh token on first connect; without both, Google only
  // hands one back the very first time an account ever consents at all.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export type ExchangedTokens = { refreshToken: string; accessToken: string };

/** Trade a one-time OAuth `code` for a refresh token, never throws. */
export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<ExchangedTokens | null> {
  const credentials = googleClientCredentials();
  if (!credentials) return null;

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      console.error("[google-oauth] Code exchange rejected", {
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
    console.error("[google-oauth] Could not reach Google's token endpoint", {
      cause,
    });
    return null;
  }
}

/** Trade a stored refresh token for a fresh access token, never throws. */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<string | null> {
  const credentials = googleClientCredentials();
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
      console.error("[google-oauth] Token refresh rejected", {
        status: response.status,
      });
      return null;
    }

    const body = (await response.json()) as { access_token?: string };
    return body.access_token ?? null;
  } catch (cause) {
    console.error("[google-oauth] Could not reach Google's token endpoint", {
      cause,
    });
    return null;
  }
}

/** Which Google address just consented, for showing in settings. */
export async function fetchGoogleUserEmail(
  accessToken: string
): Promise<string | null> {
  try {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { email?: string };
    return body.email ?? null;
  } catch {
    return null;
  }
}
