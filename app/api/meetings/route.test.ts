import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createEmployee,
  createTestCompany,
  employeeActor,
  jsonRequest,
} from "@/lib/test-helpers";
import { GET, POST } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

describe("POST /api/meetings", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("books a meeting and notifies the invitee", async () => {
    const { companyId } = await createTestCompany();
    const organizerId = await createEmployee(companyId);
    const inviteeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, organizerId));

    const response = await POST(
      jsonRequest("http://localhost/api/meetings", "POST", {
        title: "Kickoff",
        description: "",
        location: "",
        startAt: "2026-09-16T09:00:00.000Z",
        endAt: "2026-09-16T10:00:00.000Z",
        participants: [{ kind: "employee", id: inviteeId }],
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.meeting.participants).toHaveLength(2);

    const notification = await db.notification.findFirst({
      where: { companyId, recipientEmployeeId: inviteeId, type: "MeetingScheduled" },
    });
    expect(notification).not.toBeNull();
  });

  it("refuses a slot that conflicts with the organizer's own meeting", async () => {
    const { companyId } = await createTestCompany();
    const organizerId = await createEmployee(companyId);
    const inviteeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, organizerId));

    const first = await POST(
      jsonRequest("http://localhost/api/meetings", "POST", {
        title: "First",
        description: "",
        location: "",
        startAt: "2026-09-16T09:00:00.000Z",
        endAt: "2026-09-16T10:00:00.000Z",
        participants: [{ kind: "employee", id: inviteeId }],
      })
    );
    expect(first.status).toBe(201);

    const overlapping = await POST(
      jsonRequest("http://localhost/api/meetings", "POST", {
        title: "Overlaps",
        description: "",
        location: "",
        startAt: "2026-09-16T09:30:00.000Z",
        endAt: "2026-09-16T10:30:00.000Z",
        participants: [{ kind: "employee", id: inviteeId }],
      })
    );

    expect(overlapping.status).toBe(409);
    const body = await overlapping.json();
    expect(body.code).toBe("duplicate");
  });

  it("rejects an unauthenticated request", async () => {
    vi.mocked(getActor).mockResolvedValue(null);

    const response = await POST(
      jsonRequest("http://localhost/api/meetings", "POST", {
        title: "No session",
        participants: [],
      })
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /api/meetings", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("returns the caller's own meetings in range", async () => {
    const { companyId } = await createTestCompany();
    const organizerId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, organizerId));

    await POST(
      jsonRequest("http://localhost/api/meetings", "POST", {
        title: "In range",
        description: "",
        location: "",
        startAt: "2026-09-16T09:00:00.000Z",
        endAt: "2026-09-16T10:00:00.000Z",
        participants: [{ kind: "employee", id: await createEmployee(companyId) }],
      })
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meetings?from=2026-09-14T00:00:00.000Z&to=2026-09-20T00:00:00.000Z"
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meetings).toHaveLength(1);
  });
});
