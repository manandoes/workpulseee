/**
 * One-off hiring demo seed — NOT part of the app.
 *
 * Adds one live opening with every question type, plus a few applicants spread
 * across the pipeline, to whichever company is seeded first (normally the
 * `nimbus-creative-demo` company from `seed-demo-company.ts`). Everything here
 * is invented demonstration content, not a real job.
 *
 * Re-running replaces the opening rather than duplicating it.
 *
 * Run with:
 *   npx tsx scripts/seed-hiring-demo.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../.env.local") });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const FORM_SLUG = "senior-motion-designer";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const company = await db.company.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, brandColor: true },
  });

  if (!company) throw new Error("No company found — seed one first.");

  await db.hiringForm.deleteMany({
    where: { companyId: company.id, slug: FORM_SLUG },
  });

  const form = await db.hiringForm.create({
    data: {
      companyId: company.id,
      title: "Senior Motion Designer",
      slug: FORM_SLUG,
      summary: "Own the motion language across our client work, end to end.",
      team: "Design",
      location: "Bengaluru, hybrid",
      employmentType: "FullTime",
      status: "Live",
      destination: "Hosted",
      publishedAt: new Date(),
      questions: {
        create: [
          {
            companyId: company.id,
            order: 0,
            type: "LongText",
            label: "Tell us about a project you are proud of",
            helpText:
              "Roughly 200 words is plenty. We care about what was yours, specifically.",
            required: true,
            options: [],
          },
          {
            companyId: company.id,
            order: 1,
            type: "Document",
            label: "Portfolio or showreel",
            helpText: "A PDF is fine. Up to 5 MB.",
            required: true,
            options: [],
          },
          {
            companyId: company.id,
            order: 2,
            type: "SingleChoice",
            label: "How many years have you worked in motion?",
            required: true,
            options: ["Under 2", "2 to 5", "5 to 8", "More than 8"],
          },
          {
            companyId: company.id,
            order: 3,
            type: "MultiChoice",
            label: "Which of these do you actually enjoy?",
            helpText: "Pick as many as are true.",
            required: false,
            options: [
              "Storyboarding",
              "3D",
              "Cel animation",
              "Sound design",
              "Directing shoots",
            ],
          },
          {
            companyId: company.id,
            order: 4,
            type: "ShortText",
            label: "Where did you hear about this role?",
            required: false,
            options: [],
          },
          {
            companyId: company.id,
            order: 5,
            type: "Date",
            label: "Earliest date you could start",
            required: false,
            options: [],
          },
        ],
      },
    },
    select: { id: true },
  });

  const applicants = [
    {
      fullName: "Ira Menon",
      email: "ira.menon@example.com",
      phone: "+91 98200 11223",
      stage: "Shortlisted" as const,
    },
    {
      fullName: "Devan Rao",
      email: "devan.rao@example.com",
      phone: "+91 99870 55412",
      stage: "New" as const,
    },
    {
      fullName: "Sana Qureshi",
      email: "sana.q@example.com",
      phone: null,
      stage: "Interview" as const,
    },
    {
      fullName: "Tobias Lund",
      email: "t.lund@example.com",
      phone: "+46 70 123 4567",
      stage: "Rejected" as const,
    },
  ];

  for (const applicant of applicants) {
    await db.jobApplication.create({
      data: {
        companyId: company.id,
        formId: form.id,
        fullName: applicant.fullName,
        email: applicant.email,
        phone: applicant.phone,
        stage: applicant.stage,
        source: "Hosted",
      },
    });
  }

  console.log(
    `Seeded /${company.slug}/recruitmentform/${FORM_SLUG} (brand ${company.brandColor}) with ${applicants.length} applicants.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
