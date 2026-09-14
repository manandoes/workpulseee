import { NextResponse } from "next/server";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { findOrCreateConversation, loadConversations } from "@/lib/chat-data";
import { startConversationSchema } from "@/lib/validations/chat";

/** GET /api/chat/conversations — the actor's conversation list. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const conversations = await loadConversations(actor);
    return NextResponse.json({ conversations });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/chat/conversations",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/**
 * POST /api/chat/conversations — find or start a 1:1 conversation with
 * another member of the company (`{ employeeId }` xor `{ accountId }`).
 */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = startConversationSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  const target = parsed.data.employeeId
    ? { employeeId: parsed.data.employeeId }
    : { accountId: parsed.data.accountId! };

  try {
    const resolved = await findOrCreateConversation(actor, target);
    if (!resolved.ok) {
      return apiError(resolved.message, resolved.status, "invalid_reference");
    }

    return NextResponse.json({ conversationId: resolved.conversationId });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/chat/conversations",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
