/**
 * Google Chat REST API client.
 *
 * Minimal wrapper around Google Chat's REST endpoints. Uses plain `fetch`
 * rather than the `googleapis` package (same reasoning as `lib/google-calendar.ts`).
 * Access tokens are refreshed per-call from the stored refresh token — no
 * token-expiry bookkeeping needed.
 *
 * In phase 2, after the Conversation model carries a `googleSpaceId`, this
 * module will be called from `lib/chat-data.ts` for any conversation whose
 * `provider` is `Google`. Until then the functions are no-ops stubs so the
 * shape is locked in.
 */

import { db } from "@/lib/db";
import {
  refreshGoogleAccessToken,
} from "@/lib/google-oauth";
import { loadGoogleChatConfig } from "@/lib/company-google-chat-config";

const SPACES_ENDPOINT =
  "https://chat.googleapis.com/v1/spaces";
const MESSAGES_ENDPOINT =
  "https://chat.googleapis.com/v1/{space}/messages";

export type ChatSpace = {
  name: string; // e.g. "spaces/AAAA..."
  spaceId: string;
  displayName: string;
  spaceType: "DM" | "MULTI_USER_DM" | "ROOM";
};

export type ChatMessage = {
  name: string;
  text: string;
  sender: { displayName: string; email: string } | null;
  timestamp: string;
};

/** Fetch the access token, falling back to null on failure. */
async function accessToken(companyId: string): Promise<string | null> {
  const config = await loadGoogleChatConfig(companyId);
  if (!config?.refreshToken) return null;
  return refreshGoogleAccessToken(config.refreshToken);
}

/**
 * Create a Google Chat space for this conversation.
 * Returns the new space id (the part after "spaces/"), or null on failure.
 *
 * Google Chat spaces have an immutable `spaceId` used in subsequent API calls.
 */
export async function createChatSpace(
  companyId: string,
  spaceName: string,
  spaceType: "ROOM" | "MULTI_USER_DM" = "ROOM"
): Promise<string | null> {
  const token = await accessToken(companyId);
  if (!token) return null;

  try {
    const response = await fetch(SPACES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        space: {
          displayName: spaceName,
          spaceType,
        },
        requestId: crypto.randomUUID(),
      }),
    });

    if (!response.ok) {
      console.error("[google-chat] createSpace failed", {
        status: response.status,
        body: await response.text(),
      });
      return null;
    }

    const data = (await response.json()) as ChatSpace;
    return data.spaceId;
  } catch (cause) {
    console.error("[google-chat] createSpace threw", { cause });
    return null;
  }
}

/**
 * Send a text message to a Google Chat space.
 * Returns the message name ("spaces/.../messages/...") on success, null on failure.
 */
export async function sendChatMessage(
  companyId: string,
  spaceId: string,
  text: string
): Promise<string | null> {
  const token = await accessToken(companyId);
  if (!token) return null;

  try {
    const url = MESSAGES_ENDPOINT.replace("{space}", `spaces/${spaceId}`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error("[google-chat] sendMessage failed", {
        status: response.status,
        body: await response.text(),
      });
      return null;
    }

    const data = (await response.json()) as ChatMessage;
    return data.name;
  } catch (cause) {
    console.error("[google-chat] sendMessage threw", { cause });
    return null;
  }
}

/**
 * List recent messages in a space, newest first.
 * Returns up to `limit` messages (default 50).
 */
export async function listChatMessages(
  companyId: string,
  spaceId: string,
  limit = 50
): Promise<ChatMessage[] | null> {
  const token = await accessToken(companyId);
  if (!token) return null;

  try {
    const url = `${MESSAGES_ENDPOINT.replace("{space}", `spaces/${spaceId}`)}?pageSize=${limit}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error("[google-chat] listMessages failed", {
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as { messages: ChatMessage[] };
    return data.messages ?? [];
  } catch (cause) {
    console.error("[google-chat] listMessages threw", { cause });
    return null;
  }
}

/**
 * List spaces this company's Google account can see.
 * Used in the settings UI to show which existing spaces are available.
 */
export async function listChatSpaces(
  companyId: string
): Promise<ChatSpace[] | null> {
  const token = await accessToken(companyId);
  if (!token) return null;

  try {
    const response = await fetch(SPACES_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error("[google-chat] listSpaces failed", {
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as { spaces: ChatSpace[] };
    return data.spaces ?? [];
  } catch (cause) {
    console.error("[google-chat] listSpaces threw", { cause });
    return null;
  }
}

/**
 * Check if a Google Chat space has unread messages (newer than lastReadAt).
 * Returns true if there are messages after the given timestamp, false otherwise.
 * Falls back to true on any error to ensure we don't miss unread messages.
 */
export async function hasUnreadMessages(
  companyId: string,
  spaceId: string,
  lastReadAt: Date
): Promise<boolean> {
  const token = await accessToken(companyId);
  if (!token) return false;

  try {
    const url = `${MESSAGES_ENDPOINT.replace("{space}", `spaces/${spaceId}`)}?pageSize=1`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error("[google-chat] hasUnread failed", {
        status: response.status,
      });
      return false;
    }

    const data = (await response.json()) as { messages: ChatMessage[] };
    const messages = data.messages ?? [];

    // Check if any message is newer than lastReadAt
    return messages.some((m) => new Date(m.timestamp) > lastReadAt);
  } catch (cause) {
    console.error("[google-chat] hasUnread threw", { cause });
    return false;
  }
}
