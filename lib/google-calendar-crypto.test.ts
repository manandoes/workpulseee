import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptRefreshToken,
  encryptRefreshToken,
  googleCalendarConfigured,
  signOAuthState,
  verifyOAuthState,
} from "@/lib/google-calendar-crypto";

describe("google-calendar-crypto", () => {
  beforeAll(() => {
    // A fixed 32-byte key so these tests don't depend on `.env.local`.
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64"
    );
  });

  describe("encryptRefreshToken / decryptRefreshToken", () => {
    it("round-trips a token", () => {
      const token = "1//0gExampleRefreshToken";
      const encrypted = encryptRefreshToken(token);
      expect(encrypted).not.toContain(token);
      expect(decryptRefreshToken(encrypted)).toBe(token);
    });

    it("produces a different ciphertext each time (random IV)", () => {
      const token = "1//0gExampleRefreshToken";
      expect(encryptRefreshToken(token)).not.toBe(encryptRefreshToken(token));
    });

    it("fails to decrypt a tampered value", () => {
      const encrypted = encryptRefreshToken("a-real-token");
      const [iv, tag, ciphertext] = encrypted.split(".");
      const tampered = `${iv}.${tag}.${ciphertext.slice(0, -2)}aa`;
      expect(() => decryptRefreshToken(tampered)).toThrow();
    });
  });

  describe("signOAuthState / verifyOAuthState", () => {
    const expected = { actorId: "emp_1", companyId: "co_1" };

    it("accepts a freshly signed token", () => {
      const state = signOAuthState({
        actorId: "emp_1",
        companyId: "co_1",
        accountType: "employee",
      });
      expect(verifyOAuthState(state, expected)).toMatchObject({
        actorId: "emp_1",
        companyId: "co_1",
      });
    });

    it("rejects a tampered signature", () => {
      const state = signOAuthState({
        actorId: "emp_1",
        companyId: "co_1",
        accountType: "employee",
      });
      const [encoded] = state.split(".");
      expect(verifyOAuthState(`${encoded}.tampered`, expected)).toBeNull();
    });

    it("rejects an expired token", () => {
      const state = signOAuthState({
        actorId: "emp_1",
        companyId: "co_1",
        accountType: "employee",
      });
      const future = new Date(Date.now() + 10 * 60 * 1000);
      expect(verifyOAuthState(state, expected, future)).toBeNull();
    });

    it("rejects a token minted for a different actor", () => {
      const state = signOAuthState({
        actorId: "emp_other",
        companyId: "co_1",
        accountType: "employee",
      });
      expect(verifyOAuthState(state, expected)).toBeNull();
    });

    it("rejects a malformed token", () => {
      expect(verifyOAuthState("not-a-real-token", expected)).toBeNull();
    });
  });

  describe("googleCalendarConfigured", () => {
    it("is false when any required var is missing", () => {
      const saved = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;
      expect(googleCalendarConfigured()).toBe(false);
      if (saved !== undefined) process.env.GOOGLE_CLIENT_ID = saved;
    });

    it("is true when every required var is set", () => {
      process.env.GOOGLE_CLIENT_ID = "id";
      process.env.GOOGLE_CLIENT_SECRET = "secret";
      process.env.GOOGLE_REDIRECT_URI = "https://example.com/callback";
      expect(googleCalendarConfigured()).toBe(true);
    });
  });
});
