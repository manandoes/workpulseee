import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  serverError,
  unauthorized,
  validationError,
} from "@/lib/api";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadMessages, sendMessage } from "@/lib/chat-data";
import { sendMessageSchema } from "@/lib/validations/chat";
import {
  listChatMessages,
  sendChatMessage,
} from "@/lib/google-chat";

/**
 * GET /api/chat/conversations/[conversationId]/messages — a conversation's
 * messages, newest last. Also where the lazy 31-day cleanup happens
 * (`lib/chat-data.ts`'s `loadMessages`) and where the actor's own read marker
 * is bumped.
 *
 * For `Native` conversations messages are read from the DB; for `Google`
 * conversations they come from the Google Chat API.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { conversationId } = await params;

  // Fetch the conversation row once so we know which provider to use.
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      companyId: actor.companyId,
      participants: { some: { [actor.accountType === "employee" ? "employeeId" : "accountId"]: actor.id } },
    },
    select: { provider: true, googleSpaceId: true, participants: true },
  });

  if (!conversation) {
    return apiError("Conversation not found.", 404, "not_found");
  }

  // For Google conversations, fetch from the Google Chat API.
  if (conversation.provider === "Google") {
    if (!conversation.googleSpaceId) {
      return apiError(
        "This conversation has not been connected to Google Chat yet.",
        503,
        "google_not_configured"
      );
    }

    try {
      const messages = await listChatMessages(actor.companyId, conversation.googleSpaceId);
      // Convert Google Chat messages to our internal format.
      // other participant info is not available from Google Chat messages directly.
      return NextResponse.json({
        messages: (messages ?? []).map((m) => ({
          id: m.name,
          body: m.text,
          createdAt: m.timestamp,
          fromMe: false, // We can't determine this from Google Chat API easily
          attachment: null,
        })),
        other: null,
        provider: "Google" as const,
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

  // Native conversation — use existing DB logic.
  try {
    const resolved = await loadMessages(actor, conversationId);
    if (!resolved.ok) {
      return apiError(resolved.message, resolved.status, "not_found");
    }

    return NextResponse.json({
      messages: resolved.messages,
      other: resolved.other,
      provider: "Native" as const,
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

  // For Google conversations, check the space exists and route through Google API.
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      companyId: actor.companyId,
      participants: { some: { [actor.accountType === "employee" ? "employeeId" : "accountId"]: actor.id } },
    },
    select: { provider: true, googleSpaceId: true },
  });

  if (!conversation) {
    return apiError("Conversation not found.", 404, "not_found");
  }

  if (conversation.provider === "Google") {
    if (!conversation.googleSpaceId) {
      return apiError(
        "This conversation has not been connected to Google Chat yet.",
        503,
        "google_not_configured"
      );
    }

    // Google Chat only supports text (no attachments in this phase).
    if (parsed.data.attachmentFileId) {
      return apiError("File attachments are not supported in Google Chat yet.", 400, "unsupported");
    }

    try {
      const result = await sendChatMessage(actor.companyId, conversation.googleSpaceId, parsed.data.body);
      if (!result) {
        return apiError("Failed to send message via Google Chat.", 503, "send_failed");
      }

      // Return a synthetic message object — the real message lives in Google.
      return NextResponse.json({
        messages: [
          {
            id: result,
            body: parsed.data.body,
            createdAt: new Date().toISOString(),
            fromMe: true,
            attachment: null,
          },
        ],
        other: null,
        provider: "Google" as const,
      }, { status: 201 });
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

  // Native conversation — use existing DB logic.
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

    // Notify other participants via the in-app bell so they get a clickable
    // link straight to the conversation, regardless of which provider they
    // are talking on. Google-side senders are already notified by the API
    // here because this route is the single write path for Native.
    await import("@/lib/notification-data").then(
      ({ notifyChatMessage }) =>
        notifyChatMessage({
          companyId: actor.companyId,
          conversationId,
          senderId: actor.id,
          senderAccountType: actor.accountType,
          body: parsed.data.body,
        })
    );

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
