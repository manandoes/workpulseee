import type { Metadata } from "next";
import { useState } from "react";

const SITE_URL = "https://workpulse.automovalabs.tech";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the WorkPulse team.",
  alternates: { canonical: "/contact" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/contact`,
    title: "Contact Us — WorkPulse",
    description: "Get in touch with the WorkPulse team.",
    images: [
      {
        url: `${SITE_URL}/workpulse-mark.png`,
        width: 1200,
        height: 630,
        alt: "WorkPulse contact us",
      },
    ],
  },
};

export default function ContactPage() {
  return (
    <section className="w-full px-6 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-170">
        <h1 className="text-brand-brown text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Contact us
        </h1>
        <p className="text-text-secondary mt-4 text-lg">
          Have a question, feedback, or need support? We&rsquo;d like to hear
          from you.
        </p>

        <div className="mt-10 flex flex-col gap-8">
          <ContactForm />

          <div className="flex flex-col gap-4 border-brand-brown-light rounded-lg border-2 p-6">
            <h2 className="text-brand-brown text-lg font-semibold">
              Other ways to reach us
            </h2>
            <ul className="flex flex-col gap-2 text-text-secondary">
              <li>
                <span className="font-medium text-foreground">Email:</span>{" "}
                <a
                  href="mailto:team@automovalabs.tech"
                  className="text-brand-brown hover:underline"
                >
                  team@automovalabs.tech
                </a>
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Website:
                </span>{" "}
                <a
                  href={SITE_URL}
                  className="text-brand-brown hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {SITE_URL}
                </a>
              </li>
            </ul>
            <p className="text-text-secondary text-sm">
              We typically respond within 1–2 business days. For urgent
              matters, email us directly.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactForm() {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("loading");
    setErrorMsg(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    const payload = {
      name: data.get("name"),
      email: data.get("email"),
      subject: data.get("subject"),
      message: data.get("message"),
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Something went wrong. Please try again.");
      }

      setState("sent");
      form.reset();
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="name" label="Name" required>
          <input
            name="name"
            id="name"
            type="text"
            required
            placeholder="Your full name"
            className="border-input bg-surface text-foreground h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-brand-brown/40"
          />
        </Field>
        <Field id="email" label="Email" required>
          <input
            name="email"
            id="email"
            type="email"
            required
            placeholder="you@company.com"
            className="border-input bg-surface text-foreground h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-brand-brown/40"
          />
        </Field>
      </div>

      <Field id="subject" label="Subject" required>
        <select
          name="subject"
          id="subject"
          required
          className="border-input bg-surface text-foreground h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-brand-brown/40"
        >
          <option value="">Select a topic…</option>
          <option value="general">General inquiry</option>
          <option value="support">Technical support</option>
          <option value="sales">Sales &amp; pricing</option>
          <option value="partnership">Partnership</option>
          <option value="feedback">Feedback</option>
          <option value="other">Other</option>
        </select>
      </Field>

      <Field id="message" label="Message" required>
        <textarea
          name="message"
          id="message"
          required
          rows={5}
          placeholder="Tell us what you need help with…"
          className="border-input bg-surface text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-brand-brown/40"
        />
      </Field>

      {state === "error" && errorMsg ? (
        <p role="alert" className="text-danger-text text-sm">
          {errorMsg}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === "loading" || state === "sent"}
        className="self-start rounded-lg bg-brand-brown px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === "loading" ? "Sending…" : state === "sent" ? "Message sent" : "Send message"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-brand-brown text-sm font-medium"
      >
        {label}
        {required ? <span className="text-danger-text ml-0.5">*</span> : null}
      </label>
      {children}
    </div>
  );
}
