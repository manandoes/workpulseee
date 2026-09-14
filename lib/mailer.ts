/**
 * Transactional email (Architecture.md section 2).
 *
 * Uses Resend's REST API directly rather than pulling in an SDK, since a single
 * fetch call covers what we need.
 *
 * When `RESEND_API_KEY` is not configured the message is logged to the server
 * console instead of being sent, and the caller is told delivery did not
 * happen. That keeps local development working without silently pretending an
 * invite was emailed — the inviting admin is shown the link to share manually.
 */
export type SendResult =
  | { delivered: true }
  | { delivered: false; reason: "not_configured" | "provider_error" };

type SendArgs = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail({
  to,
  subject,
  text,
}: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info(
      `[mailer] Email delivery is not configured; not sending.\n  to: ${to}\n  subject: ${subject}\n  body:\n${text}`
    );
    return { delivered: false, reason: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });

    if (!response.ok) {
      console.error("[mailer] Provider rejected the message", {
        status: response.status,
      });
      return { delivered: false, reason: "provider_error" };
    }

    return { delivered: true };
  } catch (cause) {
    console.error("[mailer] Could not reach the email provider", { cause });
    return { delivered: false, reason: "provider_error" };
  }
}

export function inviteEmailBody({
  employeeName,
  companyName,
  inviteUrl,
}: {
  employeeName: string;
  companyName: string;
  inviteUrl: string;
}) {
  return {
    subject: `Set up your ${companyName} account on Talking Lens Media`,
    text: [
      `Hi ${employeeName},`,
      "",
      `${companyName} has added you to Talking Lens Media. Use the link below to choose a password and sign in:`,
      "",
      inviteUrl,
      "",
      "This link expires in 7 days. If you were not expecting it, you can ignore this email.",
    ].join("\n"),
  };
}

/**
 * Invite for a company account (Admin / Manager / HR), which lands on the
 * company dashboard rather than the employee self-service space.
 */
/**
 * Sent to an employee when their request is approved or rejected
 * (Phases.md Phase 7 — "notifications on status change").
 */
export function requestDecisionEmailBody({
  employeeName,
  requestSubject,
  status,
  decisionNote,
}: {
  employeeName: string;
  requestSubject: string;
  status: string;
  decisionNote: string | null;
}) {
  return {
    subject: `Your request "${requestSubject}" was ${status.toLowerCase()}`,
    text: [
      `Hi ${employeeName},`,
      "",
      `Your request "${requestSubject}" has been ${status.toLowerCase()}.`,
      ...(decisionNote ? ["", `Note from the approver:`, decisionNote] : []),
      "",
      "Sign in to Talking Lens Media to see the details.",
    ].join("\n"),
  };
}

export function accountInviteEmailBody({
  name,
  companyName,
  role,
  inviteUrl,
}: {
  name: string;
  companyName: string;
  role: string;
  inviteUrl: string;
}) {
  return {
    subject: `Your ${role} account for ${companyName} on Talking Lens Media`,
    text: [
      `Hi ${name},`,
      "",
      `${companyName} has given you a ${role} account on Talking Lens Media. Use the link below to choose a password and sign in:`,
      "",
      inviteUrl,
      "",
      "This link expires in 7 days. If you were not expecting it, you can ignore this email.",
    ].join("\n"),
  };
}

/**
 * The email form of any notification that has no richer body of its own
 * (Phase 13 — task assignment, completion and deadline warnings).
 *
 * The sentence itself comes from `lib/notifications.ts`, the same one the bell
 * and WhatsApp show, so a wording change lands on every channel at once.
 * `link` is absolute or absent: a relative path is meaningless in an inbox.
 */
export function notificationEmailBody({
  recipientName,
  subject,
  message,
  link,
}: {
  recipientName: string;
  subject: string;
  message: string;
  link: string | null;
}) {
  return {
    subject,
    text: [
      `Hi ${recipientName},`,
      "",
      message,
      ...(link ? ["", link] : []),
      "",
      "You can turn these emails off under Settings in Talking Lens Media.",
    ].join("\n"),
  };
}
