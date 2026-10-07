/**
 * One-off customer seed: Talking Lens Media
 *
 * Creates a real (non-demo) company account with a Scale subscription
 * active for 30 days and an Owner login for the founder.
 *
 * Run with:
 *   npx tsx scripts/seed-talking-lens-media.ts              # local docker only (default)
 *   npx tsx scripts/seed-talking-lens-media.ts --force       # allow hosted/prod DB
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../.env") });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { hashPassword } from "../lib/passwords";

const COMPANY_NAME = "Talking Lens Media";
const COMPANY_SLUG = "talking-lens-media";
const OWNER_EMAIL = "anshul@talkinglensmedia.com";
const OWNER_FULL_NAME = "Anshul Jain";
const OWNER_ROLE = "Owner" as const;
const PASSWORD = "TLM@2026";
const PLAN = "Scale" as const;
const SUBSCRIPTION_DAYS = 30;

// --force is parsed before dotenv is even loaded, so process.argv is read raw.
const FORCE = process.argv.includes("--force");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Check .env — it must point at the docker-compose Postgres (localhost:5434) or the hosted Supabase DB."
  );
}

// ── Hosted-DB guard ──────────────────────────────────────────────────────────
const HOSTED_DB_PATTERNS = [
  /supabase\.co/i,
  /supabase\.com/i,
  /railway\.app/i,
  /neon\.tech/i,
  /aws\.amazon\.com/i,
  /render\.(com|io)/i,
  /fly\.io/i,
  /herokuapp\.com/i,
  /vercel\.db/i,
];

const dbUrlLower = connectionString.toLowerCase();
const isHosted = HOSTED_DB_PATTERNS.some((p) => p.test(dbUrlLower));
if (isHosted && !FORCE) {
  console.error(
    "[seed-tlm] ABORT: DATABASE_URL points at a hosted/prod " +
      "database. Pass --force to override this guard."
  );
  console.error("");
  console.error(`  DATABASE_URL = ${connectionString}`);
  console.error("");
  console.error("Local dev: switch .env to the docker-compose Postgres:");
  console.error('  DATABASE_URL="postgresql://workpulse:workpulse@localhost:5434/workpulse?schema=public"');
  console.error('  DIRECT_URL="postgresql://workpulse:workpulse@localhost:5434/workpulse?schema=public"');
  console.error("");
  console.error("Prod seed (hosted DB): run with --force:");
  console.error("  npx tsx scripts/seed-talking-lens-media.ts --force");
  process.exit(1);
}

if (isHosted) {
  console.warn(
    `[seed-tlm] WARNING: running against a hosted DB (${connectionString}). ` +
      "Proceeding to insert real customer data."
  );
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

async function main() {
  console.log(`Wiping any existing company with slug "${COMPANY_SLUG}"...`);
  await db.company.deleteMany({ where: { slug: COMPANY_SLUG } });

  const passwordHash = await hashPassword(PASSWORD);
  const currentPeriodEnd = daysFromNow(SUBSCRIPTION_DAYS);

  console.log(`Creating company: ${COMPANY_NAME} (slug: ${COMPANY_SLUG})...`);
  const company = await db.company.create({
    data: {
      name: COMPANY_NAME,
      slug: COMPANY_SLUG,
      currency: "INR",
    },
  });
  const companyId = company.id;

  console.log("Creating Owner account for founder...");
  const owner = await db.companyAccount.create({
    data: {
      companyId,
      fullName: OWNER_FULL_NAME,
      workEmail: OWNER_EMAIL,
      passwordHash,
      role: OWNER_ROLE,
    },
  });

  console.log("Creating Scale subscription (30-day trial)...");
  await db.subscription.create({
    data: {
      companyId,
      plan: PLAN,
      status: "Active",
      currentPeriodEnd,
    },
  });

  console.log("\nDone. Customer created:");
  console.log(`  Company:     ${COMPANY_NAME}`);
  console.log(`  Slug:        ${COMPANY_SLUG}`);
  console.log(`  Owner email: ${OWNER_EMAIL}`);
  console.log(`  Password:    ${PASSWORD}`);
  console.log(`  Plan:        ${PLAN}`);
  console.log(`  Sub ends:    ${currentPeriodEnd.toISOString()}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
