/**
 * Pure timezone resolution and day-bucketing (no `next/headers`, no Prisma —
 * same split as `lib/attendance.ts`/`lib/performance.ts`, so this is directly
 * unit-testable). The request-reading half lives in `lib/timezone-request.ts`,
 * the same way `lib/pricing.ts`'s edge-geo header read is request-only while
 * this module's pure logic is not.
 *
 * No date library. `Intl.DateTimeFormat` with a `timeZone` option already
 * covers formatting and day-bucketing natively via ICU's own zone database,
 * so a dependency bought for one function isn't justified.
 */

/** A couple dozen representative zones keyed by ISO-3166 country code, read
 * from the same edge geo headers `lib/pricing.ts` uses for currency. Multi-
 * zone countries (US, RU, AU, ...) get one representative zone — this is a
 * first-paint guess only; the browser-reported cookie (see
 * `lib/timezone-request.ts`) is the accurate path and wins whenever present. */
const COUNTRY_ZONES: Record<string, string> = {
  IN: "Asia/Kolkata",
  US: "America/New_York",
  CA: "America/Toronto",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  PT: "Europe/Lisbon",
  PL: "Europe/Warsaw",
  SE: "Europe/Stockholm",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  PK: "Asia/Karachi",
  BD: "Asia/Dhaka",
  SG: "Asia/Singapore",
  MY: "Asia/Kuala_Lumpur",
  PH: "Asia/Manila",
  ID: "Asia/Jakarta",
  TH: "Asia/Bangkok",
  VN: "Asia/Ho_Chi_Minh",
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  BR: "America/Sao_Paulo",
  MX: "America/Mexico_City",
  ZA: "Africa/Johannesburg",
  NG: "Africa/Lagos",
  EG: "Africa/Cairo",
};

export const DEFAULT_TIME_ZONE = "UTC";

/**
 * Browser-reported IANA zone, written by `components/timezone-cookie.tsx`
 * (a client component) and read by `lib/timezone-request.ts` (server-only,
 * imports `next/headers`). The name lives in this pure module rather than
 * that one so the client component never pulls a `next/headers` import into
 * the browser bundle. Not `httpOnly` — client JS writes it — and not a
 * secret; it only makes responses vary by viewer, the same way `THEME_COOKIE`
 * (`lib/permissions.ts`) does for rendering mode.
 */
export const TIMEZONE_COOKIE = "tz";

/**
 * Formatters are cached per zone rather than rebuilt per call — construction
 * isn't free, and a page rendering a whole day-breakdown table would
 * otherwise build one per row.
 */
const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * A cookie value is attacker-controlled input reaching `Intl.DateTimeFormat`,
 * which throws `RangeError` on an invalid zone. Validate once here, at
 * resolution, so every formatting call site downstream can trust its zone
 * argument without a try/catch of its own.
 */
export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The best IANA zone guess for a two-letter country code, or `null` if unknown. */
export function zoneForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_ZONES[country.toUpperCase()] ?? null;
}

/**
 * Cookie (browser-reported, accurate) beats country header (edge geo,
 * approximate) beats UTC (safe default). Both inputs are validated here so
 * nothing downstream needs to.
 */
export function resolveTimeZone(
  cookieValue: string | null | undefined,
  country: string | null | undefined
): string {
  if (isValidTimeZone(cookieValue)) return cookieValue;

  const fromCountry = zoneForCountry(country);
  if (isValidTimeZone(fromCountry)) return fromCountry;

  return DEFAULT_TIME_ZONE;
}

/**
 * The `YYYY-MM-DD` calendar day `instant` falls on in `timeZone` — DST-correct
 * by construction, since ICU's zone database (not offset arithmetic) decides
 * the local date. `en-CA` is used purely because it formats as `YYYY-MM-DD`
 * already, not for any locale reason.
 *
 * Callers needing a day *key* (attendance bucketing, request-window overlap)
 * should use this rather than constructing a zone-local-midnight `Date` —
 * that would require inverting the zone's offset (and its DST transitions),
 * which this function avoids entirely by never producing a `Date` at all.
 */
export function dayKeyInZone(instant: Date, timeZone: string): string {
  let formatter = dayKeyFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayKeyFormatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

/**
 * The UTC offset `timeZone` was on at `instant`, in milliseconds.
 *
 * Formats the instant *as* that zone's wall clock, reads the pieces back as
 * if they were UTC, and takes the difference — so ICU's zone database decides
 * the offset, including whatever DST was doing at that moment, rather than a
 * table maintained here.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  // `hour12: false` renders midnight as hour 24 in some ICU versions.
  const hour = read("hour") % 24;

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    hour,
    read("minute"),
    read("second")
  );

  return asUtc - instant.getTime();
}

/**
 * The instant at which `timeZone`'s wall clock reads `minutesFromMidnight` on
 * the calendar day `dayKey` (`YYYY-MM-DD`, as `dayKeyInZone` produces).
 *
 * The inverse of `dayKeyInZone`, and the one place in this module that does
 * invert a zone offset — which the module header warns callers away from,
 * because day *bucketing* never needs it. Deciding when a company's working
 * day ends genuinely does: `Company.endOfDayMinutes` is a wall-clock time, and
 * comparing it to an attendance session means turning it into an instant.
 *
 * Two passes rather than one: the first offset is read at the guessed instant,
 * which is up to an hour wrong across a DST boundary, so the corrected instant
 * is measured again and re-corrected if the zone had in fact changed offset
 * between them. On a spring-forward gap (a wall-clock time that never happens)
 * this settles on the instant the clock jumped to, which is the right answer
 * for a deadline — the moment that time of day effectively arrived.
 */
export function instantForLocalTime(
  dayKey: string,
  minutesFromMidnight: number,
  timeZone: string
): Date {
  const localAsUtc =
    Date.parse(`${dayKey}T00:00:00Z`) + minutesFromMidnight * 60_000;

  const firstPass = new Date(localAsUtc - zoneOffsetMs(new Date(localAsUtc), timeZone));
  const secondOffset = zoneOffsetMs(firstPass, timeZone);

  return new Date(localAsUtc - secondOffset);
}

/**
 * A wall-clock time in `timeZone`, e.g. "6:00 pm" — what a logout reminder
 * has to say to be worth reading, since the whole message is about a time of
 * day. `lib/format.ts`'s `formatDateTime` renders the date too, which is
 * noise when the day is obviously today.
 */
export function formatTimeInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

/** `minutesFromMidnight` as the `HH:MM` an `<input type="time">` holds. */
export function minutesToTimeInput(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** `HH:MM` back to minutes from midnight, or `null` if it is not a time. */
export function timeInputToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
