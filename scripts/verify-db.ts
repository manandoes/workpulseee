/**
 * Verify that the connected database schema matches the Prisma schema.
 *
 * Detects column drift (columns in schema but missing from DB) and reports
 * it. With --fix, patches known-drift columns automatically (safe, NULL
 * defaults where the type allows).
 *
 * Run before seeding or deploying to catch silent migration drift like the
 * one that caused `googleChatRefreshTokenEncrypted` to be missing from
 * Supabase despite the migration log showing it as applied.
 *
 * Run with:
 *   npx tsx scripts/verify-db.ts          # check only
 *   npx tsx scripts/verify-db.ts --fix    # auto-patch known drift
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../.env") });
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const FORCE = process.argv.includes("--fix");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Check .env.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Known columns that have been silently missed by migrations.
// Each entry: [table, column, sqlType, nullable]
const KNOWN_DRIFT: Array<[string, string, string, boolean]> = [
  ["Company", "googleChatRefreshTokenEncrypted", "TEXT", true],
  ["Company", "googleChatConnectedByEmail", "TEXT", true],
  ["Company", "googleChatConnectedAt", "TIMESTAMPTZ", true],
  ["Conversation", "provider", `"MessagingProvider"`, false],
  ["Conversation", "googleSpaceId", "TEXT", true],
];

type Issue = { table: string; column: string; detail: string };
const issues: Issue[] = [];

async function main() {
  console.log(
    `Verifying database schema${FORCE ? " (with --fix)" : ""}...\n`
  );

  // ── 1. Migration log summary ──────────────────────────────────────────────
  const status = await db.$queryRaw<{
    migrations_count: number;
    applied_count: number;
  }>`
    SELECT
      COUNT(*) AS migrations_count,
      COUNT(CASE WHEN finished_at IS NOT NULL THEN 1 END) AS applied_count
    FROM "_prisma_migrations"
  `;
  const totalMigs = (status[0] as any).migrations_count;
  const appliedMigs = (status[0] as any).applied_count;
  console.log(`Migration log: ${appliedMigs}/${totalMigs} applied`);

  // ── 2. Scan actual DB columns per table ───────────────────────────────────
  const rows = await db.$queryRaw<
    { table_name: string; column_name: string }[]
  >`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  const tableColumns = new Map<string, Set<string>>();
  for (const row of rows) {
    const t = row.table_name;
    if (!tableColumns.has(t)) tableColumns.set(t, new Set());
    tableColumns.get(t)!.add(row.column_name);
  }

  // ── 3. Parse expected columns from schema.prisma ──────────────────────────
  // Relation fields (e.g. `Company.accounts Company[]`) are NOT DB columns —
  // skip them by collecting all model names first and filtering them out.
  const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
  const tableBlocks = schema.match(/model\s+\w+\s*\{[^}]*\}/gs) ?? [];

  // Collect all model names so we can distinguish relations from columns.
  const modelNames = new Set(
    [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1])
  );

  const expectedColumns = new Map<string, Set<string>>();
  for (const block of tableBlocks) {
    const modelName = block.match(/model\s+(\w+)/)?.[1];
    if (!modelName) continue;
    // Match lines like: `fieldName Type` but skip if Type starts with a
    // model name (relation fields look like `Field Model[]` or `Field Model`).
    // m[1] = field name, m[2] = type — filter on the TYPE, not the name.
    const cols = [...block.matchAll(/^\s+(\w+)\s+(\w+)/gm)]
      .filter((m) => !modelNames.has(m[2]))
      .map((m) => m[1]);
    expectedColumns.set(modelName, new Set(cols));
  }

  // ── 4. Find drift ─────────────────────────────────────────────────────────
  for (const [table, expected] of expectedColumns) {
    const actual = tableColumns.get(table) ?? new Set();
    for (const col of expected) {
      if (!actual.has(col)) {
        issues.push({ table, column: col, detail: "missing column" });
      }
    }
  }

  // ── 5. Fix known drift ────────────────────────────────────────────────────
  if (FORCE) {
    for (const [table, col, sqlType, nullable] of KNOWN_DRIFT) {
      const actual = tableColumns.get(table) ?? new Set();
      if (!actual.has(col)) {
        console.log(`  Fixing ${table}.${col}...`);
        await db.$executeRawUnsafe(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" ${sqlType}${nullable ? "" : " NOT NULL"};`
        );
        console.log(`    ✓ Added.`);
        actual.add(col);
      }
    }
  }

  // ── 6. Report ─────────────────────────────────────────────────────────────
  if (issues.length === 0) {
    console.log("\n✓ Database schema is in sync with Prisma schema.\n");
    process.exit(0);
  } else {
    console.log(`\n✗ Schema drift detected (${issues.length} issue${issues.length > 1 ? "s" : ""}):\n`);
    for (const issue of issues) {
      console.log(`  ${issue.table}.${issue.column} — ${issue.detail}`);
    }
    console.log("");
    if (FORCE) {
      console.log("Re-run without --fix to confirm clean state after patching.");
    } else {
      console.log("To auto-fix known drift (safe, NULL defaults):");
      console.log("  npx tsx scripts/verify-db.ts --fix");
    }
    console.log("");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
