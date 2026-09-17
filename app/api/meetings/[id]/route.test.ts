import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActor } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createEmployee,
  createTestCompany,
  employeeActor,
  jsonRequest,
} from "@/lib/test-helpers";
import { POST as bookMeeting } from "../route";
import { DELETE } from "./route";

vi.mock("@/lib/auth", () => ({ getActor: vi.fn() }));

describe("DELETE /api/meetings/[id]", () => {
  beforeEach(() => {
    vi.mocked(getActor).mockReset();
  });

  it("cancels a meeting the organizer booked, with no Google connection to mirror", async () => {
    const { companyId } = await createTestCompany();
    const organizerId = await createEmployee(companyId);
    const inviteeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, organizerId));

    const booked = await bookMeeting(
      jsonRequest("http://localhost/api/meetings", "POST", {
        title: "To cancel",
        description: "",
        location: "",
        startAt: "2026-09-16T09:00:00.000Z",
        endAt: "2026-09-16T10:00:00.000Z",
        participants: [{ kind: "employee", id: inviteeId }],
      })
    );
    const { meeting } = await booked.json();

    const response = await DELETE(
      jsonRequest(`http://localhost/api/meetings/${meeting.id}`, "DELETE"),
      { params: Promise.resolve({ id: meeting.id }) }
    );

    expect(response.status).toBe(200);
    const stored = await db.meeting.findUnique({ where: { id: meeting.id } });
    expect(stored?.status).toBe("Cancelled");
  });

  it("refuses to let a non-organizer cancel", async () => {
    const { companyId } = await createTestCompany();
    const organizerId = await createEmployee(companyId);
    const inviteeId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, organizerId));

    const booked = await bookMeeting(
      jsonRequest("http://localhost/api/meetings", "POST", {
        title: "Not yours to cancel",
        description: "",
        location: "",
        startAt: "2026-09-17T09:00:00.000Z",
        endAt: "2026-09-17T10:00:00.000Z",
        participants: [{ kind: "employee", id: inviteeId }],
      })
    );
    const { meeting } = await booked.json();

    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, inviteeId));

    const response = await DELETE(
      jsonRequest(`http://localhost/api/meetings/${meeting.id}`, "DELETE"),
      { params: Promise.resolve({ id: meeting.id }) }
    );

    expect(response.status).toBe(403);
  });

  it("404s for a meeting outside the actor's company", async () => {
    const { companyId } = await createTestCompany();
    const otherCompany = await createTestCompany();
    const organizerId = await createEmployee(otherCompany.companyId);
    const inviteeId = await createEmployee(otherCompany.companyId);
    vi.mocked(getActor).mockResolvedValue(
      employeeActor(otherCompany.companyId, organizerId)
    );

    const booked = await bookMeeting(
      jsonRequest("http://localhost/api/meetings", "POST", {
        title: "Other company",
        description: "",
        location: "",
        startAt: "2026-09-18T09:00:00.000Z",
        endAt: "2026-09-18T10:00:00.000Z",
        participants: [{ kind: "employee", id: inviteeId }],
      })
    );
    const { meeting } = await booked.json();

    const outsiderId = await createEmployee(companyId);
    vi.mocked(getActor).mockResolvedValue(employeeActor(companyId, outsiderId));

    const response = await DELETE(
      jsonRequest(`http://localhost/api/meetings/${meeting.id}`, "DELETE"),
      { params: Promise.resolve({ id: meeting.id }) }
    );

    expect(response.status).toBe(404);
  });
});
