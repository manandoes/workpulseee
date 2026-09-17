import { duplicateFailure, invalidReference, type WriteFailure } from "@/lib/api";
import { db } from "@/lib/db";
import { scopedWhere } from "@/lib/tenant";
import type { SessionActor } from "@/lib/permissions";
import { pollResults, voterKeyFor, type PollOptionResult } from "@/lib/announcements";
import { notifyAnnouncementPosted } from "@/lib/notification-data";
import { paginationMeta, type PaginationMeta } from "@/lib/pagination";
import type { CreateAnnouncementInput } from "@/lib/validations/announcements";

/**
 * Database access for announcements and polls (Plan: top bar rework).
 *
 * Mirrors `lib/notification-data.ts` and `lib/task-data.ts` conventions: pure
 * decisions live in `lib/announcements.ts`, everything that touches Prisma
 * lives here.
 *
 * `Poll`/`PollOption`/`PollVote` carry their own `companyId` but no
 * `deletedAt` — the same "membership row" shape `ProjectMember` uses — so
 * they are queried by `companyId` directly rather than through
 * `scopedWhere`, which always adds a `deletedAt: null` those models don't
 * have.
 */

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export type CreateAnnouncementResolution =
  | { ok: true; id: string }
  | WriteFailure;

/**
 * Post an announcement, optionally with a poll, then fan the notification
 * out to everyone else in the company.
 */
export async function createAnnouncement(
  actor: SessionActor,
  input: CreateAnnouncementInput
): Promise<CreateAnnouncementResolution> {
  const announcement = await db.announcement.create({
    data: {
      companyId: actor.companyId,
      createdByAccountId: actor.id,
      title: input.title,
      body: input.body,
      ...(input.poll
        ? {
            poll: {
              create: {
                companyId: actor.companyId,
                options: {
                  create: input.poll.options.map((label, index) => ({
                    companyId: actor.companyId,
                    label,
                    order: index,
                  })),
                },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      companyId: true,
      createdByAccountId: true,
      createdByAccount: { select: { fullName: true } },
    },
  });

  await notifyAnnouncementPosted(announcement);

  return { ok: true, id: announcement.id };
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

export type VoteResolution = { ok: true } | WriteFailure;

/**
 * Cast (or move) the caller's vote on a poll.
 *
 * Delete-then-create in one transaction rather than an upsert, because the
 * caller's unique key is on `[pollId, voterEmployeeId]`/`[pollId,
 * voterAccountId]`, not on the option — the same "close one row, open
 * another" shape `endBreak` uses to move a break into a fresh task timer.
 */
export async function castVote(
  actor: SessionActor,
  pollId: string,
  pollOptionId: string
): Promise<VoteResolution> {
  const option = await db.pollOption.findFirst({
    where: { id: pollOptionId, pollId, companyId: actor.companyId },
    select: { id: true },
  });

  if (!option) {
    return invalidReference("pollOptionId", "That option no longer exists.");
  }

  const voterKey = voterKeyFor(actor);

  try {
    await db.$transaction([
      db.pollVote.deleteMany({
        where: { pollId, companyId: actor.companyId, ...voterKey },
      }),
      db.pollVote.create({
        data: {
          companyId: actor.companyId,
          pollId,
          pollOptionId,
          ...voterKey,
        },
      }),
    ]);
  } catch (cause) {
    console.error("[announcements] Could not record a vote", { cause });
    return duplicateFailure("pollOptionId", "Could not record your vote.");
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type LoadedPoll = {
  id: string;
  options: PollOptionResult[];
  totalVotes: number;
  /** The option the caller has already voted for, or null if they haven't. */
  ownOptionId: string | null;
};

export type LoadedAnnouncement = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  authorName: string;
  poll: LoadedPoll | null;
};

export type LoadedAnnouncementPage = {
  announcements: LoadedAnnouncement[];
} & PaginationMeta;

async function attachPoll(
  actor: SessionActor,
  announcementId: string
): Promise<LoadedPoll | null> {
  const poll = await db.poll.findFirst({
    where: { announcementId, companyId: actor.companyId },
    select: {
      id: true,
      options: { select: { id: true, label: true, order: true } },
    },
  });

  if (!poll) return null;

  const votes = await db.pollVote.findMany({
    where: { pollId: poll.id, companyId: actor.companyId },
    select: { pollOptionId: true, voterEmployeeId: true, voterAccountId: true },
  });

  const ownVote =
    actor.accountType === "employee"
      ? votes.find((vote) => vote.voterEmployeeId === actor.id)
      : votes.find((vote) => vote.voterAccountId === actor.id);

  return {
    id: poll.id,
    options: pollResults(poll.options, votes),
    totalVotes: votes.length,
    ownOptionId: ownVote?.pollOptionId ?? null,
  };
}

/**
 * The full, paginated announcement feed, newest first — readable by anyone
 * signed in, employees included.
 */
export async function loadAnnouncementsPage(
  actor: SessionActor,
  requestedPage: number
): Promise<LoadedAnnouncementPage> {
  const where = scopedWhere(actor);
  const total = await db.announcement.count({ where });
  const meta = paginationMeta(total, requestedPage);

  const rows = await db.announcement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: meta.skip,
    take: meta.take,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      createdByAccount: { select: { fullName: true } },
    },
  });

  const announcements = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      authorName: row.createdByAccount.fullName,
      poll: await attachPoll(actor, row.id),
    }))
  );

  return { announcements, ...meta };
}

/** The most recent announcements, for the top-bar dropdown. */
export async function loadRecentAnnouncements(
  actor: SessionActor,
  limit = 5
): Promise<LoadedAnnouncement[]> {
  const rows = await db.announcement.findMany({
    where: scopedWhere(actor),
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      createdAt: true,
      createdByAccount: { select: { fullName: true } },
    },
  });

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      authorName: row.createdByAccount.fullName,
      poll: await attachPoll(actor, row.id),
    }))
  );
}
