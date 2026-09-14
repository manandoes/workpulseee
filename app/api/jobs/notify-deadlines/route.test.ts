import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

/**
 * The cron secret guard on the deadline sweep.
 *
 * This is the one job endpoint that sends things to real people, so an
 * unauthenticated caller reaching it would mean anyone on the internet could
 * make the app send WhatsApp messages at our expense. Every case here is
 * refused before the handler touches the database, which is also why these run
 * without one.
 *
 * The sweep's own behaviour — which milestones warn, and what stops a warning
 * repeating — is covered by `lib/notifications.test.ts`.
 *
 * Built with `NextRequest` directly rather than `jsonRequest` from
 * `lib/test-helpers.ts`, which has no way to set an Authorization header and is
 * shared by every other route test.
 */
vi.mock("@/jobs/notifyDeadlines", () => ({
  notifyDeadlines: vi.fn(async () => ({ companies: 0, warnings: 0 })),
}));

const SECRET = "test-cron-secret";

function request(authorization?: string) {
  return new NextRequest("http://localhost/api/jobs/notify-deadlines", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

describe("POST /api/jobs/notify-deadlines", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("refuses a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("refuses a wrong secret", async () => {
    const response = await POST(request("Bearer not-the-secret"));
    expect(response.status).toBe(401);
  });

  it("refuses the right secret sent without the Bearer scheme", async () => {
    const response = await POST(request(SECRET));
    expect(response.status).toBe(401);
  });

  it("runs the sweep for the right secret", async () => {
    const response = await POST(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      swept: { companies: 0, warnings: 0 },
    });
  });

  it("fails closed when the server has no secret configured", async () => {
    // Never 200: an unset secret must not mean "let everybody in".
    delete process.env.CRON_SECRET;

    const response = await POST(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
  });
});
