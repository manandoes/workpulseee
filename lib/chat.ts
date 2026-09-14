/**
 * Pure chat logic, free of Prisma/Next imports so it can be unit-tested
 * directly - the same split every other feature in this codebase draws
 * between a pure module and its `-data.ts` counterpart
 * (`lib/attendance.ts`/`attendance-data.ts`, `lib/tasks.ts`/`task-data.ts`).
 */

/** Messages are hard-deleted this long after they are sent. */
export const CHAT_MESSAGE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** A message with `createdAt` older than this cutoff has expired. */
export function chatMessageCutoff(now: Date): Date {
  return new Date(now.getTime() - CHAT_MESSAGE_TTL_MS);
}

export function isExpiredChatMessage(createdAt: Date, now: Date): boolean {
  return createdAt.getTime() < chatMessageCutoff(now).getTime();
}

export const CHAT_MESSAGE_MIN_LENGTH = 1;
export const CHAT_MESSAGE_MAX_LENGTH = 4000;

/** Who the "other side" of a loaded 1:1 conversation is, relative to the actor. */
export type ChatParticipantRef = {
  employeeId: string | null;
  accountId: string | null;
};

export function isSameParticipant(
  a: ChatParticipantRef,
  b: { employeeId?: string | null; accountId?: string | null }
): boolean {
  if (a.employeeId) return a.employeeId === b.employeeId;
  if (a.accountId) return a.accountId === b.accountId;
  return false;
}

/**
 * Pick the participant that is not the actor, from a loaded conversation's
 * two-row participant list. Returns `null` for a malformed row set (should
 * never happen - every conversation has exactly two participants, enforced
 * in `lib/chat-data.ts`) rather than throwing, since this is read-path
 * rendering logic.
 */
export function otherParticipant<
  T extends { employeeId: string | null; accountId: string | null },
>(
  participants: readonly T[],
  actor: { id: string; accountType: "employee" | "company" }
): T | null {
  return (
    participants.find((participant) => {
      const isActor =
        actor.accountType === "employee"
          ? participant.employeeId === actor.id
          : participant.accountId === actor.id;
      return !isActor;
    }) ?? null
  );
}
