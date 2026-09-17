import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { createTestCompany, employeeActor } from "@/lib/test-helpers";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

/**
 * No Google Cloud client exists in this environment (Plan.md — this is the
 * one phase blocked on the user providing credentials), so only the
 * "not configured" degradation path is testable here — matching Phase 13's
 * own precedent for never-configured providers.
 */
describe("GET /api/calendar/google/connect", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  });

  it("returns 503 not_configured when no Google client is set up", async () => {
    const { companyId, ownerId } = await createTestCompany();
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, ownerId));

    const response = await GET();

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe("not_configured");
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(getActor).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
