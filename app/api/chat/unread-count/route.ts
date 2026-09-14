import { NextResponse } from "next/server";
import { serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { unreadConversationCount } from "@/lib/chat-data";

/** GET /api/chat/unread-count — the nav badge's poll target. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const unreadCount = await unreadConversationCount(actor);
    return NextResponse.json({ unreadCount });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/chat/unread-count",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
