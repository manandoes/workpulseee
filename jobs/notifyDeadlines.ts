import { db } from "@/lib/db";
import { warnCompanyDeadlines } from "@/lib/notification-data";

/**
 * The daily deadline sweep (Phase 13).
 *
 * Warns every assignee whose task is due tomorrow or today — the milestones in
 * `DEADLINE_WARNING_DAYS` — across every company. Mirrors
 * `jobs/generateAlerts.ts` exactly: no BullMQ/Redis queue exists yet, so this
 * is called over HTTP by an external scheduler rather than by a worker process,
 * and it crosses tenants deliberately because no user is driving it.
 *
 * Unlike the alert sweep this one *sends things to people*, so it is the one
 * job where running twice would be visible to a customer. That is handled at
 * the point of writing rather than here: each warning carries a `dedupeKey`
 * naming the task, its deadline and which warning it is, and the unique index
 * on `Notification` turns a repeat into a no-op. Running this hourly instead of
 * daily would therefore be wasteful but harmless.
 */
export async function notifyDeadlines(now: Date = new Date()) {
  const companies = await db.company.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let warnings = 0;
  for (const company of companies) {
    warnings += await warnCompanyDeadlines(company.id, now);
  }

  return { companies: companies.length, warnings };
}
