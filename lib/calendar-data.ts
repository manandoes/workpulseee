import { duplicateFailure, invalidReference, type WriteFailure } from "@/lib/api";
import { db } from "@/lib/db";
import type { SessionActor } from "@/lib/permissions";
import { hasConflict, mergeIntervals, type BusyInterval } from "@/lib/calendar";
import {
  decryptRefreshToken,
  encryptRefreshToken,
} from "@/lib/google-calendar-crypto";
import {
  createEvent,
  deleteEvent,
  listOwnEvents,
  queryFreeBusy,
  refreshAccessToken,
  type GoogleEvent,
} from "@/lib/google-calendar";
import { notifyMeetingScheduled } from "@/lib/notification-data";
import type { MeetingStatus } from "@/lib/generated/prisma/enums";

/**
 * Database access for Calendar (Plan.md Phase 17).
 *
 * The privacy rule Plan.md calls out is enforced here, not in the UI: you see
 * your own events with titles; someone else's Google data is returned as
 * **busy intervals only**, no titles, no attendees. An in-app `Meeting` you
 * are a `MeetingParticipant` of shows its title regardless of who else is on
 * it. Anything else would leak calendar contents across the company.
 */

/** Which two-nullable-FK columns name this actor as a person on a row. */
function personColumns(actor: Pick<SessionActor, "id" | "accountType">) {
  return actor.accountType === "employee"
    ? { employeeId: actor.id }
    : { accountId: actor.id };
}

function personColumnsFor(target: { kind: "employee" | "account"; id: string }) {
  return target.kind === "employee"
    ? { employeeId: target.id }
    : { accountId: target.id };
}

// ---------------------------------------------------------------------------
// Google connection
// ---------------------------------------------------------------------------

export type ConnectionRow = {
  googleEmail: string;
  connectedAt: Date;
};

const connectionSelect = { googleEmail: true, connectedAt: true } as const;

export function loadConnection(
  actor: SessionActor
): Promise<ConnectionRow | null> {
  return db.googleCalendarConnection.findFirst({
    where: { companyId: actor.companyId, ...personColumns(actor) },
    select: connectionSelect,
  });
}

/** Encrypts the refresh token before it ever reaches the database. */
export async function saveConnection(
  actor: SessionActor,
  data: { googleEmail: string; refreshToken: string; scope: string }
): Promise<void> {
  const columns = personColumns(actor);
  const refreshTokenEncrypted = encryptRefreshToken(data.refreshToken);

  const existing = await db.googleCalendarConnection.findFirst({
    where: { companyId: actor.companyId, ...columns },
    select: { id: true },
  });

  if (existing) {
    await db.googleCalendarConnection.update({
      where: { id: existing.id },
      data: {
        googleEmail: data.googleEmail,
        refreshTokenEncrypted,
        scope: data.scope,
        connectedAt: new Date(),
      },
    });
  } else {
    await db.googleCalendarConnection.create({
      data: {
        companyId: actor.companyId,
        ...columns,
        googleEmail: data.googleEmail,
        refreshTokenEncrypted,
        scope: data.scope,
      },
    });
  }
}

export async function disconnectConnection(actor: SessionActor): Promise<void> {
  await db.googleCalendarConnection.deleteMany({
    where: { companyId: actor.companyId, ...personColumns(actor) },
  });
}

/** A ready-to-call access token for this connection, or `null` if it fails. */
async function accessTokenFor(connection: {
  refreshTokenEncrypted: string;
}): Promise<string | null> {
  const refreshToken = decryptRefreshToken(connection.refreshTokenEncrypted);
  return refreshAccessToken(refreshToken);
}

/** The signed-in person's own Google events, titled. `[]` if not connected. */
export async function loadMyPreview(
  actor: SessionActor,
  from: Date,
  to: Date
): Promise<GoogleEvent[]> {
  const connection = await db.googleCalendarConnection.findFirst({
    where: { companyId: actor.companyId, ...personColumns(actor) },
    select: { refreshTokenEncrypted: true },
  });
  if (!connection) return [];

  const accessToken = await accessTokenFor(connection);
  if (!accessToken) return [];

  return listOwnEvents(accessToken, from, to);
}

/**
 * A colleague's busy intervals, no titles. Requires the *viewer's own*
 * connection (the freeBusy call is made with the viewer's token, per Plan.md's
 * confirmed design) and the colleague's Google email on file — a colleague
 * who has never connected simply has no Google data to preview, which is not
 * an error, just nothing to show.
 */
export async function loadColleagueBusy(
  actor: SessionActor,
  target: { kind: "employee" | "account"; id: string },
  from: Date,
  to: Date
): Promise<BusyInterval[]> {
  const [viewerConnection, targetConnection] = await Promise.all([
    db.googleCalendarConnection.findFirst({
      where: { companyId: actor.companyId, ...personColumns(actor) },
      select: { refreshTokenEncrypted: true },
    }),
    db.googleCalendarConnection.findFirst({
      where: { companyId: actor.companyId, ...personColumnsFor(target) },
      select: { googleEmail: true },
    }),
  ]);

  if (!viewerConnection || !targetConnection) return [];

  const accessToken = await accessTokenFor(viewerConnection);
  if (!accessToken) return [];

  const busy = await queryFreeBusy(
    accessToken,
    [targetConnection.googleEmail],
    from,
    to
  );
  return busy[targetConnection.googleEmail] ?? [];
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export type MeetingParticipantRow = {
  kind: "employee" | "account";
  id: string;
  name: string;
};

export type MeetingRow = {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  location: string | null;
  status: MeetingStatus;
  organizer: MeetingParticipantRow | null;
  participants: MeetingParticipantRow[];
};

const meetingSelect = {
  id: true,
  title: true,
  description: true,
  startAt: true,
  endAt: true,
  location: true,
  status: true,
  organizerEmployeeId: true,
  organizerAccountId: true,
  organizerEmployee: { select: { id: true, fullName: true } },
  organizerAccount: { select: { id: true, fullName: true } },
  participants: {
    select: {
      employeeId: true,
      accountId: true,
      employee: { select: { id: true, fullName: true } },
      account: { select: { id: true, fullName: true } },
    },
  },
} as const;

type RawMeeting = {
  id: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  location: string | null;
  status: MeetingStatus;
  organizerEmployeeId: string | null;
  organizerAccountId: string | null;
  organizerEmployee: { id: string; fullName: string } | null;
  organizerAccount: { id: string; fullName: string } | null;
  participants: {
    employeeId: string | null;
    accountId: string | null;
    employee: { id: string; fullName: string } | null;
    account: { id: string; fullName: string } | null;
  }[];
};

function toMeetingRow(raw: RawMeeting): MeetingRow {
  const organizer = raw.organizerEmployee
    ? { kind: "employee" as const, id: raw.organizerEmployee.id, name: raw.organizerEmployee.fullName }
    : raw.organizerAccount
      ? { kind: "account" as const, id: raw.organizerAccount.id, name: raw.organizerAccount.fullName }
      : null;

  const participants = raw.participants.map((participant) =>
    participant.employee
      ? { kind: "employee" as const, id: participant.employee.id, name: participant.employee.fullName }
      : {
          kind: "account" as const,
          id: participant.account!.id,
          name: participant.account!.fullName,
        }
  );

  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    location: raw.location,
    status: raw.status,
    organizer,
    participants,
  };
}

/** The signed-in person's own meetings (as organizer or invitee) in range. */
export async function loadMeetingsForRange(
  actor: SessionActor,
  from: Date,
  to: Date
): Promise<MeetingRow[]> {
  const rows = await db.meeting.findMany({
    where: {
      companyId: actor.companyId,
      startAt: { lt: to },
      endAt: { gt: from },
      participants: { some: personColumns(actor) },
    },
    orderBy: { startAt: "asc" },
    select: meetingSelect,
  });

  return rows.map(toMeetingRow);
}

/** The organizer's own busy intervals — their meetings plus their Google preview. */
async function organizerBusy(
  actor: SessionActor,
  from: Date,
  to: Date
): Promise<BusyInterval[]> {
  const [meetings, preview] = await Promise.all([
    db.meeting.findMany({
      where: {
        companyId: actor.companyId,
        status: "Scheduled",
        startAt: { lt: to },
        endAt: { gt: from },
        participants: { some: personColumns(actor) },
      },
      select: { startAt: true, endAt: true },
    }),
    loadMyPreview(actor, from, to),
  ]);

  return mergeIntervals([
    ...meetings.map((m) => ({ start: m.startAt, end: m.endAt })),
    ...preview.map((e) => ({ start: e.start, end: e.end })),
  ]);
}

export type ProposeMeetingResolution = { ok: true; meeting: MeetingRow } | WriteFailure;

/**
 * Book a meeting. Refuses a slot that conflicts with the organizer's own
 * WorkPulse meetings or Google preview (Plan.md — "refuses a slot that
 * conflicts"). Creates the `Meeting` and one `MeetingParticipant` row per
 * invitee plus the organizer in a single transaction, then notifies every
 * invited participant (never the organizer — they are the one looking at the
 * screen that just did it, the same rule `notifyTaskAssigned` follows).
 */
export async function proposeMeeting(
  actor: SessionActor,
  input: {
    title: string;
    description: string | null;
    startAt: Date;
    endAt: Date;
    location: string | null;
    participants: { kind: "employee" | "account"; id: string }[];
  }
): Promise<ProposeMeetingResolution> {
  const proposed: BusyInterval = { start: input.startAt, end: input.endAt };
  const busy = await organizerBusy(actor, input.startAt, input.endAt);

  if (hasConflict(proposed, busy)) {
    return duplicateFailure(
      "startAt",
      "This time conflicts with something already on your calendar."
    );
  }

  // The organizer may also be named explicitly in `participants` (e.g. a UI
  // that lists everyone including yourself) — de-duplicate against them.
  const isOrganizer = (p: { kind: string; id: string }) =>
    p.kind === actor.accountType && p.id === actor.id;
  const distinctInvitees = input.participants.filter((p) => !isOrganizer(p));

  const validated = await validateParticipants(actor, distinctInvitees);
  if (!validated.ok) return validated;

  const organizerColumns = personColumns(actor);

  const created = await db.meeting.create({
    data: {
      companyId: actor.companyId,
      title: input.title,
      description: input.description,
      startAt: input.startAt,
      endAt: input.endAt,
      location: input.location,
      organizerEmployeeId: organizerColumns.employeeId ?? null,
      organizerAccountId: organizerColumns.accountId ?? null,
      participants: {
        create: [
          { companyId: actor.companyId, ...organizerColumns },
          ...distinctInvitees.map((p) => ({
            companyId: actor.companyId,
            ...personColumnsFor(p),
          })),
        ],
      },
    },
    select: meetingSelect,
  });

  const meeting = toMeetingRow(created);

  await Promise.all([
    ...distinctInvitees.map((invitee) =>
      notifyMeetingScheduled({
        id: meeting.id,
        companyId: actor.companyId,
        title: meeting.title,
        startAt: meeting.startAt,
        organizerName: meeting.organizer?.name ?? "Someone",
        recipient: personColumnsFor(invitee) as
          | { employeeId: string }
          | { accountId: string },
      })
    ),
    mirrorMeetingToGoogle(actor, organizerColumns, distinctInvitees, meeting),
  ]);

  return { ok: true, meeting };
}

/**
 * Best-effort mirror of a freshly-booked meeting onto the organizer's own
 * Google Calendar, if they are connected. Never throws and never reports
 * failure to the caller — a missing connection, an expired refresh token, or
 * a rejected Google API call all just mean this meeting stays WorkPulse-only,
 * exactly like an organizer who never connected Google at all.
 */
async function mirrorMeetingToGoogle(
  actor: SessionActor,
  organizerColumns: { employeeId?: string; accountId?: string },
  invitees: { kind: "employee" | "account"; id: string }[],
  meeting: MeetingRow
): Promise<void> {
  const organizerConnection = await db.googleCalendarConnection.findFirst({
    where: { companyId: actor.companyId, ...organizerColumns },
    select: { refreshTokenEncrypted: true },
  });
  if (!organizerConnection) return;

  const accessToken = await accessTokenFor(organizerConnection);
  if (!accessToken) return;

  const attendeeConnections = invitees.length
    ? await db.googleCalendarConnection.findMany({
        where: {
          companyId: actor.companyId,
          OR: invitees.map((invitee) => personColumnsFor(invitee)),
        },
        select: { googleEmail: true },
      })
    : [];

  const googleEventId = await createEvent(accessToken, {
    title: meeting.title,
    description: meeting.description,
    start: meeting.startAt,
    end: meeting.endAt,
    location: meeting.location,
    attendeeEmails: attendeeConnections.map((c) => c.googleEmail),
  });
  if (!googleEventId) return;

  await db.meeting.update({
    where: { id: meeting.id },
    data: { googleEventId },
  });
}

/** Confirms every invited person actually belongs to this company. */
async function validateParticipants(
  actor: SessionActor,
  participants: { kind: "employee" | "account"; id: string }[]
): Promise<{ ok: true } | WriteFailure> {
  const employeeIds = participants
    .filter((p) => p.kind === "employee")
    .map((p) => p.id);
  const accountIds = participants
    .filter((p) => p.kind === "account")
    .map((p) => p.id);

  const [employees, accounts] = await Promise.all([
    employeeIds.length
      ? db.employee.findMany({
          where: { id: { in: employeeIds }, companyId: actor.companyId, deletedAt: null },
          select: { id: true },
        })
      : [],
    accountIds.length
      ? db.companyAccount.findMany({
          where: { id: { in: accountIds }, companyId: actor.companyId, deletedAt: null },
          select: { id: true },
        })
      : [],
  ]);

  const found = new Set([
    ...employees.map((e) => e.id),
    ...accounts.map((a) => a.id),
  ]);

  const missing = participants.find((p) => !found.has(p.id));
  if (missing) {
    return invalidReference(
      "participants",
      "One of the people invited could not be found."
    );
  }

  return { ok: true };
}

export type MeetingCancelSubject = {
  id: string;
  organizerEmployeeId: string | null;
  organizerAccountId: string | null;
  googleEventId: string | null;
};

/**
 * The one record the route needs to both check `canCancelMeeting` and act —
 * `null` if it doesn't exist in this company, the same "no such record" 404
 * every other `find*` in this codebase returns.
 */
export function findMeetingCancelSubject(
  actor: SessionActor,
  meetingId: string
): Promise<MeetingCancelSubject | null> {
  return db.meeting.findFirst({
    where: { id: meetingId, companyId: actor.companyId },
    select: {
      id: true,
      organizerEmployeeId: true,
      organizerAccountId: true,
      googleEventId: true,
    },
  });
}

/**
 * Cancels the meeting in WorkPulse, and — best-effort — deletes the mirrored
 * event on the organizer's Google Calendar if one was created. The Google
 * delete never blocks or fails the cancellation itself.
 */
export async function cancelMeeting(
  actor: SessionActor,
  meeting: MeetingCancelSubject
): Promise<void> {
  if (meeting.googleEventId) {
    const organizer = meeting.organizerEmployeeId
      ? { kind: "employee" as const, id: meeting.organizerEmployeeId }
      : meeting.organizerAccountId
        ? { kind: "account" as const, id: meeting.organizerAccountId }
        : null;

    if (organizer) {
      const organizerConnection = await db.googleCalendarConnection.findFirst({
        where: { companyId: actor.companyId, ...personColumnsFor(organizer) },
        select: { refreshTokenEncrypted: true },
      });

      if (organizerConnection) {
        const accessToken = await accessTokenFor(organizerConnection);
        if (accessToken) {
          await deleteEvent(accessToken, meeting.googleEventId);
        }
      }
    }
  }

  await db.meeting.update({
    where: { id: meeting.id },
    data: { status: "Cancelled" },
  });
}
