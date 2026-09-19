import Link from "next/link";
import { MessageSquareQuote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/marketing/section";

/**
 * Social-proof placeholder (PRD.md section 6.0 — "for future use").
 *
 * Deliberately left as an honest empty state rather than filled with invented
 * quotes or logos: publishing fabricated testimonials would misrepresent real
 * customers. Styled as open roster slots — donated from the "sticker album"
 * concept weighed during this page's direction round: a ghosted outline
 * showing exactly what belongs there, rather than a skeleton loader
 * pretending content is still arriving.
 */
export function TestimonialsSection() {
  return (
    <Section id="customers" className="bg-background">
      <SectionHeading
        title="Customer stories are on the way"
        description="We're onboarding our first agencies now. As teams go live, their results will appear here."
      />

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            aria-hidden
            className="border-brand-brown-light text-brand-brown-light flex flex-col gap-4 rounded-lg border-2 border-dashed p-6"
          >
            <MessageSquareQuote className="size-6" strokeWidth={1.5} />
            <div className="flex flex-col gap-2">
              <span className="bg-brand-brown-light/40 h-2 w-full rounded-full" />
              <span className="bg-brand-brown-light/40 h-2 w-11/12 rounded-full" />
              <span className="bg-brand-brown-light/40 h-2 w-2/3 rounded-full" />
            </div>
            <span className="bg-brand-brown-light/40 mt-2 h-2 w-1/3 rounded-full" />
          </div>
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <Button asChild variant="outline" size="lg">
          <Link href="/register">Become an early customer</Link>
        </Button>
      </div>
    </Section>
  );
}
