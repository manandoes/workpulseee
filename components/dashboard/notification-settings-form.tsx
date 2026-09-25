"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError, FormField } from "@/components/forms/fields";
import {
  channelSettingsSchema,
  type ChannelSettingsFormValues,
  type ChannelSettingsInput,
} from "@/lib/validations/notifications";

/**
 * Which channels this person wants notifications on, and the number WhatsApp
 * would use (Phase 13).
 *
 * Lives on `/notifications`, which both account types can already reach, so
 * there is one place to change this rather than one per role.
 *
 * Push is two separate things and the form says so: the checkbox is a
 * preference stored against the account, while the button below it subscribes
 * *this browser*. Somebody can want push and not have granted it here yet, and
 * a single control would have to lie about one of those.
 */
type Settings = {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  phone: string | null;
};

/** What the browser will let us do about push, as far as we can tell. */
type PushState =
  "unsupported" | "denied" | "subscribed" | "unsubscribed" | "working";

export function NotificationSettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pushState, setPushState] = useState<PushState>("unsubscribed");
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
    /**
     * Three type parameters because the schema transforms: the form binds to
     * the input side (an empty phone field is `""`), while `handleSubmit` hands
     * on the output side (that same field normalised to E.164, or null).
     */
  } = useForm<ChannelSettingsFormValues, unknown, ChannelSettingsInput>({
    resolver: zodResolver(channelSettingsSchema),
    defaultValues: {
      emailEnabled: settings.emailEnabled,
      whatsappEnabled: settings.whatsappEnabled,
      pushEnabled: settings.pushEnabled,
      phone: settings.phone ?? "",
    },
  });

  /**
   * Ask the browser what it already thinks, once, on mount.
   *
   * The browser is the source of truth for whether this browser is subscribed
   * — permission can be revoked in site settings without the server hearing
   * about it — so the button's label is read from it rather than from us.
   */
  useEffect(() => {
    let cancelled = false;

    async function readState() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !vapidPublicKey
      ) {
        if (!cancelled) setPushState("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setPushState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (!cancelled) {
        setPushState(subscription ? "subscribed" : "unsubscribed");
      }
    }

    void readState();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (body?.fieldErrors) {
        for (const [field, message] of Object.entries(
          body.fieldErrors as Record<string, string>
        )) {
          setError(field as keyof ChannelSettingsFormValues, { message });
        }
      }
      setFormError(body?.error ?? "Could not save this.");
      return;
    }

    toast.success("Notification settings saved.");
    router.refresh();
  });

  /**
   * Send a real WhatsApp message to the saved number.
   *
   * Reads the *saved* number, not the one in the input, which is why the hint
   * below tells people to save first: the server sends to what it has on file,
   * and a test that used an unsaved value would confirm a number that no
   * notification will ever use.
   */
  async function sendWhatsAppTest() {
    setTestingWhatsApp(true);

    try {
      const response = await fetch("/api/notifications/whatsapp", {
        method: "POST",
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? "Could not send the test message.");
        return;
      }

      toast.success(`Test message sent to ${body.phone}.`);
    } catch (cause) {
      console.error("[whatsapp] Could not send a test message", cause);
      toast.error("Could not send the test message.");
    } finally {
      setTestingWhatsApp(false);
    }
  }

  async function enablePush() {
    if (!vapidPublicKey) return;
    setPushState("working");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }

      /**
       * Registered here rather than on page load, so the worker only exists
       * for people who actually asked for push.
       */
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Required by every browser: a push with no payload is not useful here.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const response = await fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) throw new Error("Could not record the subscription");

      setPushState("subscribed");
      toast.success("Push notifications are on in this browser.");
    } catch (cause) {
      console.error("[push] Could not subscribe", cause);
      setPushState("unsubscribed");
      toast.error("Could not turn on push in this browser.");
    }
  }

  async function disablePush() {
    setPushState("working");

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/notifications/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setPushState("unsubscribed");
      toast.success("Push notifications are off in this browser.");
    } catch (cause) {
      console.error("[push] Could not unsubscribe", cause);
      setPushState("subscribed");
      toast.error("Could not turn off push in this browser.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError message={formError} />

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Notification channels</legend>

        <Checkbox
          id="emailEnabled"
          label="Email"
          hint="Task assignments, completions and deadline reminders, sent to the address on your profile."
          {...register("emailEnabled")}
        />

        <Checkbox
          id="whatsappEnabled"
          label="WhatsApp"
          hint="Sent to the number below. Needs a number with its country code."
          {...register("whatsappEnabled")}
        />

        <Checkbox
          id="pushEnabled"
          label="Push notifications"
          hint="Desktop and mobile alerts. You also need to turn them on in each browser, below."
          {...register("pushEnabled")}
        />
      </fieldset>

      <FormField
        id="phone"
        label="Mobile number for WhatsApp"
        hint="Include the country code, for example +919876543210. Leave empty to stop WhatsApp messages. Save, then send a test to check it reaches you."
        inputMode="tel"
        fieldClassName="max-w-xs"
        error={errors.phone?.message}
        {...register("phone")}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={testingWhatsApp}
          onClick={sendWhatsAppTest}
        >
          {testingWhatsApp ? "Sending…" : "Send a test WhatsApp"}
        </Button>

        <PushButton
          state={pushState}
          onEnable={enablePush}
          onDisable={disablePush}
        />
      </div>
    </form>
  );
}

/**
 * The browser half of push, kept beside the save button rather than inside the
 * form's data: it changes the browser, not the record, so it must not wait for
 * a save to take effect.
 */
function PushButton({
  state,
  onEnable,
  onDisable,
}: {
  state: PushState;
  onEnable: () => void;
  onDisable: () => void;
}) {
  if (state === "unsupported") {
    return (
      <p className="text-text-secondary text-meta">
        This browser cannot receive push notifications.
      </p>
    );
  }

  if (state === "denied") {
    return (
      <p className="text-text-secondary text-meta">
        This browser is blocking notifications. Allow them in its site settings
        to turn push on here.
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={state === "working"}
      onClick={state === "subscribed" ? onDisable : onEnable}
    >
      {state === "working"
        ? "Working…"
        : state === "subscribed"
          ? "Turn off push in this browser"
          : "Turn on push in this browser"}
    </Button>
  );
}

/**
 * Decode a VAPID public key for `pushManager.subscribe`.
 *
 * The key is published as base64url (the alphabet that is safe in a URL, and
 * unpadded), but `applicationServerKey` takes raw bytes and `atob` only speaks
 * standard base64 — so the two substitutions and the padding have to be put
 * back first. Every Web Push client does exactly this; there is no browser API
 * for it.
 */
function urlBase64ToUint8Array(base64UrlKey: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64UrlKey.length % 4)) % 4);
  const base64 = (base64UrlKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);

  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * A native checkbox rather than a Radix one, for the same reason
 * `components/forms/fields.tsx` uses a native `<select>`: it works directly
 * with React Hook Form's `register()` and needs no extra client state.
 */
function Checkbox({
  id,
  label,
  hint,
  ref,
  ...inputProps
}: React.ComponentProps<"input"> & {
  id: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex gap-3">
      <input
        id={id}
        ref={ref}
        type="checkbox"
        className="border-border text-brand-brown focus-visible:ring-ring mt-0.5 size-4 shrink-0 rounded focus-visible:ring-2 focus-visible:outline-none"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...inputProps}
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-text-secondary text-meta">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
