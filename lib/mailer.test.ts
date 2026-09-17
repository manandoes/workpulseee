import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/mailer";

describe("mailer", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.BREVO_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...savedEnv };
  });

  it("does not send, and reports not_configured, when nothing is set up", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({
      to: "a@example.com",
      subject: "Hi",
      text: "Body",
    });

    expect(result).toEqual({ delivered: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the global Resend env vars when no company config is given", async () => {
    process.env.RESEND_API_KEY = "global-key";
    process.env.EMAIL_FROM = "Global <noreply@example.com>";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({
      to: "a@example.com",
      subject: "Hi",
      text: "Body",
    });

    expect(result).toEqual({ delivered: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer global-key");
  });

  it("falls back to Brevo when BREVO_API_KEY is the key that is set", async () => {
    process.env.BREVO_API_KEY = "global-brevo-key";
    process.env.EMAIL_FROM = "WorkPulse <noreply@example.com>";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail({
      to: "a@example.com",
      subject: "Hi",
      text: "Body",
    });

    expect(result).toEqual({ delivered: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("global-brevo-key");
    const body = JSON.parse(init.body as string);
    expect(body.sender).toEqual({
      name: "WorkPulse",
      email: "noreply@example.com",
    });
  });

  it("keeps using a company config even when global env keys are set", async () => {
    process.env.BREVO_API_KEY = "global-brevo-key";
    process.env.EMAIL_FROM = "WorkPulse <noreply@example.com>";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(
      { to: "a@example.com", subject: "Hi", text: "Body" },
      { provider: "resend", apiKey: "company-key", from: "Acme <a@acme.com>" }
    );

    expect(result).toEqual({ delivered: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer company-key");
  });

  it("sends via Resend using a company config", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(
      { to: "a@example.com", subject: "Hi", text: "Body" },
      { provider: "resend", apiKey: "company-key", from: "Acme <a@acme.com>" }
    );

    expect(result).toEqual({ delivered: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer company-key");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("Acme <a@acme.com>");
  });

  it("sends via Brevo using a company config", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(
      { to: "a@example.com", subject: "Hi", text: "Body" },
      { provider: "brevo", apiKey: "brevo-key", from: "Acme <a@acme.com>" }
    );

    expect(result).toEqual({ delivered: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("brevo-key");
    const body = JSON.parse(init.body as string);
    expect(body.sender).toEqual({ name: "Acme", email: "a@acme.com" });
    expect(body.to).toEqual([{ email: "a@example.com" }]);
  });

  it("reports provider_error when the provider rejects the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );

    const result = await sendEmail(
      { to: "a@example.com", subject: "Hi", text: "Body" },
      { provider: "resend", apiKey: "bad-key", from: "Acme <a@acme.com>" }
    );

    expect(result).toEqual({ delivered: false, reason: "provider_error" });
  });

  it("reports provider_error, never throws, on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));

    const result = await sendEmail(
      { to: "a@example.com", subject: "Hi", text: "Body" },
      { provider: "brevo", apiKey: "key", from: "a@acme.com" }
    );

    expect(result).toEqual({ delivered: false, reason: "provider_error" });
  });
});
