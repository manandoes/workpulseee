import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import { chatMessageCutoff, conversationPreview, otherParticipant } from "@/lib/chat";

/**
 * Database access for chat (Phase 11).
 *
 * Mirrors `lib/attendance-data.ts`/`lib/request-data.ts`: the write
 * resolution and the reads the pages share live here. `ChatMessage` has no
 * `deletedAt` — it is hard-deleted once it ages out (`CHAT_MESSAGE_TTL_MS` in
 * `lib/chat.ts`), by the lazy cleanup in `loadMessages` below and by the
 * `/api/jobs/cleanup-chat-messages` sweep — so queries filter by a plain
 * `{ companyId, ... }` rather than `scopedWhere`.
 */

/** The column pair naming this actor as a participant/sender. */
function actorColumn(actor: SessionActor) {
  return actor.accountType === "employee"
    ? { employeeId: actor.id }
    : { accountId: actor.id };
}

function senderColumn(actor: SessionActor) {
  return actor.accountType === "employee"
    ? { senderEmployeeId: actor.id }
    : { senderAccountId: actor.id };
}

export type ChatTarget = { employeeId: string } | { accountId: string };

/** Does this target resolve to a real, non-deleted member of the actor's company? */
async function targetExists(
  actor: SessionActor,
  target: ChatTarget
): Promise<boolean> {
  if ("employeeId" in target) {
    const employee = await db.employee.findFirst({
      where: scopedWhere(actor, { id: target.employeeId }),
      select: { id: true },
    });
    return Boolean(employee);
  }

  const account = await db.companyAccount.findFirst({
    where: {
      id: target.accountId,
      companyId: actor.companyId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return Boolean(account);
}

function isTargetTheActor(actor: SessionActor, target: ChatTarget): boolean {
  if ("employeeId" in target) {
    return actor.accountType === "employee" && actor.id === target.employeeId;
  }
  return actor.accountType === "company" && actor.id === target.accountId;
}

export type ConversationResolution =
  | { ok: true; conversationId: string }
  | { ok: false; message: string; status: number };

/**
 * The 1:1 conversation between the actor and `target`, creating it if this is
 * their first message to each other. Refused if the target does not exist in
 * the actor's own company, or is the actor themself.
 */
export async function findOrCreateConversation(
  actor: SessionActor,
  target: ChatTarget
): Promise<ConversationResolution> {
  if (isTargetTheActor(actor, target)) {
    return { ok: false, message: "You cannot message yourself.", status: 400 };
  }

  if (!(await targetExists(actor, target))) {
    return {
      ok: false,
      message: "That person could not be found.",
      status: 400,
    };
  }

  const existing = await db.conversation.findFirst({
    where: {
      companyId: actor.companyId,
      AND: [
        { participants: { some: actorColumn(actor) } },
        { participants: { some: target } },
      ],
    },
    select: { id: true },
  });

  if (existing) return { ok: true, conversationId: existing.id };

  const created = await db.conversation.create({
    data: {
      companyId: actor.companyId,
      participants: {
        create: [
          { companyId: actor.companyId, ...actorColumn(actor) },
          { companyId: actor.companyId, ...target },
        ],
      },
    },
    select: { id: true },
  });

  return { ok: true, conversationId: created.id };
}

const participantSelect = {
  employeeId: true,
  accountId: true,
  employee: { select: { fullName: true, avatarUrl: true } },
  account: { select: { fullName: true, avatarUrl: true } },
} as const;

function participantDisplay(participant: {
  employeeId: string | null;
  accountId: string | null;
  employee: { fullName: string; avatarUrl: string | null } | null;
  account: { fullName: string; avatarUrl: string | null } | null;
}) {
  const person = participant.employee ?? participant.account;
  return {
    kind: participant.employeeId ? ("employee" as const) : ("account" as const),
    id: participant.employeeId ?? participant.accountId ?? "",
    name: person?.fullName ?? "Removed member",
    avatarUrl: person?.avatarUrl ?? null,
  };
}

export type LoadedConversation = {
  id: string;
  other: {
    kind: "employee" | "account";
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  /** `preview` is `body`, or the attachment's name for a bare file share —
   * see `conversationPreview` (`body` alone would render blank for one). */
  lastMessage: { body: string; preview: string; createdAt: Date } | null;
  unread: boolean;
};

/** The actor's conversations, most recently active first. */
export async function loadConversations(
  actor: SessionActor
): Promise<LoadedConversation[]> {
  const rows = await db.conversation.findMany({
    where: {
      companyId: actor.companyId,
      participants: { some: actorColumn(actor) },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      participants: { select: participantSelect },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          body: true,
          createdAt: true,
          attachmentFile: { select: { name: true } },
        },
      },
    },
  });

  const self = await db.conversationParticipant.findMany({
    where: {
      companyId: actor.companyId,
      conversationId: { in: rows.map((row) => row.id) },
      ...actorColumn(actor),
    },
    select: { conversationId: true, lastReadAt: true },
  });
  const lastReadByConversation = new Map(
    self.map((row) => [row.conversationId, row.lastReadAt])
  );

  return rows.map((row) => {
    const other = otherParticipant(row.participants, actor);
    const rawLastMessage = row.messages[0] ?? null;
    const lastMessage = rawLastMessage
      ? {
          body: rawLastMessage.body,
          preview: conversationPreview(
            rawLastMessage.body,
            rawLastMessage.attachmentFile?.name ?? null
          ),
          createdAt: rawLastMessage.createdAt,
        }
      : null;
    const lastReadAt = lastReadByConversation.get(row.id) ?? null;

    return {
      id: row.id,
      other: other
        ? participantDisplay(other)
        : { kind: "employee", id: "", name: "Removed member", avatarUrl: null },
      lastMessage,
      unread: Boolean(
        lastMessage && (!lastReadAt || lastMessage.createdAt > lastReadAt)
      ),
    };
  });
}

export type LoadedChatMessage = {
  id: string;
  body: string;
  createdAt: Date;
  fromMe: boolean;
  attachment: {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
};

const messageAttachmentSelect = {
  select: { id: true, name: true, mimeType: true, sizeBytes: true },
} as const;

export type MessagesResolution =
  | {
      ok: true;
      messages: LoadedChatMessage[];
      other: LoadedConversation["other"] | null;
    }
  | { ok: false; message: string; status: number };

/**
 * A conversation's messages, newest last. Refused if the actor is not a
 * participant. Hard-deletes anything older than the 3-day cutoff first
 * (`lib/chat.ts`'s `chatMessageCutoff`) — the lazy-cleanup half of the
 * deletion story, the cron sweep in `lib/chat-data.ts`'s
 * `cleanupExpiredChatMessages` is the other half — then marks the rest read.
 */
export async function loadMessages(
  actor: SessionActor,
  conversationId: string,
  now: Date = new Date()
): Promise<MessagesResolution> {
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      companyId: actor.companyId,
      participants: { some: actorColumn(actor) },
    },
    select: { id: true, participants: { select: participantSelect } },
  });

  if (!conversation) {
    return { ok: false, message: "Conversation not found.", status: 404 };
  }

  await deleteExpiredMessages({ conversationId, createdAt: { lt: chatMessageCutoff(now) } });

  const rows = await db.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      createdAt: true,
      senderEmployeeId: true,
      senderAccountId: true,
      attachmentFile: messageAttachmentSelect,
    },
  });

  await db.conversationParticipant.updateMany({
    where: {
      conversationId,
      companyId: actor.companyId,
      ...actorColumn(actor),
    },
    data: { lastReadAt: now },
  });

  const other = otherParticipant(conversation.participants, actor);

  return {
    ok: true,
    other: other ? participantDisplay(other) : null,
    messages: rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      attachment: row.attachmentFile,
      fromMe:
        actor.accountType === "employee"
          ? row.senderEmployeeId === actor.id
          : row.senderAccountId === actor.id,
    })),
  };
}

export type SendMessageResolution =
  | { ok: true; message: LoadedChatMessage }
  | { ok: false; message: string; status: number };

/**
 * Send a message. Refused if the actor is not a participant, or if
 * `attachmentFileId` does not name a file in their own company — an id from
 * another tenant must never become a message anyone can click through to.
 */
export async function sendMessage(
  actor: SessionActor,
  conversationId: string,
  body: string,
  attachmentFileId?: string
): Promise<SendMessageResolution> {
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      companyId: actor.companyId,
      participants: { some: actorColumn(actor) },
    },
    select: { id: true },
  });

  if (!conversation) {
    return { ok: false, message: "Conversation not found.", status: 404 };
  }

  if (attachmentFileId) {
    const file = await db.storedFile.findFirst({
      where: { id: attachmentFileId, companyId: actor.companyId },
      select: { id: true },
    });
    if (!file) {
      return { ok: false, message: "That attachment is no longer available.", status: 400 };
    }
  }

  const now = new Date();

  const [created] = await db.$transaction([
    db.chatMessage.create({
      data: {
        companyId: actor.companyId,
        conversationId,
        body,
        attachmentFileId: attachmentFileId ?? null,
        ...senderColumn(actor),
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        attachmentFile: messageAttachmentSelect,
      },
    }),
    db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: now },
    }),
    db.conversationParticipant.updateMany({
      where: {
        conversationId,
        companyId: actor.companyId,
        ...actorColumn(actor),
      },
      data: { lastReadAt: now },
    }),
  ]);

  return {
    ok: true,
    message: {
      id: created.id,
      body: created.body,
      createdAt: created.createdAt,
      attachment: created.attachmentFile,
      fromMe: true,
    },
  };
}

/** How many of the actor's conversations have an unread message — for the nav badge. */
export async function unreadConversationCount(
  actor: SessionActor
): Promise<number> {
  const conversations = await loadConversations(actor);
  return conversations.filter((conversation) => conversation.unread).length;
}

/**
 * Hard-delete the messages matching `where`, along with any files they were
 * the only reason to keep.
 *
 * A message row is temporary by design (3 days), but a `StoredFile` is not —
 * deleting only the message would leave its bytes in the table forever, with
 * nothing left pointing at them. The FK is `onDelete: SetNull` precisely so
 * that deleting a file can never cascade into deleting chat history; the
 * clean-up therefore has to run the other way round, here, and is the reason
 * both the lazy path and the sweep below funnel through this one function.
 */
async function deleteExpiredMessages(
  where: NonNullable<Parameters<typeof db.chatMessage.deleteMany>[0]>["where"]
): Promise<number> {
  const doomed = await db.chatMessage.findMany({
    where,
    select: { id: true, attachmentFileId: true },
  });

  if (doomed.length === 0) return 0;

  const fileIds = doomed
    .map((message) => message.attachmentFileId)
    .filter((id): id is string => Boolean(id));

  const result = await db.chatMessage.deleteMany({
    where: { id: { in: doomed.map((message) => message.id) } },
  });

  if (fileIds.length > 0) {
    await db.storedFile.deleteMany({ where: { id: { in: fileIds } } });
  }

  return result.count;
}

/**
 * Hard-delete every expired message across every company — the
 * `/api/jobs/cleanup-chat-messages` sweep. The lazy cleanup in `loadMessages`
 * is the safety net if this is never wired to an external scheduler.
 */
export async function cleanupExpiredChatMessages(
  now: Date = new Date()
): Promise<number> {
  return deleteExpiredMessages({ createdAt: { lt: chatMessageCutoff(now) } });
}

export type ChatDirectoryEntry = {
  kind: "employee" | "account";
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
};

/**
 * Everyone in the company the actor could start a conversation with — the
 * actor themself excluded, since `findOrCreateConversation` refuses that
 * target anyway and offering it would only produce an error.
 */
export async function loadChatDirectory(
  actor: SessionActor
): Promise<ChatDirectoryEntry[]> {
  const [employees, accounts] = await Promise.all([
    db.employee.findMany({
      where: scopedWhere(actor, {
        id: actor.accountType === "employee" ? { not: actor.id } : undefined,
      }),
      select: { id: true, fullName: true, jobRole: true, avatarUrl: true },
      orderBy: { fullName: "asc" },
    }),
    db.companyAccount.findMany({
      where: {
        companyId: actor.companyId,
        deletedAt: null,
        ...(actor.accountType === "company" ? { id: { not: actor.id } } : {}),
      },
      select: { id: true, fullName: true, role: true, avatarUrl: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return [
    ...accounts.map((account) => ({
      kind: "account" as const,
      id: account.id,
      name: account.fullName,
      role: account.role,
      avatarUrl: account.avatarUrl,
    })),
    ...employees.map((employee) => ({
      kind: "employee" as const,
      id: employee.id,
      name: employee.fullName,
      role: employee.jobRole ?? "Employee",
      avatarUrl: employee.avatarUrl,
    })),
  ];
}
