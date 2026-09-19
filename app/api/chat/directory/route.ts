import { NextResponse } from "next/server";
import { serverError, unauthorized } from "@/lib/api";
import { getActor } from "@/lib/auth";
import { loadChatDirectory } from "@/lib/chat-data";

/**
 * GET /api/chat/directory — everyone in the company the actor could message
 * (Plan: start a new chat).
 *
 * Any member may message any other member, which is the rule
 * `findOrCreateConversation` already enforces on the write side; this is that
 * same set, listed so a picker can offer it.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const people = await loadChatDirectory(actor);
    return NextResponse.json({ people });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/chat/directory",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
