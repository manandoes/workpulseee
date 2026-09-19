import { Section, SectionHeading } from "@/components/marketing/section";

/**
 * The four-step flow described in PRD.md section 6.0:
 * add your team, assign projects & tasks, track workload & performance,
 * approve requests — all from one dashboard.
 *
 * Numbered — unlike the roster cards elsewhere on this page — because the
 * sequence itself is the information: you cannot track workload before you
 * have assigned tasks, or approve a request before your team can submit one.
 */
const STEPS = [
  {
    title: "Add your team",
    description:
      "Create your company workspace and invite employees. They set their own password from the invite link.",
  },
  {
    title: "Assign projects & tasks",
    description:
      "Set up clients and projects, then break them into tasks with owners, deadlines, and effort estimates.",
  },
  {
    title: "Track workload & performance",
    description:
      "Workload percentages and performance scores update as work moves, so problems surface early.",
  },
  {
    title: "Approve requests",
    description:
      "Leave, reimbursements, and equipment requests arrive in one queue instead of your inbox.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <Section id="how-it-works" className="bg-background">
      <SectionHeading title="Up and running in four steps" />

      <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="border-brand-brown-light flex flex-col gap-3 border-t-2 pt-5"
          >
            <span aria-hidden className="text-brand-brown/20 text-5xl font-black tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="text-brand-brown text-lg font-bold tracking-tight">
              <span className="sr-only">{`Step ${index + 1}: `}</span>
              {step.title}
            </h3>
            <p className="text-text-secondary">{step.description}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
