import type { BulkEmailAudience } from "@/lib/generated/prisma/enums";

export type { BulkEmailAudience };

/**
 * Bulk email rules (Plan: email the whole organisation).
 *
 * Pure helpers only — the recipient query lives in `lib/bulk-email-data.ts`,
 * the same split every other feature here uses.
 */

export const BULK_EMAIL_SUBJECT_MAX = 200;
export const BULK_EMAIL_BODY_MAX = 20_000;

/**
 * How many messages are in flight at once.
 *
 * `sendEmail` is one HTTP call per recipient (neither provider's REST API
 * takes a batch in the shape this app uses), so a 300-person company would
 * otherwise open 300 sockets at once and trip the provider's rate limit. Ten
 * is slow enough to stay well inside both providers' published limits and fast
 * enough that a send does not outlive the request.
 */
export const BULK_EMAIL_CONCURRENCY = 10;

export const AUDIENCE_LABELS: Record<BulkEmailAudience, string> = {
  Everyone: "Everyone in the company",
  Employees: "Employees only",
  CompanyAccounts: "Owners, admins, managers and HR",
  Specific: "Specific people",
};

/**
 * Runs `task` over `items` at most `limit` at a time, preserving nothing about
 * order — callers only count results.
 *
 * Written out rather than pulled from a dependency: it is eight lines, and
 * adding a concurrency library for one call site would cost more than it saves.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results.push(await task(items[index]));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );

  return results;
}

/**
 * Removes duplicate addresses, case-insensitively.
 *
 * A person can appear twice legitimately — an Owner who is also listed as an
 * employee, or two picked ids resolving to one shared address — and sending
 * them the same announcement twice reads as a bug to the recipient.
 */
export function dedupeRecipients<T extends { email: string }>(
  recipients: T[]
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const recipient of recipients) {
    const key = recipient.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(recipient);
  }

  return unique;
}
