import { cleanupExpiredChatMessages } from "@/lib/chat-data";

/**
 * The Phase 11 chat retention sweep (Architecture.md section 5's `jobs/`
 * naming). Called by `app/api/jobs/cleanup-chat-messages/route.ts` for an
 * external scheduler to hit. `lib/chat-data.ts`'s `loadMessages` already does
 * a lazy, per-conversation version of this on every fetch, so this sweep is
 * a safety net for conversations nobody has opened lately.
 */
export async function cleanupChatMessages() {
  return cleanupExpiredChatMessages();
}
