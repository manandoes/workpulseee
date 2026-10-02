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
import { resolveDefaultProvider, listAvailableProviders } from "@/lib/messaging-provider";

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
 *
 * Optionally accepts `provider` (one of "Native" | "Google") when the
 * company supports both. Falls back to the company default when omitted,
 * and to "Native" when the requested provider isn't available.
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

  // Resolve which provider to use. The form may ask for one explicitly,
  // but we validate against what the company actually supports.
  const requestedProvider = (payload as Record<string, unknown>)?.provider as
    | "Native"
    | "Google"
    | undefined;
  const defaultProvider = await resolveDefaultProvider(actor.companyId);
  const availableProviders = await listAvailableProviders(actor.companyId);

  // `availableProviders` may include "Both" but we only allow "Native" or "Google".
  const filtered = availableProviders.filter(p => p !== "Both") as ("Native" | "Google")[];
  const effectiveDefault = defaultProvider as "Native" | "Google";
  const provider: "Native" | "Google" =
    filtered.includes(requestedProvider ?? effectiveDefault)
      ? (requestedProvider ?? effectiveDefault)
      : effectiveDefault;

  try {
    const resolved = await findOrCreateConversation(actor, target, provider);
    if (!resolved.ok) {
      return apiError(resolved.message, resolved.status, "invalid_reference");
    }

    return NextResponse.json({
      conversationId: resolved.conversationId,
      provider,
    });
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

/** GET /api/chat/conversations/providers — list available providers for this tenant. */
export async function GET_providers() {
  const actor = await getActor();
  if (!actor) return unauthorized();

  try {
    const providers = await listAvailableProviders(actor.companyId);
    return NextResponse.json({ providers });
  } catch (cause) {
    return serverError(
      {
        route: "GET /api/chat/conversations/providers",
        companyId: actor.companyId,
        actorId: actor.id,
      },
      cause
    );
  }
}
