import { formatDate } from "@/lib/format";
import { requestStatusLabel, requestTypeLabel } from "@/lib/requests";
import type {
  NotificationType,
  RequestStatus,
  RequestType,
} from "@/lib/generated/prisma/enums";

/**
 * Pure notification logic (Rules.md section 5) — free of Prisma/NextAuth
 * imports, like `lib/tasks.ts`/`lib/requests.ts`, so it can be unit-tested
 * directly. The database-touching half lives in `lib/notification-data.ts`,
 * the same split `lib/tasks.ts`/`lib/task-data.ts` already draws.
 */

export type ApproverAccount = { id: string; role: string };

/**
 * Which company accounts should hear about a new request from this employee.
 *
 * Owner/Admin/HR can decide on anyone's request (`canApproveRequests` minus
 * the Manager case), so they always hear about a new one. A Manager only
 * decides on their own direct reports (`canDecideOnRequest`), so only the
 * employee's own manager account — and only if that account is a Manager —
 * is added on top. Deduplicated, since a manager account might already be an
 * Owner/Admin/HR account in an unusual setup.
 */
export function resolveApproversFor(
  accounts: ApproverAccount[],
  employee: { managerAccountId: string | null }
): string[] {
  const ids = new Set<string>();

  for (const account of accounts) {
    if (
      account.role === "Owner" ||
      account.role === "Admin" ||
      account.role === "HR"
    ) {
      ids.add(account.id);
    }
  }

  if (employee.managerAccountId) {
    const manager = accounts.find((a) => a.id === employee.managerAccountId);
    if (manager?.role === "Manager") ids.add(manager.id);
  }

  return [...ids];
}

/**
 * What a request's approvers see when it is submitted.
 *
 * The type name sits in parentheses rather than before the word "request":
 * `requestTypeLabel` already reads naturally as a request name for some types
 * ("HR request", "Document request") but not others ("Leave", "Reimbursement"),
 * and this phrasing reads correctly for all eight without special-casing any.
 */
export function requestSubmittedMessage(
  employeeName: string,
  type: RequestType,
  subject: string
): string {
  return `${employeeName} submitted a new request (${requestTypeLabel(type)}): ${subject}`;
}

/** What the employee sees when their request is decided. */
export function requestDecidedMessage(
  subject: string,
  status: RequestStatus
): string {
  return `Your request "${subject}" was ${requestStatusLabel(status).toLowerCase()}.`;
}

// ---------------------------------------------------------------------------
// Delivery channels
// ---------------------------------------------------------------------------

/**
 * Where a notification can go.
 *
 * Not a Prisma enum: no column ever stores one. A channel is decided at send
 * time from the notification's type and the recipient's preferences, so it is
 * application logic and belongs here, beside the rule that decides it.
 */
export type NotificationChannel = "InApp" | "Email" | "WhatsApp" | "Push";

/**
 * The channels each kind of notification is worth spending.
 *
 * The whole policy in one table, rather than a condition per call site.
 * `InApp` appears in every row and `resolveChannels` will not drop it — the
 * bell is the record that the event happened at all.
 *
 * `RequestSubmitted` deliberately stays off Email and WhatsApp: approvers see
 * a queue of these all day, and the existing Phase 7 behaviour was in-app
 * only, so it gains push and nothing else. Everything else earns the full set.
 *
 * `MeetingScheduled` (Plan.md Phase 17) is a direct personal invite — the
 * same weight as `TaskAssigned` — so it earns the full set too.
 */
const CHANNELS_BY_TYPE: Record<
  NotificationType,
  readonly NotificationChannel[]
> = {
  TaskAssigned: ["InApp", "Push", "Email", "WhatsApp"],
  TaskCompleted: ["InApp", "Push", "Email", "WhatsApp"],
  DeadlineApproaching: ["InApp", "Push", "Email", "WhatsApp"],
  RequestSubmitted: ["InApp", "Push"],
  RequestDecided: ["InApp", "Push", "Email", "WhatsApp"],
  MeetingScheduled: ["InApp", "Push", "Email", "WhatsApp"],
  // A company-wide broadcast, the same weight as `MeetingScheduled` — a
  // direct message everyone in the company gets, so it earns the full set.
  AnnouncementPosted: ["InApp", "Push", "Email", "WhatsApp"],
  /**
   * Deliberately the same narrow set as `RequestSubmitted`, for a different
   * reason: this one expires. It asks a question worth half an hour, and the
   * two channels that can carry its buttons — the bell and a push
   * notification — are the two that arrive inside that window. An email or a
   * WhatsApp message read the next morning would be asking about a session
   * already closed, and WhatsApp would bill a conversation per person per
   * evening to do it.
   */
  LogoutReminder: ["InApp", "Push"],
};

/**
 * A recipient's stored toggles, or `null` when they have never changed any.
 *
 * No row means every channel is on — the product default — so `null` is a
 * real, expected value here rather than a missing record to guard against.
 */
export type ChannelPreferences = {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
} | null;

/** How to actually reach someone, as far as we know. */
export type ContactPoints = {
  email: string | null;
  phone: string | null;
  /** Whether any browser of theirs is signed up for push. */
  hasPushSubscription: boolean;
};

export const DEFAULT_CHANNEL_PREFERENCES = {
  emailEnabled: true,
  whatsappEnabled: true,
  pushEnabled: true,
} as const;

/**
 * A phone number we are willing to hand to Meta.
 *
 * E.164: a leading `+`, a country code that cannot start with zero, and 8 to
 * 15 digits in total. Anything else — a local number, or one still carrying
 * the spaces and dashes someone typed — is dropped rather than sent, because
 * the Cloud API bills the attempt either way and a malformed number is a
 * guaranteed waste of it.
 */
export function isDeliverablePhone(phone: string | null): phone is string {
  if (!phone) return false;
  return /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

/**
 * Turn a number someone typed into E.164, or `null` if it cannot be.
 *
 * Strips the spaces, dashes and brackets people naturally type, and accepts a
 * leading `00` as the international prefix it is. Deliberately does *not*
 * guess a country code for a bare local number: guessing wrong sends a
 * stranger a colleague's work.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/[\s().-]/g, "");
  const e164 = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;

  return isDeliverablePhone(e164) ? e164 : null;
}

/**
 * Which channels this notification should actually go out on.
 *
 * Three things narrow the type's channel set: the recipient's toggles, whether
 * we hold the contact detail the channel needs, and — for push — whether any
 * browser is subscribed. A channel we cannot deliver on is dropped here rather
 * than attempted and failed, so the dispatcher never calls a provider it has
 * no address for.
 */
export function resolveChannels(
  type: NotificationType,
  preferences: ChannelPreferences,
  contact: ContactPoints
): NotificationChannel[] {
  const prefs = preferences ?? DEFAULT_CHANNEL_PREFERENCES;

  return CHANNELS_BY_TYPE[type].filter((channel) => {
    switch (channel) {
      case "InApp":
        return true;
      case "Email":
        return prefs.emailEnabled && Boolean(contact.email);
      case "WhatsApp":
        return prefs.whatsappEnabled && isDeliverablePhone(contact.phone);
      case "Push":
        return prefs.pushEnabled && contact.hasPushSubscription;
    }
  });
}

// ---------------------------------------------------------------------------
// Who hears about a task
// ---------------------------------------------------------------------------

/**
 * Which company accounts should hear that a task was finished.
 *
 * Owner and Admin run the company and see everything, so they always hear.
 * Beyond them it is whoever is accountable for this particular piece of work:
 * the lead of its project, and the account that raised it — which, for a
 * standalone task, is the only person who was ever watching it. Deduplicated,
 * since the lead is often also the person who raised it.
 *
 * Managers at large are excluded on purpose. A Manager who leads neither the
 * project nor the task has no more stake in it than any other colleague, and
 * "task completed" sent to every Manager in the company is the noise that gets
 * a notification system muted.
 */
export function resolveCompletionWatchers(
  accounts: ApproverAccount[],
  task: { projectLeadAccountId: string | null; createdById: string | null }
): string[] {
  const ids = new Set<string>();

  for (const account of accounts) {
    if (account.role === "Owner" || account.role === "Admin") {
      ids.add(account.id);
    }
  }

  for (const id of [task.projectLeadAccountId, task.createdById]) {
    if (id && accounts.some((account) => account.id === id)) ids.add(id);
  }

  return [...ids];
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** What an employee sees when work lands on them. */
export function taskAssignedMessage(
  taskTitle: string,
  dueDate: Date | null
): string {
  const due = dueDate ? ` Due ${formatDate(dueDate)}.` : "";
  return `You have been assigned "${taskTitle}".${due}`;
}

/** What the watchers see when a task reaches Done. */
export function taskCompletedMessage(
  taskTitle: string,
  employeeName: string | null
): string {
  return `${employeeName ?? "Someone"} completed "${taskTitle}".`;
}

/**
 * What an assignee sees as a deadline closes in.
 *
 * Four phrasings rather than one with a number in it, because "due in 0 days"
 * is how a deadline reminder loses its reader.
 */
export function deadlineMessage(
  taskTitle: string,
  daysUntilDue: number
): string {
  if (daysUntilDue < 0) return `"${taskTitle}" is overdue.`;
  if (daysUntilDue === 0) return `"${taskTitle}" is due today.`;
  if (daysUntilDue === 1) return `"${taskTitle}" is due tomorrow.`;
  return `"${taskTitle}" is due in ${daysUntilDue} days.`;
}

/**
 * How far ahead of a deadline to warn its assignee, in days.
 *
 * Two touches per deadline: the day before, so there is still an evening to do
 * something about it, and the morning it is due. Warning earlier than that is
 * how a deadline reminder becomes something people filter, and every entry
 * here costs a WhatsApp conversation per task per company.
 *
 * Overdue work is deliberately absent: the dashboard's exceptions panel
 * already carries an `OverdueTask` alert (`lib/alerts.ts`), and a daily "still
 * overdue" message would be the same fact restated indefinitely.
 */
export const DEADLINE_WARNING_DAYS = [1, 0] as const;

/**
 * The key that stops the daily sweep re-sending the same warning.
 *
 * Scoped to the task, the deadline it is warning about, and which of the two
 * warnings this is. So: a task moved to a new due date is warned about again
 * (the new deadline is genuinely new information), the day-before and day-of
 * warnings are both allowed through, and a sweep that runs twice in one day
 * delivers nothing the second time.
 */
export function deadlineDedupeKey(
  taskId: string,
  dueDate: Date,
  daysUntilDue: number
): string {
  return `deadline:${taskId}:${dueDate.toISOString().slice(0, 10)}:${daysUntilDue}`;
}

// ---------------------------------------------------------------------------
// Calendar (Plan.md Phase 17)
// ---------------------------------------------------------------------------

/** What an invited participant sees when a meeting is booked with them. */
export function meetingScheduledMessage(
  title: string,
  startAt: Date,
  organizerName: string
): string {
  return `${organizerName} scheduled "${title}" with you on ${formatDate(startAt)}.`;
}

/**
 * What a test message says.
 *
 * Kept here with every other notification sentence, for the reason
 * `lib/whatsapp.ts` explains: the wording is a template *variable*, so it can
 * change without another approval round-trip with Meta.
 *
 * Deliberately says which number it reached. The whole point of the test is to
 * find out whether the number on file is the right one, and a message that
 * arrives on the wrong phone proves nothing unless it says which number was
 * dialled.
 */
export function whatsappTestMessage(phone: string): string {
  return `This is a test message from WorkPulse. Notifications for your account will be sent to this number (${phone}).`;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

/** What everyone sees when a new company announcement is posted. */
export function announcementPostedMessage(
  authorName: string,
  title: string
): string {
  return `${authorName} posted an announcement: "${title}"`;
}

// ---------------------------------------------------------------------------
// The end-of-day logout nudge
// ---------------------------------------------------------------------------

/**
 * What somebody still clocked in past the end of the working day sees.
 *
 * Says what will happen and what time will be recorded, because this
 * notification is the only warning before the session is closed on their
 * behalf and their day is backdated. A nudge that said only "you are still
 * logged in" would leave the person who ignored it with no way to know why
 * they lost the evening.
 */
export function logoutReminderMessage(recordedEndAtLabel: string): string {
  return `You are still logged in. Choose "I'm here" to stay clocked in — otherwise you'll be logged out automatically, with your day recorded as ending at ${recordedEndAtLabel}.`;
}

/** What they see once the sweep has closed the session for them. */
export function autoLoggedOutMessage(recordedEndAtLabel: string): string {
  return `You were logged out automatically — there was no answer to your logout reminder. Your day was recorded as ending at ${recordedEndAtLabel}.`;
}

/**
 * The key that stops a re-run of the sweep sending the same reminder twice.
 *
 * Scoped to the session and the slot the reminder is *for* (the `dueAt` that
 * `resolveLogoutNudge` computed), not to when the sweep happened to notice —
 * the same reasoning as `deadlineDedupeKey`. A sweep running every fifteen
 * minutes therefore delivers one reminder per slot, however many of its runs
 * see the slot as due before the write lands.
 */
export function logoutReminderDedupeKey(
  attendanceRecordId: string,
  dueAt: Date
): string {
  return `logout-reminder:${attendanceRecordId}:${dueAt.toISOString()}`;
}

/** The same, for the single notification that follows an automatic logout. */
export function autoLogoutDedupeKey(attendanceRecordId: string): string {
  return `auto-logout:${attendanceRecordId}`;
}
