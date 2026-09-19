import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/marketing/section";

/**
 * Shared shell for marketing pages whose copy is not written yet (contact,
 * terms, privacy). PRD.md section 6.0 requires the footer to link to these, so
 * they exist as honest placeholders rather than dead links.
 */
export function PagePlaceholder({
  title,
  description,
  note,
}: {
  title: string;
  description: string;
  note?: string;
}) {
  return (
    <Section className="bg-background">
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-5 py-8">
        <h1 className="text-brand-brown text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="text-text-secondary text-lg">{description}</p>
        {note ? (
          <p className="border-brand-brown-light text-text-secondary rounded-lg border-2 border-dashed px-4 py-3 text-sm">
            {note}
          </p>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </Section>
  );
}
