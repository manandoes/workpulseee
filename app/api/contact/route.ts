import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/mailer";

const RECIPIENT = "team@automovalabs.tech";
const SUBJECT_PREFIX = "WorkPulse Contact";

type ContactPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const CONTACT_SCHEMA = {
  name: { type: "string", minLength: 1, maxLength: 200 },
  email: { type: "string", format: "email", maxLength: 254 },
  subject: { type: "string", minLength: 1, maxLength: 200 },
  message: { type: "string", minLength: 1, maxLength: 5000 },
};

/**
 * POST /api/contact — public contact form submission.
 *
 * Delivers the message to the WorkPulse team inbox via the existing mailer.
 * No authentication is required; rate-limiting is left to the hosting layer
 * (Vercel) for now.
 */
export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body." },
      { status: 400 }
    );
  }

  const parsed = safeParseContact(payload);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.reason },
      { status: 400 }
    );
  }

  const { name, email, subject, message } = parsed.data;

  const text = [
    `From: ${name} <${email}>`,
    `Subject: ${subject}`,
    "",
    message,
    "",
    "---",
    `Submitted from ${request.headers.get("x-forwarded-for") ?? request.url}`,
  ].join("\n");

  const result = await sendEmail(
    {
      to: RECIPIENT,
      subject: `${SUBJECT_PREFIX}: ${subject}`,
      text,
    },
    undefined // use global mailer config (env vars)
  );

  if (!result.delivered) {
    console.error("[contact] Email delivery failed", {
      to: RECIPIENT,
      reason: result.reason,
    });
    return NextResponse.json(
      { error: "Message could not be sent. Please try again later." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

function safeParseContact(value: unknown):
  | { ok: true; data: ContactPayload }
  | { ok: false; reason: string } {
  if (value === null || value === undefined || typeof value !== "object") {
    return { ok: false, reason: "Invalid payload" };
  }

  const obj = value as Record<string, unknown>;

  const name = obj.name;
  const email = obj.email;
  const subject = obj.subject;
  const message = obj.message;

  if (
    typeof name !== "string" ||
    name.trim().length < 1 ||
    name.trim().length > 200
  ) {
    return { ok: false, reason: "name is required (1–200 characters)" };
  }
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return { ok: false, reason: "A valid email address is required" };
  }
  if (
    typeof subject !== "string" ||
    subject.trim().length < 1 ||
    subject.trim().length > 200
  ) {
    return { ok: false, reason: "subject is required (1–200 characters)" };
  }
  if (
    typeof message !== "string" ||
    message.trim().length < 1 ||
    message.trim().length > 5000
  ) {
    return { ok: false, reason: "message is required (1–5000 characters)" };
  }

  return {
    ok: true,
    data: {
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
    },
  };
}
