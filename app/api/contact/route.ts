import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  apiError,
  serverError,
} from "@/lib/api";
import { sendEmail } from "@/lib/mailer";
import { contactSubmitSchema } from "@/lib/validations/contact";
import { rateLimit } from "@/lib/rate-limit";

const CONTACT_SUBJECT = "WorkPulse Contact Form Submission";
const DEFAULT_RECIPIENT = "team@automovalabs.tech";

// 5 submissions per IP per hour.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

/** Reads per-request headers so the endpoint is never prerendered. */
export const dynamic = "force-dynamic";

/**
 * POST /api/contact — submit a contact form message from the public
 * marketing site (no authentication required).
 *
 * Anyone may submit; no file attachments are supported in the current UI.
 */
export async function POST(request: NextRequest) {
  // Rate-limit by IP so bots can't exhaust email budget.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("cf-connecting-ip")
    ?? "unknown";
  const rateKey = `contact:${ip}`;
  const limit = rateLimit(rateKey, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    const retryAfter = Math.ceil(RATE_WINDOW_MS / 1000);
    return new NextResponse(
      JSON.stringify({
        error: "Too many messages — please try again later.",
        code: "rate_limited",
      }),
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "Content-Type": "application/json",
        },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Expected a JSON body.", 400, "invalid_json");
  }

  const parsed = contactSubmitSchema.safeParse(payload);
  if (!parsed.success) {
    // For public endpoint, we don't want to leak validation details
    return apiError("Invalid form data", 400, "invalid_input");
  }

  const { name, email, subject, message } = parsed.data;
  const recipient = DEFAULT_RECIPIENT;

  const text = [
    `Contact Form Submission`,
    `From: ${name} <${email}>`,
    `Subject: ${subject}`,
    "",
    message,
  ].join("\n");

  // Use global email config since this is a public form
  const result = await sendEmail(
    { to: recipient, subject: CONTACT_SUBJECT, text, attachments: [] },
    null // Use global config (fallback to env vars)
  );

  if (!result.delivered) {
    return serverError(
      {
        route: "POST /api/contact",
      },
      new Error(`Contact form send failed: ${result.reason}`)
    );
  }

  return NextResponse.json({ success: true });
}