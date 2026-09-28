/**
 * Display formatting shared across the app.
 */

/**
 * Format a date-only value (date of birth, start date) without shifting it.
 *
 * These are stored as UTC midnight, so reading them through the viewer's local
 * timezone would show the previous day west of Greenwich. Reading the UTC parts
 * keeps the date the user typed.
 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** `YYYY-MM-DD` for prefilling a date input. */
export function toDateInputValue(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

/**
 * Turn an enum identifier such as `FullTime` into `Full Time` for display.
 *
 * Only word boundaries are touched — casing is left alone so acronym values
 * like `HR` survive intact.
 */
export function humanizeEnum(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

/**
 * Format an amount in the company's currency (PRD.md section 11 — currency
 * defaults to INR and is configurable per company, so it is always passed in
 * rather than assumed).
 *
 * Accepts what the callers actually hold: a Prisma `Decimal`, a number, or the
 * string a form submitted. An unrecorded amount renders as an em dash, which is
 * deliberately different from a recorded zero.
 */
export function formatMoney(
  value: { toString(): string } | number | string | null | undefined,
  currency: string
): string {
  if (value === null || value === undefined || value === "") return "—";

  const amount = Number(value.toString());
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** A signed percentage, for margins. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(1)}%`;
}

/** A signed score delta, e.g. `"+4.2"` / `"-3.0"` / `"0.0"` — for
 * `scoreDelta` (`lib/performance.ts`), which is already a plain number, not
 * a percentage. */
export function formatSignedScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

/** `1,50,000` for prefilling a number input is wrong — it needs the raw value. */
export function toAmountInputValue(
  value: { toString(): string } | null | undefined
): string {
  if (value === null || value === undefined) return "";
  return value.toString();
}

/**
 * An instant (`createdAt`, `clockInAt`, a message timestamp) split into its
 * date and 12-hour time, in the viewer's zone, with no zone label — the
 * viewer only ever sees their own zone, so naming it is noise.
 *
 * Returned as two parts rather than one string so `components/ui/date-time.tsx`
 * can style them differently; that component is how the dashboard renders an
 * instant, and resolves the zone from context so call sites never pass it.
 * For a date-only value stored as UTC midnight, use `formatDate`, which
 * deliberately never takes a zone (see its docstring).
 */
export function dateTimeParts(
  value: Date | string | null | undefined,
  timeZone: string
): { date: string; time: string } | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return {
    date: date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    }),
    time: date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }),
  };
}

/** `dateTimeParts` as one plain string, for the rare place markup can't go
 * (an attribute, a toast). Prefer `<DateTime>` wherever JSX is possible. */
export function formatDateTime(
  value: Date | string | null | undefined,
  timeZone: string
): string {
  const parts = dateTimeParts(value, timeZone);
  return parts ? `${parts.date}, ${parts.time}` : "—";
}

/**
 * Formats an already zone-local `YYYY-MM-DD` day key (from
 * `lib/timezone.ts`'s `dayKeyInZone`) for display, without ever constructing
 * a `Date` from it — parsing `"2026-03-11"` back into a `Date` and formatting
 * that would re-introduce exactly the UTC-vs-local mismatch this key exists
 * to avoid.
 */
export function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return "—";

  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * A duration in milliseconds as `"2h 14m"` (or `"45m"` under an hour), for an
 * attendance session's length.
 *
 * Coarser than the live `HH:MM:SS` ticker on the attendance widget — that one
 * counts a running session second by second, this one summarises a finished
 * (or finished-so-far) total the way `formatMoney`/`formatPercent` summarise
 * other quantities for display.
 */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";

  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/**
 * `HH:MM:SS`, for a clock that is still running — the attendance widget and a
 * task's timer both tick one every second.
 *
 * Finer-grained than `formatDuration`'s `"2h 14m"` on purpose: that is how a
 * finished stretch of time is summarised, this is how a live one is watched,
 * and a number that only moves once a minute reads as broken.
 */
export function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * `HH:MM:SS` for a countdown that may run past zero — `-00:04:12` once it
 * has. `formatElapsed` clamps at zero because elapsed time can't be negative;
 * time *remaining* can, and hiding that would hide the overrun.
 */
export function formatCountdown(milliseconds: number): string {
  // Round toward the limit (ceil while positive) so the display reads
  // 00:00:00 exactly as it crosses zero, then -00:00:01 one second later.
  const totalSeconds =
    milliseconds >= 0
      ? Math.ceil(milliseconds / 1000)
      : Math.floor(milliseconds / 1000);
  const sign = totalSeconds < 0 ? "-" : "";
  return `${sign}${formatElapsed(Math.abs(totalSeconds) * 1000)}`;
}
