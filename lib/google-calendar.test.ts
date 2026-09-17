import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvent, deleteEvent } from "@/lib/google-calendar";

describe("google-calendar events (write)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createEvent", () => {
    it("returns the new event id on success", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "evt_123" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const id = await createEvent("token", {
        title: "Sync",
        description: "Weekly sync",
        location: null,
        start: new Date("2026-09-16T09:00:00.000Z"),
        end: new Date("2026-09-16T10:00:00.000Z"),
        attendeeEmails: ["a@example.com"],
      });

      expect(id).toBe("evt_123");
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("sendUpdates=all");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.summary).toBe("Sync");
      expect(body.attendees).toEqual([{ email: "a@example.com" }]);
    });

    it("returns null when Google rejects the request", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 403 })
      );

      const id = await createEvent("token", {
        title: "Sync",
        description: null,
        location: null,
        start: new Date(),
        end: new Date(),
        attendeeEmails: [],
      });

      expect(id).toBeNull();
    });

    it("returns null instead of throwing on a network failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down"))
      );

      const id = await createEvent("token", {
        title: "Sync",
        description: null,
        location: null,
        start: new Date(),
        end: new Date(),
        attendeeEmails: [],
      });

      expect(id).toBeNull();
    });
  });

  describe("deleteEvent", () => {
    it("issues a DELETE with sendUpdates=all", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
      vi.stubGlobal("fetch", fetchMock);

      await deleteEvent("token", "evt_123");

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain("evt_123");
      expect(String(url)).toContain("sendUpdates=all");
      expect(init.method).toBe("DELETE");
    });

    it("treats an already-gone event (404) as success, never throws", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: false, status: 404 })
      );

      await expect(deleteEvent("token", "evt_123")).resolves.toBeUndefined();
    });

    it("never throws on a network failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down"))
      );

      await expect(deleteEvent("token", "evt_123")).resolves.toBeUndefined();
    });
  });
});
