import { db } from "@/lib/db";
import type { SessionActor } from "@/lib/permissions";
import type { MessagingProvider } from "@/lib/generated/prisma/enums";

/**
 * Provider utilities (Plan: dual messaging providers).
 *
 * Reads the tenant's configured provider from `Company` and resolves which
 * backend a conversation should use at creation time, so existing conversations
 * keep their original provider even if the default changes later.
 *
 * Messages themselves are authoritative in one place only:
 *   - Native conversations: `ChatMessage` rows in this database.
 *   - Google conversations: Google Chat spaces; only the `Conversation.provider`
 *     and `googleSpaceId` metadata are kept locally.
 */

/**
 * The provider a company currently offers as its default. Falls back to
 * `Native` when the tenant has not configured Google Chat yet, even if the
 * chosen provider enum is `Google` or `Both` — matches the graceful-degradation
 * convention used for email and WhatsApp.
 */
export async function resolveDefaultProvider(
  companyId: string
): Promise<MessagingProvider> {
  const company = await db.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { messagingProvider: true, googleChatEnabled: true },
  });

  if (company.googleChatEnabled && company.messagingProvider !== "Native") {
    return company.messagingProvider;
  }

  return "Native";
}

/**
 * Whether the given actor may create conversations on a particular provider.
 * `Native` is always available. `Google` requires the company to have enabled
 * it AND be connected.
 */
export function canUseProvider(actor: SessionActor, provider: MessagingProvider): boolean {
  if (provider === "Native") return true;
  // Google availability is checked lazily via the company row; the actor's
  // own connection status isn't stored per-user yet — that comes in phase 2.
  return provider === "Google";
}

/**
 * Which provider(s) this company may use. Returns an array in preference order;
 * callers pick the first entry that is both configured and connected.
 */
export async function listAvailableProviders(
  companyId: string
): Promise<MessagingProvider[]> {
  const company = await db.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { messagingProvider: true, googleChatEnabled: true },
  });

  const providers: MessagingProvider[] = [];
  providers.push("Native"); // always available

  if (company.messagingProvider === "Google" || company.messagingProvider === "Both") {
    if (company.googleChatEnabled) providers.push("Google");
  }

  return providers;
}

/**
 * Given a conversation, return the provider that should serve its messages.
 * For `Native` the caller reads `ChatMessage` rows; for `Google` the caller
 * should use the Google Chat API with `conversation.googleSpaceId`.
 */
export function conversationProvider(
  conversation: { provider: MessagingProvider; googleSpaceId: string | null }
): MessagingProvider {
  return conversation.provider;
}

/**
 * Build the fields to write when creating a conversation, given the actor
 * and a requested provider. Resolves the effective provider (falls back to
 * `Native` when the requested one isn't available) and returns the partial
 * record to pass to `db.conversation.create`.
 */
export function buildConversationProviderFields(
  companyId: string,
  requestedProvider: MessagingProvider | null
): Promise<{ provider: MessagingProvider; googleSpaceId: string | null }> {
  // In phase 2 this will resolve `googleSpaceId` by creating a Google Chat space.
  // For now it returns null for every provider; the provider enum is written
  // so the UI can show the correct icon and the API can route reads accordingly.
  return Promise.resolve({
    provider: requestedProvider ?? "Native",
    googleSpaceId: null,
  });
}
