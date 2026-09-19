import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { loadMessages, sendMessage } from "@/lib/chat-data";
import { sendMessageSchema } from "@/lib/validations/chat";

/**
 * GET /api/chat/conversations/[conversationId]/messages — a conversation's
 * messages, newest last. Also where the lazy 3-day cleanup happens
 * (`lib/chat-data.ts`'s `loadMessages`) and where the actor's own read marker
 * is bumped.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { conversationId } = await params;

  try {
    const resolved = await loadMessages(actor, conversationId);
    if (!resolved.ok) {
      return apiError(resolved.message, resolved.status, "not_found");
    }

    return NextResponse.json({
      messages: resolved.messages,
      other: resolved.other,
    });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/chat/conversations/[conversationId]/messages",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}

/** POST /api/chat/conversations/[conversationId]/messages — send a message. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { conversationId } = await params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = sendMessageSchema.safeParse(payload);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolved = await sendMessage(
      actor,
      conversationId,
      parsed.data.body,
      parsed.data.attachmentFileId
    );
    if (!resolved.ok) {
      return apiError(resolved.message, resolved.status, "not_found");
    }

    return NextResponse.json({ message: resolved.message }, { status: 201 });
  } catch (cause) {
    return serverError(
      {
        route: "POST /api/chat/conversations/[conversationId]/messages",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
