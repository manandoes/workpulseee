import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { serverError, unauthorized } from "@/lib/api";
import { tokenHashMatches } from "@/lib/invites";
import { cleanupChatMessages } from "@/jobs/cleanupChatMessages";

/**
 * POST /api/jobs/cleanup-chat-messages — the Phase 11 chat retention sweep.
 *
 * Mirrors `app/api/jobs/recalculate-workload/route.ts` exactly: no session,
 * meant for an external scheduler (Vercel Cron, GitHub Actions, a plain
 * server cron job) hitting this a few times a day, guarded by `CRON_SECRET`
 * compared in constant time with `tokenHashMatches`. `lib/chat-data.ts`'s
 * `loadMessages` already deletes a conversation's own stale messages lazily
 * whenever it is fetched — this sweep is the safety net for conversations
 * nobody has opened, so messages don't outlive the 3-day retention window
 * just because no scheduler was ever wired up... except that without one,
 * this route is simply never called. Set `CRON_SECRET` and schedule this
 * route to make the 3-day guarantee exact rather than "eventually, next time
 * someone opens the thread".
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return serverError(
      { route: "POST /api/jobs/cleanup-chat-messages" },
      new Error("CRON_SECRET is not set")
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!provided || !tokenHashMatches(provided, secret)) {
    return unauthorized("Missing or invalid cron secret.");
  }

  try {
    const deleted = await cleanupChatMessages();
    return NextResponse.json({ deleted });
  } catch (cause) {
    return serverError({ route: "POST /api/jobs/cleanup-chat-messages" }, cause);
  }
}
