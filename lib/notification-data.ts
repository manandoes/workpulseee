import { db } from "@/lib/db";
import type { SessionActor } from "@/lib/permissions";
import { daysFromToday, OPEN_STATUSES } from "@/lib/tasks";
import {
  announcementPostedMessage,
  DEADLINE_WARNING_DAYS,
  deadlineDedupeKey,
  deadlineMessage,
  meetingScheduledMessage,
  requestDecidedMessage,
  requestSubmittedMessage,
  resolveApproversFor,
  resolveChannels,
  resolveCompletionWatchers,
  taskAssignedMessage,
  taskCompletedMessage,
  type ChannelPreferences,
} from "@/lib/notifications";
import {
  notificationEmailBody,
  requestDecisionEmailBody,
  sendEmail,
} from "@/lib/mailer";
import { loadEmailConfig } from "@/lib/company-email-config";
import { sendWhatsApp } from "@/lib/whatsapp";
import { sendPush } from "@/lib/push";
import { paginationMeta, type PaginationMeta } from "@/lib/pagination";
import type {
  NotificationType,
  RequestStatus,
  RequestType,
} from "@/lib/generated/prisma/enums";

/**
 * Database access and delivery for notifications (Architecture.md section 7 —
 * "event handler creates an in-app notification + queues email").
 *
 * Every notification in the app goes through `deliver` below, which writes the
 * bell row and then fans the same sentence out to whichever of email, WhatsApp
 * and Web Push that recipient still has switched on. Nothing here ever throws:
 * like `safeRecalcEmployeeWorkload`, a failed notification must never turn a
 * saved task or request into a 500.
 */

/** Which recipient column a query or write should use for this actor. */
function recipientWhere(actor: SessionActor) {
  return actor.accountType === "employee"
    ? { recipientEmployeeId: actor.id }
    : { recipientAccountId: actor.id };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * One person to notify, named the same way the schema names them: an Employee
 * or a CompanyAccount, never both.
 */
export type Recipient =
  | { employeeId: string; accountId?: never }
  | { accountId: string; employeeId?: never };

type DeliverArgs = {
  companyId: string;
  recipient: Recipient;
  type: NotificationType;
  /** The sentence every channel shows. Built in `lib/notifications.ts`. */
  message: string;
  link?: string;
  /**
   * Set only by sweeps that could otherwise repeat themselves. A second
   * delivery under a key already used in this company is silently dropped.
   */
  dedupeKey?: string;
  /**
   * A richer email than the generic one, for notifications that have something
   * more to say in an inbox than in a toast — currently only a request
   * decision, which carries the approver's note.
   */
  email?: { subject: string; text: string };
};

/** Everything delivery needs to know about who it is reaching. */
type LoadedRecipient = {
  name: string;
  email: string | null;
  phone: string | null;
  preferences: ChannelPreferences;
  pushSubscriptions: {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
};

const PUSH_SUBSCRIPTION_SELECT = {
  id: true,
  endpoint: true,
  p256dh: true,
  auth: true,
} as const;

const PREFERENCES_SELECT = {
  emailEnabled: true,
  whatsappEnabled: true,
  pushEnabled: true,
} as const;

/**
 * Load a recipient's name, contact points, toggles and subscribed browsers.
 *
 * One query rather than four: the channel decision needs all of it, and a
 * notification is already on the write path of whatever just happened.
 *
 * An employee's personal email is preferred over their company one for the
 * same reason `notifyRequestDecided` has always preferred it — these are
 * messages about their own work, and the personal address is the one they read
 * on a phone.
 */
async function loadRecipient(
  companyId: string,
  recipient: Recipient
): Promise<LoadedRecipient | null> {
  if (recipient.employeeId) {
    const employee = await db.employee.findFirst({
      where: { id: recipient.employeeId, companyId, deletedAt: null },
      select: {
        fullName: true,
        companyEmail: true,
        personalEmail: true,
        phone: true,
        notificationPrefs: { select: PREFERENCES_SELECT },
        pushSubscriptions: { select: PUSH_SUBSCRIPTION_SELECT },
      },
    });

    if (!employee) return null;

    return {
      name: employee.fullName,
      email: employee.personalEmail ?? employee.companyEmail,
      phone: employee.phone,
      preferences: employee.notificationPrefs,
      pushSubscriptions: employee.pushSubscriptions,
    };
  }

  const account = await db.companyAccount.findFirst({
    where: { id: recipient.accountId, companyId, deletedAt: null },
    select: {
      fullName: true,
      workEmail: true,
      phone: true,
      notificationPrefs: { select: PREFERENCES_SELECT },
      pushSubscriptions: { select: PUSH_SUBSCRIPTION_SELECT },
    },
  });

  if (!account) return null;

  return {
    name: account.fullName,
    email: account.workEmail,
    phone: account.phone,
    preferences: account.notificationPrefs,
    pushSubscriptions: account.pushSubscriptions,
  };
}

/**
 * An absolute URL for a link that is stored relative.
 *
 * The bell resolves `/tasks` against the page it is already on, but an inbox
 * cannot, so email sends an absolute link or no link at all rather than one
 * that is guaranteed to be dead. Routes build these from the request origin;
 * this runs on write paths and in jobs, where there is no request to read.
 */
function absoluteLink(link: string | undefined): string | null {
  const base = process.env.NEXTAUTH_URL;
  if (!link || !base) return null;
  return `${base.replace(/\/$/, "")}${link}`;
}

/** The email subject line for each kind of notification. */
const EMAIL_SUBJECTS: Record<NotificationType, string> = {
  TaskAssigned: "A task has been assigned to you",
  TaskCompleted: "A task was completed",
  DeadlineApproaching: "A deadline is coming up",
  RequestSubmitted: "A new request needs your decision",
  RequestDecided: "Your request has been decided",
  MeetingScheduled: "You've been invited to a meeting",
  AnnouncementPosted: "A new company announcement was posted",
};

/**
 * Write the bell row, then deliver the same sentence on every channel this
 * recipient still wants it on.
 *
 * The bell row is written first and is the only part that must succeed: it is
 * the durable record of the event, and its id is what a push notification
 * clicks back to. Each outbound channel is then best-effort and independently
 * caught, so a rejected WhatsApp template cannot cost the recipient their
 * email.
 */
async function deliver({
  companyId,
  recipient,
  type,
  message,
  link,
  dedupeKey,
  email,
}: DeliverArgs): Promise<void> {
  let notificationId: string;

  try {
    const created = await db.notification.create({
      data: {
        companyId,
        recipientEmployeeId: recipient.employeeId,
        recipientAccountId: recipient.accountId,
        type,
        message,
        link,
        dedupeKey,
      },
      select: { id: true },
    });
    notificationId = created.id;
  } catch (cause) {
    /**
     * A unique-constraint failure here can only be `dedupeKey`: this company
     * has already been told this exact thing, which is precisely what the key
     * exists to detect. It is the sweep working, not an error.
     */
    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "P2002"
    ) {
      return;
    }

    console.error("[notifications] Could not create a notification", { cause });
    return;
  }

  let person: LoadedRecipient | null = null;
  try {
    person = await loadRecipient(companyId, recipient);
  } catch (cause) {
    console.error("[notifications] Could not load the recipient", { cause });
  }

  // The bell row is written and is enough on its own; the rest is delivery.
  if (!person) return;

  const channels = resolveChannels(type, person.preferences, {
    email: person.email,
    phone: person.phone,
    hasPushSubscription: person.pushSubscriptions.length > 0,
  });

  await Promise.all(
    channels.map(async (channel) => {
      try {
        switch (channel) {
          case "InApp":
            // Already written above — the bell row *is* the in-app channel.
            return;

          case "Email": {
            const body =
              email ??
              notificationEmailBody({
                recipientName: person.name,
                subject: EMAIL_SUBJECTS[type],
                message,
                link: absoluteLink(link),
              });
            await sendEmail(
              { to: person.email!, ...body },
              await loadEmailConfig(companyId)
            );
            return;
          }

          case "WhatsApp":
            await sendWhatsApp({
              to: person.phone!,
              recipientName: person.name,
              message,
            });
            return;

          case "Push":
            await sendPush(person.pushSubscriptions, {
              title: EMAIL_SUBJECTS[type],
              body: message,
              link: link ?? null,
              notificationId,
            });
            return;
        }
      } catch (cause) {
        console.error(`[notifications] ${channel} delivery failed`, { cause });
      }
    })
  );
}

// ---------------------------------------------------------------------------
// The events that notify
// ---------------------------------------------------------------------------

/** A new request was submitted — tell whoever can decide on it. */
export async function notifyRequestSubmitted(request: {
  id: string;
  companyId: string;
  type: RequestType;
  subject: string;
  employee: { id: string; fullName: string; managerAccountId: string | null };
}): Promise<void> {
  try {
    const accounts = await db.companyAccount.findMany({
      where: { companyId: request.companyId, deletedAt: null },
      select: { id: true, role: true },
    });

    const approverIds = resolveApproversFor(accounts, request.employee);
    const message = requestSubmittedMessage(
      request.employee.fullName,
      request.type,
      request.subject
    );

    await Promise.all(
      approverIds.map((id) =>
        deliver({
          companyId: request.companyId,
          recipient: { accountId: id },
          type: "RequestSubmitted",
          message,
          link: `/requests/${request.id}`,
        })
      )
    );
  } catch (cause) {
    console.error("[notifications] Could not notify approvers", { cause });
  }
}

/**
 * A request was approved or rejected — tell the employee.
 *
 * Passes its own email body rather than the generic one, because the
 * approver's note is worth carrying into the inbox and has no room in a
 * one-line notification.
 */
export async function notifyRequestDecided(request: {
  id: string;
  companyId: string;
  subject: string;
  status: RequestStatus;
  decisionNote: string | null;
  employee: {
    id: string;
    fullName: string;
    companyEmail: string;
    personalEmail: string | null;
  };
}): Promise<void> {
  try {
    await deliver({
      companyId: request.companyId,
      recipient: { employeeId: request.employee.id },
      type: "RequestDecided",
      message: requestDecidedMessage(request.subject, request.status),
      link: `/my-space/requests/${request.id}`,
      email: requestDecisionEmailBody({
        employeeName: request.employee.fullName,
        requestSubject: request.subject,
        status: request.status,
        decisionNote: request.decisionNote,
      }),
    });
  } catch (cause) {
    console.error("[notifications] Could not notify the employee", { cause });
  }
}

/**
 * Work has landed on someone — tell the new assignee.
 *
 * Called when a task is created with an assignee and when an edit moves one to
 * a different person. Never fires for the actor assigning work to themselves:
 * they are looking at the screen that did it.
 */
export async function notifyTaskAssigned(task: {
  id: string;
  companyId: string;
  title: string;
  dueDate: Date | null;
  assigneeId: string;
  assignedById: string;
}): Promise<void> {
  if (task.assigneeId === task.assignedById) return;

  try {
    await deliver({
      companyId: task.companyId,
      recipient: { employeeId: task.assigneeId },
      type: "TaskAssigned",
      message: taskAssignedMessage(task.title, task.dueDate),
      link: `/tasks?taskId=${task.id}`,
    });
  } catch (cause) {
    console.error("[notifications] Could not notify the assignee", { cause });
  }
}

/**
 * A task reached Done — tell whoever is accountable for it.
 *
 * Per completion rather than as a daily digest, which is what the Owner asked
 * for: the moment the work lands is when a lead wants to know.
 */
export async function notifyTaskCompleted(task: {
  id: string;
  companyId: string;
  title: string;
  assigneeName: string | null;
  projectLeadAccountId: string | null;
  createdById: string | null;
  /** Who marked it done, so they are not told about their own click. */
  completedByAccountId: string | null;
}): Promise<void> {
  try {
    const accounts = await db.companyAccount.findMany({
      where: { companyId: task.companyId, deletedAt: null },
      select: { id: true, role: true },
    });

    const watchers = resolveCompletionWatchers(accounts, task).filter(
      (id) => id !== task.completedByAccountId
    );

    const message = taskCompletedMessage(task.title, task.assigneeName);

    await Promise.all(
      watchers.map((id) =>
        deliver({
          companyId: task.companyId,
          recipient: { accountId: id },
          type: "TaskCompleted",
          message,
          link: `/tasks?taskId=${task.id}`,
        })
      )
    );
  } catch (cause) {
    console.error("[notifications] Could not notify the watchers", { cause });
  }
}

/**
 * A deadline is closing in — tell the assignee.
 *
 * Driven by `jobs/notifyDeadlines.ts` rather than by an event, so it carries a
 * dedupe key: the sweep runs daily and would otherwise repeat itself every
 * night until the task was finished.
 */
export async function notifyDeadlineApproaching(task: {
  id: string;
  companyId: string;
  title: string;
  dueDate: Date;
  assigneeId: string;
  daysUntilDue: number;
}): Promise<void> {
  try {
    await deliver({
      companyId: task.companyId,
      recipient: { employeeId: task.assigneeId },
      type: "DeadlineApproaching",
      message: deadlineMessage(task.title, task.daysUntilDue),
      link: `/tasks?taskId=${task.id}`,
      dedupeKey: deadlineDedupeKey(task.id, task.dueDate, task.daysUntilDue),
    });
  } catch (cause) {
    console.error("[notifications] Could not send a deadline warning", {
      cause,
    });
  }
}

/**
 * Warn every assignee in one company whose deadline is at a warning milestone.
 *
 * Reads only the exact due dates being warned about rather than a range, which
 * lets `@@index([companyId, status, dueDate])` serve the query and keeps the
 * sweep proportional to the work that is actually due rather than to the size
 * of the company's backlog.
 *
 * Deadlines are stored at UTC midnight, so "the day before" is exact date
 * arithmetic rather than a window — the same reasoning `isOverdue` follows.
 *
 * Returns how many warnings it delivered. A task whose warning was already
 * sent is counted here but dropped by `dedupeKey` at the point of writing, so
 * the number is "warnings due today", not "messages sent".
 */
export async function warnCompanyDeadlines(
  companyId: string,
  now: Date = new Date()
): Promise<number> {
  const milestones = new Map<number, Date>();
  for (const days of DEADLINE_WARNING_DAYS) {
    milestones.set(days, daysFromToday(now, days));
  }

  const tasks = await db.task.findMany({
    where: {
      companyId,
      deletedAt: null,
      status: { in: [...OPEN_STATUSES] },
      dueDate: { in: [...milestones.values()] },
      assigneeId: { not: null },
    },
    select: { id: true, title: true, dueDate: true, assigneeId: true },
  });

  let warned = 0;

  for (const task of tasks) {
    // Narrowing only: the query already excluded null on both.
    if (!task.dueDate || !task.assigneeId) continue;

    const daysUntilDue = [...milestones.entries()].find(
      ([, date]) => date.getTime() === task.dueDate!.getTime()
    )?.[0];
    if (daysUntilDue === undefined) continue;

    await notifyDeadlineApproaching({
      id: task.id,
      companyId,
      title: task.title,
      dueDate: task.dueDate,
      assigneeId: task.assigneeId,
      daysUntilDue,
    });
    warned += 1;
  }

  return warned;
}

/**
 * A meeting was booked — tell an invited participant.
 *
 * Never called for the organizer themselves (`lib/calendar-data.ts`'s
 * `proposeMeeting` excludes them from its recipient list) — the same "don't
 * notify the person who just did it" rule `notifyTaskAssigned` follows.
 */
export async function notifyMeetingScheduled(meeting: {
  id: string;
  companyId: string;
  title: string;
  startAt: Date;
  organizerName: string;
  recipient: Recipient;
}): Promise<void> {
  try {
    await deliver({
      companyId: meeting.companyId,
      recipient: meeting.recipient,
      type: "MeetingScheduled",
      message: meetingScheduledMessage(
        meeting.title,
        meeting.startAt,
        meeting.organizerName
      ),
      link: `/calendar?meetingId=${meeting.id}`,
    });
  } catch (cause) {
    console.error("[notifications] Could not notify a meeting participant", {
      cause,
    });
  }
}

/**
 * A new company announcement went up — tell every active Employee and every
 * other CompanyAccount in the company. The poster is excluded, the same
 * "don't notify the person who just did it" rule `notifyTaskAssigned` and
 * `notifyMeetingScheduled` follow.
 */
export async function notifyAnnouncementPosted(announcement: {
  id: string;
  title: string;
  companyId: string;
  createdByAccountId: string;
  createdByAccount: { fullName: string };
}): Promise<void> {
  try {
    const [employees, accounts] = await Promise.all([
      db.employee.findMany({
        where: { companyId: announcement.companyId, deletedAt: null },
        select: { id: true },
      }),
      db.companyAccount.findMany({
        where: {
          companyId: announcement.companyId,
          deletedAt: null,
          id: { not: announcement.createdByAccountId },
        },
        select: { id: true },
      }),
    ]);

    const message = announcementPostedMessage(
      announcement.createdByAccount.fullName,
      announcement.title
    );
    const link = `/announcements?announcementId=${announcement.id}`;

    await Promise.all([
      ...employees.map((employee) =>
        deliver({
          companyId: announcement.companyId,
          recipient: { employeeId: employee.id },
          type: "AnnouncementPosted",
          message,
          link,
        })
      ),
      ...accounts.map((account) =>
        deliver({
          companyId: announcement.companyId,
          recipient: { accountId: account.id },
          type: "AnnouncementPosted",
          message,
          link,
        })
      ),
    ]);
  } catch (cause) {
    console.error("[notifications] Could not notify about an announcement", {
      cause,
    });
  }
}

// ---------------------------------------------------------------------------
// Channel preferences
// ---------------------------------------------------------------------------

export type ChannelSettings = {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  /** The number WhatsApp would go to, or null if none is on file. */
  phone: string | null;
};

/** Which recipient column a preference or subscription row should use. */
function recipientColumns(actor: SessionActor) {
  return actor.accountType === "employee"
    ? { employeeId: actor.id }
    : { accountId: actor.id };
}

/**
 * The signed-in person's channel settings.
 *
 * No stored row means every channel is on, so the defaults are returned rather
 * than a row being created just to be read — the table stays empty until
 * somebody actually changes something.
 */
export async function loadChannelSettings(
  actor: SessionActor
): Promise<ChannelSettings> {
  const [preference, contact] = await Promise.all([
    db.notificationPreference.findFirst({
      where: { companyId: actor.companyId, ...recipientColumns(actor) },
      select: PREFERENCES_SELECT,
    }),
    actor.accountType === "employee"
      ? db.employee.findFirst({
          where: { id: actor.id, companyId: actor.companyId, deletedAt: null },
          select: { phone: true },
        })
      : db.companyAccount.findFirst({
          where: { id: actor.id, companyId: actor.companyId, deletedAt: null },
          select: { phone: true },
        }),
  ]);

  return {
    emailEnabled: preference?.emailEnabled ?? true,
    whatsappEnabled: preference?.whatsappEnabled ?? true,
    pushEnabled: preference?.pushEnabled ?? true,
    phone: contact?.phone ?? null,
  };
}

/**
 * Save the signed-in person's channel settings.
 *
 * The phone number is written back to the Employee or CompanyAccount rather
 * than duplicated here, so WhatsApp reaches the same number the rest of the
 * app already knows — and an employee editing it here is editing the same HR
 * field their profile shows. `phone` absent leaves it untouched; explicitly
 * null clears it.
 */
export async function saveChannelSettings(
  actor: SessionActor,
  settings: {
    emailEnabled: boolean;
    whatsappEnabled: boolean;
    pushEnabled: boolean;
    phone?: string | null;
  }
): Promise<void> {
  const columns = recipientColumns(actor);

  const existing = await db.notificationPreference.findFirst({
    where: { companyId: actor.companyId, ...columns },
    select: { id: true },
  });

  const values = {
    emailEnabled: settings.emailEnabled,
    whatsappEnabled: settings.whatsappEnabled,
    pushEnabled: settings.pushEnabled,
  };

  if (existing) {
    await db.notificationPreference.update({
      where: { id: existing.id },
      data: values,
    });
  } else {
    await db.notificationPreference.create({
      data: { companyId: actor.companyId, ...columns, ...values },
    });
  }

  if (settings.phone !== undefined) {
    if (actor.accountType === "employee") {
      await db.employee.updateMany({
        where: { id: actor.id, companyId: actor.companyId },
        data: { phone: settings.phone },
      });
    } else {
      await db.companyAccount.updateMany({
        where: { id: actor.id, companyId: actor.companyId },
        data: { phone: settings.phone },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Push subscriptions
// ---------------------------------------------------------------------------

/**
 * Record a browser that has agreed to receive push.
 *
 * Keyed on the endpoint, which the push service guarantees is unique to that
 * browser, so re-subscribing the same browser — which happens whenever its
 * keys rotate — updates the row rather than piling up dead ones.
 */
export async function savePushSubscription(
  actor: SessionActor,
  subscription: { endpoint: string; p256dh: string; auth: string }
): Promise<void> {
  const columns = recipientColumns(actor);

  await db.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      companyId: actor.companyId,
      ...columns,
      ...subscription,
    },
    update: {
      /**
       * Reassigned as well as re-keyed: on a shared machine the same browser
       * endpoint can end up belonging to whoever signed in last, and pushing a
       * colleague's tasks to them would be a real leak.
       */
      companyId: actor.companyId,
      employeeId: columns.employeeId ?? null,
      accountId: columns.accountId ?? null,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  });
}

/** Forget a browser that has unsubscribed. Scoped, so it only forgets its own. */
export async function deletePushSubscription(
  actor: SessionActor,
  endpoint: string
): Promise<void> {
  await db.pushSubscription.deleteMany({
    where: {
      endpoint,
      companyId: actor.companyId,
      ...recipientColumns(actor),
    },
  });
}

// ---------------------------------------------------------------------------
// Reading and clearing notifications (the bell)
// ---------------------------------------------------------------------------

export type LoadedNotification = {
  id: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/** Most recent notifications for the signed-in actor, read or not. */
export function loadNotifications(
  actor: SessionActor,
  limit = 20
): Promise<LoadedNotification[]> {
  return db.notification.findMany({
    where: { companyId: actor.companyId, ...recipientWhere(actor) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      message: true,
      link: true,
      readAt: true,
      createdAt: true,
    },
  });
}

export type LoadedNotificationPage = {
  notifications: LoadedNotification[];
} & PaginationMeta;

/**
 * The full, paginated notification history (Phases.md Phase 12 —
 * notification refinement adds `/notifications` alongside the bell's
 * last-20 dropdown, which keeps calling `loadNotifications` above
 * unchanged).
 */
export async function loadNotificationsPage(
  actor: SessionActor,
  requestedPage: number
): Promise<LoadedNotificationPage> {
  const where = { companyId: actor.companyId, ...recipientWhere(actor) };
  const total = await db.notification.count({ where });
  const meta = paginationMeta(total, requestedPage);

  const notifications = await db.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      message: true,
      link: true,
      readAt: true,
      createdAt: true,
    },
    skip: meta.skip,
    take: meta.take,
  });

  return { notifications, ...meta };
}

export function unreadNotificationCount(actor: SessionActor): Promise<number> {
  return db.notification.count({
    where: {
      companyId: actor.companyId,
      ...recipientWhere(actor),
      readAt: null,
    },
  });
}

/** Marks one notification read. A no-op if it isn't the actor's own. */
export async function markNotificationRead(
  actor: SessionActor,
  id: string
): Promise<void> {
  await db.notification.updateMany({
    where: { id, companyId: actor.companyId, ...recipientWhere(actor) },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(
  actor: SessionActor
): Promise<void> {
  await db.notification.updateMany({
    where: {
      companyId: actor.companyId,
      ...recipientWhere(actor),
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}
