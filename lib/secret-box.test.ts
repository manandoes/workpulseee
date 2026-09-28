import { beforeAll, describe, expect, it } from "vitest";
import {
  encryptionKeyFrom,
  openBytes,
  openString,
  sealBytes,
  sealString,
} from "@/lib/secret-box";

const KEY = "SECRET_BOX_TEST_KEY";
const OTHER_KEY = "SECRET_BOX_TEST_OTHER_KEY";

describe("secret-box", () => {
  beforeAll(() => {
    process.env[KEY] = Buffer.alloc(32, 5).toString("base64");
    process.env[OTHER_KEY] = Buffer.alloc(32, 9).toString("base64");
  });

  it("round-trips text, with a fresh IV every time", () => {
    const first = sealString("hunter2 ✓", KEY);
    const second = sealString("hunter2 ✓", KEY);
    expect(first).not.toBe(second);
    expect(openString(first, KEY)).toBe("hunter2 ✓");
  });

  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const sealed = sealBytes(bytes, KEY);
    expect(Buffer.from(sealed).includes(Buffer.from(bytes))).toBe(false);
    expect(Array.from(openBytes(sealed, KEY))).toEqual(Array.from(bytes));
  });

  it("refuses a tampered value or the wrong key", () => {
    const sealed = sealString("secret", KEY);
    const [iv, tag, ciphertext] = sealed.split(".");
    const flipped = `${iv}.${tag}.${ciphertext.slice(0, -2)}AA`;
    expect(() => openString(flipped, KEY)).toThrow();
    expect(() => openString(sealed, OTHER_KEY)).toThrow();

    const bytes = sealBytes(new Uint8Array([1, 2, 3]), KEY);
    bytes[bytes.length - 1] ^= 1;
    expect(() => openBytes(bytes, KEY)).toThrow();
  });

  it("names a missing or malformed key", () => {
    expect(() => encryptionKeyFrom("SECRET_BOX_UNSET")).toThrow(
      "SECRET_BOX_UNSET is not set"
    );
    process.env.SECRET_BOX_SHORT = Buffer.alloc(8).toString("base64");
    expect(() => encryptionKeyFrom("SECRET_BOX_SHORT")).toThrow("32 bytes");
  });
});
