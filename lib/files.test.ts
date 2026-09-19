import { describe, expect, it } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  formatFileSize,
  isAllowedMimeType,
  isImageMimeType,
  sanitizeFileName,
} from "@/lib/files";

describe("sanitizeFileName", () => {
  it("keeps an ordinary name intact", () => {
    expect(sanitizeFileName("March payslip.pdf")).toBe("March payslip.pdf");
  });

  it("drops any directory part, so a name can never read as a path", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\dell\\secret.pdf")).toBe("secret.pdf");
  });

  it("strips quotes, backslashes and control characters", () => {
    // These are what would otherwise let a crafted name break out of the
    // quoted Content-Disposition value and inject a header of its own.
    expect(sanitizeFileName('bad".pdf')).toBe("bad.pdf");
    expect(sanitizeFileName("bad\r\nX-Evil: 1.pdf")).toBe("badX-Evil: 1.pdf");
  });

  it("falls back to a placeholder when nothing survives", () => {
    expect(sanitizeFileName('"""')).toBe("file");
    expect(sanitizeFileName("   ")).toBe("file");
  });

  it("caps the length", () => {
    expect(sanitizeFileName("a".repeat(500))).toHaveLength(200);
  });
});

describe("isAllowedMimeType", () => {
  it("accepts the documented types", () => {
    for (const type of ALLOWED_MIME_TYPES) {
      expect(isAllowedMimeType(type)).toBe(true);
    }
  });

  it("rejects types that execute script when opened in a tab", () => {
    expect(isAllowedMimeType("text/html")).toBe(false);
    expect(isAllowedMimeType("image/svg+xml")).toBe(false);
    expect(isAllowedMimeType("application/javascript")).toBe(false);
  });
});

describe("isImageMimeType", () => {
  it("separates inline-renderable images from downloads", () => {
    expect(isImageMimeType("image/png")).toBe(true);
    expect(isImageMimeType("application/pdf")).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("scales the unit to the size", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1_572_864)).toBe("1.5 MB");
  });
});
