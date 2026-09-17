import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Section, SectionHeading } from "@/components/marketing/section";

/**
 * FAQ (PRD.md section 6.0). The first four questions are the ones named in the
 * PRD; the last two cover the dual-login model, which is the thing visitors
 * most often need explained.
 *
 * Design.md section 8: accordion, brand-brown question text, text-secondary
 * answers, thin divider between items.
 */
const FAQS = [
  {
    question: "Is this an HRMS replacement?",
    answer:
      "No. WorkPulse covers day-to-day operations — people, projects, tasks, workload, performance, and internal requests. It deliberately leaves out payroll processing, tax compliance, and statutory HR filings, so it complements an HRMS rather than replacing one.",
  },
  {
    question: "Can employees see each other's performance?",
    answer:
      "No. Employees see only their own tasks, goals, feedback, and performance. Managers see their own team, and Owners, Admins, and HR see the wider company according to their role. Permissions are enforced on the server, not just hidden in the interface.",
  },
  {
    question: "Is my company's data isolated from others?",
    answer:
      "Yes. WorkPulse is multi-tenant, and every record belongs to exactly one company. Every query is scoped to the company of the signed-in user, so one company's data can never appear in another's view.",
  },
  {
    question: "Can I invite employees after signing up?",
    answer:
      "Yes, and that is the intended flow. You create your company workspace first, then Admins or HR add employees at any time. Each invited employee receives a link to set their own password.",
  },
  {
    question: "Why are there separate company and employee logins?",
    answer:
      "The two audiences are different. A company login administers the workspace and its billing, while an employee login belongs to a member of one company with a narrower set of permissions. They are stored separately and checked separately, so credentials for one can never be used to sign in as the other.",
  },
  {
    question: "Can employees sign themselves up?",
    answer:
      "No. An employee account only ever exists inside a company that created it, so employees cannot self-register. An Admin or HR user adds them, which keeps your employee list accurate and prevents outsiders from joining your workspace.",
  },
] as const;

export function FaqSection() {
  return (
    <Section id="faq" className="bg-surface">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />

        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((faq) => (
            <AccordionItem key={faq.question} value={faq.question}>
              <AccordionTrigger className="text-brand-brown text-h3 py-4 font-semibold hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-text-secondary pb-4">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
