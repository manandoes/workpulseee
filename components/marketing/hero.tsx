import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RosterCards } from "@/components/marketing/roster-cards";
import { LabelTag } from "@/components/marketing/section";

/**
 * Hero section (PRD.md section 6.0). Refuses the standard SaaS hero-plus-
 * dashboard-screenshot arrangement: the supporting visual is a roster board
 * (`RosterCards`) — the same object an agency already manages capacity on —
 * because the product's real differentiator is a live computed workload
 * number, not a pretty screenshot of a table.
 */
export function Hero() {
  return (
    <section className="bg-background w-full px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-14 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <div className="flex flex-col items-start gap-7">
          <LabelTag>Agency operations roster</LabelTag>

          <h1 className="text-brand-brown max-w-2xl text-5xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Run your whole agency from one dashboard.
          </h1>

          <p className="text-text-secondary max-w-xl text-lg text-pretty">
            An all-in-one operating dashboard for agencies that connects
            employees, projects, tasks, performance, expenses, and internal
            operations in one place.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/register">Get started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/#how-it-works">See how it works</Link>
            </Button>
          </div>

          <p className="text-text-secondary text-sm">
            Company owners and admins sign up here. Employees are invited by
            their company.
          </p>
        </div>

        <RosterCards />
      </div>
    </section>
  );
}
