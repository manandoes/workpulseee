import { sweepLogoutReminders } from "@/lib/attendance-data";

/**
 * The end-of-day logout sweep.
 *
 * Reminds anybody still clocked in an hour past their company's end of day,
 * repeats every two hours for as long as they keep answering "I'm here", and
 * closes the session — backdated to their last confirmed presence — when a
 * reminder goes unanswered for half an hour.
 *
 * Mirrors `jobs/notifyDeadlines.ts`: no queue infrastructure exists, so this
 * is called over HTTP by an external scheduler and crosses tenants
 * deliberately. Unlike that one it must run *often* rather than daily — the
 * half-hour grace period is a floor measured from the reminder, so the real
 * wait before an automatic logout is that plus however long until the next
 * run. Every decision is recomputed from stored timestamps, so a run that is
 * late or repeated reaches the same conclusion; the cost of an infrequent
 * schedule is only that people are reminded and logged out later than the
 * numbers suggest.
 *
 * All of the work is in `sweepLogoutReminders`, beside the attendance writes
 * it makes. This file is the job entry point and nothing else, the same shape
 * `notifyDeadlines` has.
 */
export async function remindLogout(now: Date = new Date()) {
  return sweepLogoutReminders(now);
}
