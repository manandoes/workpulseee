import type { SessionActor } from "@/lib/permissions";

/**
 * Pure announcement/poll logic (Rules.md section 5) — free of Prisma/NextAuth
 * imports, the same split `lib/tasks.ts`/`lib/task-data.ts` draws. The
 * database-touching half lives in `lib/announcement-data.ts`.
 */

/** Which voter column a query or write should use for this actor. */
export function voterKeyFor(actor: SessionActor) {
  return actor.accountType === "employee"
    ? { voterEmployeeId: actor.id }
    : { voterAccountId: actor.id };
}

export type PollOptionResult = {
  id: string;
  label: string;
  order: number;
  count: number;
  percentage: number;
};

/**
 * Each option's vote count and share of the total, in `order`. A poll with
 * no votes yet reports every option at 0% rather than dividing by zero.
 */
export function pollResults(
  options: { id: string; label: string; order: number }[],
  votes: { pollOptionId: string }[]
): PollOptionResult[] {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    counts.set(vote.pollOptionId, (counts.get(vote.pollOptionId) ?? 0) + 1);
  }

  const total = votes.length;

  return [...options]
    .sort((a, b) => a.order - b.order)
    .map((option) => {
      const count = counts.get(option.id) ?? 0;
      return {
        id: option.id,
        label: option.label,
        order: option.order,
        count,
        percentage: total === 0 ? 0 : Math.round((count / total) * 100),
      };
    });
}
