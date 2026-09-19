"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CreateOrderInput } from "@/lib/validations/billing";

/**
 * Opens Razorpay Checkout for a plan purchase or an extra-seats top-up
 * (Plan: Razorpay billing), and verifies the result server-side.
 *
 * Razorpay's Checkout widget is loaded from its own script (`checkout.js`),
 * not an npm package — same "load the vendor's own SDK from a script tag"
 * pattern this app has no existing precedent for internally, but is the
 * integration Razorpay itself documents; `next/script` defers it to avoid
 * blocking the page.
 */
export function CheckoutButton({
  order,
  label,
  redirectTo,
  disabled,
}: {
  order: CreateOrderInput;
  label: string;
  /** Path to send the browser to once payment is verified. */
  redirectTo: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const orderResponse = await fetch("/api/billing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      const orderBody = await orderResponse.json().catch(() => null);

      if (!orderResponse.ok) {
        toast.error(orderBody?.error ?? "Could not start checkout.");
        return;
      }

      const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!keyId) {
        toast.error("Payments are not configured yet. Contact support.");
        return;
      }

      const razorpay = new window.Razorpay({
        key: keyId,
        order_id: orderBody.razorpayOrderId,
        amount: orderBody.amountInPaise,
        currency: orderBody.currency,
        name: "WorkPulse",
        description: label,
        handler: async (response: RazorpayCheckoutResponse) => {
          const verifyResponse = await fetch("/api/billing/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });

          if (!verifyResponse.ok) {
            toast.error(
              "Payment succeeded but could not be confirmed. Contact support with your payment id: " +
                response.razorpay_payment_id
            );
            return;
          }

          toast.success("Payment successful.");
          router.push(redirectTo);
          router.refresh();
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
      });

      razorpay.open();
    } catch {
      toast.error("Could not start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <Button onClick={onClick} disabled={disabled || loading}>
        {loading ? "Opening checkout…" : label}
      </Button>
    </>
  );
}

type RazorpayCheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
    };
  }
}
