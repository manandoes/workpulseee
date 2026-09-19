/**
 * One-off smoke test for the public application endpoint — NOT part of the app.
 *
 * Posts a real multipart submission (including a document upload) against a
 * running dev server, then reads back what landed, so the one flow no unit
 * test covers — browser → route → validation → StoredFile → pipeline — is
 * exercised end to end.
 *
 * Run with a dev server up:
 *   npx tsx scripts/smoke-hiring-submit.ts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../.env.local") });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const ORIGIN = process.env.SMOKE_ORIGIN ?? "http://localhost:3000";
const FORM_SLUG = "senior-motion-designer";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const form = await db.hiringForm.findFirst({
    where: { slug: FORM_SLUG, deletedAt: null },
    select: {
      id: true,
      company: { select: { slug: true } },
      questions: {
        orderBy: { order: "asc" },
        select: { id: true, type: true, label: true, required: true },
      },
    },
  });

  if (!form) throw new Error(`No form with slug ${FORM_SLUG}`);

  const byType = (type: string) =>
    form.questions.find((question) => question.type === type);

  const body = new FormData();
  body.set("fullName", "Smoke Test Candidate");
  body.set("email", "smoke.candidate@example.com");
  body.set("phone", "+91 90000 00000");
  body.set("company", ""); // honeypot left empty, as a real applicant leaves it

  const longText = byType("LongText");
  if (longText) {
    body.set(
      longText.id,
      "I rebuilt a title sequence three times before it read at a glance."
    );
  }

  const choice = byType("SingleChoice");
  if (choice) body.set(choice.id, "5 to 8");

  const multi = byType("MultiChoice");
  if (multi) {
    body.append(multi.id, "Storyboarding");
    body.append(multi.id, "Sound design");
  }

  const doc = byType("Document");
  if (doc) {
    body.set(
      doc.id,
      new File([new TextEncoder().encode("a pretend portfolio")], "portfolio.txt", {
        type: "text/plain",
      })
    );
  }

  const url = `${ORIGIN}/api/public/recruitment/${form.company.slug}/${FORM_SLUG}`;
  const response = await fetch(url, { method: "POST", body });
  const payload = await response.json().catch(() => null);

  console.log(`POST ${response.status}`, JSON.stringify(payload));

  const landed = await db.jobApplication.findFirst({
    where: { formId: form.id, email: "smoke.candidate@example.com" },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      fullName: true,
      stage: true,
      source: true,
      submitterIpHash: true,
      answers: {
        select: {
          value: true,
          values: true,
          file: { select: { name: true, mimeType: true, sizeBytes: true } },
          question: { select: { label: true } },
        },
      },
    },
  });

  console.log("STORED:", JSON.stringify(landed, null, 2));

  // A submission that fails validation must be refused, not half-written.
  const bad = new FormData();
  bad.set("fullName", "");
  bad.set("email", "not-an-email");
  const badResponse = await fetch(url, { method: "POST", body: bad });
  console.log(
    `POST (invalid) ${badResponse.status}`,
    JSON.stringify(await badResponse.json().catch(() => null))
  );

  // A filled honeypot must look like success and write nothing.
  const bot = new FormData();
  bot.set("fullName", "Bot");
  bot.set("email", "bot@example.com");
  bot.set("company", "Acme Spam Co");
  const botResponse = await fetch(url, { method: "POST", body: bot });
  const botWrote = await db.jobApplication.count({
    where: { formId: form.id, email: "bot@example.com" },
  });
  console.log(
    `POST (honeypot) ${botResponse.status} — rows written: ${botWrote} (must be 0)`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
