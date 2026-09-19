import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyRazorpaySignature } from "@/lib/razorpay";

const KEY_SECRET = "test_secret_key";
const ORIGINAL_SECRET = process.env.RAZORPAY_KEY_SECRET;

beforeEach(() => {
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
});

afterEach(() => {
  process.env.RAZORPAY_KEY_SECRET = ORIGINAL_SECRET;
});

function signFor(orderId: string, paymentId: string): string {
  return createHmac("sha256", KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

describe("verifyRazorpaySignature", () => {
  it("accepts a signature computed the same way Razorpay documents", () => {
    const orderId = "order_abc123";
    const paymentId = "pay_xyz789";
    const signature = signFor(orderId, paymentId);

    expect(
      verifyRazorpaySignature({ orderId, paymentId, signature })
    ).toBe(true);
  });

  it("rejects a signature for a different order/payment pair", () => {
    const signature = signFor("order_abc123", "pay_xyz789");

    expect(
      verifyRazorpaySignature({
        orderId: "order_abc123",
        paymentId: "pay_different",
        signature,
      })
    ).toBe(false);
  });

  it("rejects a tampered signature of a different length", () => {
    expect(
      verifyRazorpaySignature({
        orderId: "order_abc123",
        paymentId: "pay_xyz789",
        signature: "short",
      })
    ).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(
      verifyRazorpaySignature({
        orderId: "order_abc123",
        paymentId: "pay_xyz789",
        signature: "",
      })
    ).toBe(false);
  });
});
