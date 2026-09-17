import type { CompanyEmailConfig } from "@/lib/company-email-config";

/**
 * Transactional email (Architecture.md section 2).
 *
 * Uses each provider's REST API directly rather than pulling in an SDK per
 * provider, since a single fetch call covers what we need from either.
 *
 * A company can configure its own Resend or Brevo identity at Settings ->
 * Email delivery (`lib/company-email-config.ts`); when it has, `sendEmail`'s
 * `config` argument carries that provider/key/from and every send goes out
 * under the company's own identity. When a company hasn't configured one
 * (`config` is `null`/absent), this falls back to the global env vars:
 * `EMAIL_FROM` plus whichever of `BREVO_API_KEY` or `RESEND_API_KEY` is set,
 * which is what picks the fallback provider. Brevo wins if both are set.
 *
 * When neither is configured the message is logged to the server console
 * instead of being sent, and the caller is told delivery did not happen. That
 * keeps local development working without silently pretending an invite was
 * emailed — the inviting admin is shown the link to share manually.
 */
export type SendResult =
  | { delivered: true }
  | { delivered: false; reason: "not_configured" | "provider_error" };

type SendArgs = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Resend accepts `from` as a single `"Name <email>"` string, which is the
 * shape this app already stores it in (env var or `Company.emailFromAddress`).
 * Brevo instead wants `{ name?, email }` as separate fields, so this splits
 * that same string for Brevo's `sender` object.
 */
function parseFromAddress(from: string): { name?: string; email: string } {
  const match = from.match(/^(.*)<(.+)>$/);
  if (!match) return { email: from.trim() };
  const name = match[1].trim();
  return { name: name || undefined, email: match[2].trim() };
}

export async function sendEmail(
  { to, subject, text }: SendArgs,
  config?: CompanyEmailConfig | null
): Promise<SendResult> {
  const envBrevoKey = process.env.BREVO_API_KEY;
  const provider = config?.provider ?? (envBrevoKey ? "brevo" : "resend");
  const apiKey = config?.apiKey ?? envBrevoKey ?? process.env.RESEND_API_KEY;
  const from = config?.from ?? process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info(
      `[mailer] Email delivery is not configured; not sending.\n  to: ${to}\n  subject: ${subject}\n  body:\n${text}`
    );
    return { delivered: false, reason: "not_configured" };
  }

  try {
    const response =
      provider === "brevo"
        ? await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
              "api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sender: parseFromAddress(from),
              to: [{ email: to }],
              subject,
              textContent: text,
            }),
          })
        : await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ from, to, subject, text }),
          });

    if (!response.ok) {
      console.error("[mailer] Provider rejected the message", {
        provider,
        status: response.status,
      });
      return { delivered: false, reason: "provider_error" };
    }

    return { delivered: true };
  } catch (cause) {
    console.error("[mailer] Could not reach the email provider", {
      provider,
      cause,
    });
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
    subject: `Set up your ${companyName} account on WorkPulse`,
    text: [
      `Hi ${employeeName},`,
      "",
      `${companyName} has added you to WorkPulse. Use the link below to choose a password and sign in:`,
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
      "Sign in to WorkPulse to see the details.",
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
    subject: `Your ${role} account for ${companyName} on WorkPulse`,
    text: [
      `Hi ${name},`,
      "",
      `${companyName} has given you a ${role} account on WorkPulse. Use the link below to choose a password and sign in:`,
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
      "You can turn these emails off under Settings in WorkPulse.",
    ].join("\n"),
  };
}
