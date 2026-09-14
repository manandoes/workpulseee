/**
 * Pure device rules, free of Prisma/Next imports so they can be unit-tested
 * directly and named identically by both layers that enforce them —
 * `AttendanceWidget` (viewport width) and `/api/attendance/clock-in`
 * (`next/server`'s `userAgent(request).device.type`) — rather than each
 * carrying its own copy of the threshold.
 *
 * Plan.md Phase 14: a policy guardrail, not a security boundary. A
 * user-agent can be spoofed and a desktop browser in a narrow window trips
 * the client check regardless — this only stops the common case of clocking
 * in from a phone or tablet.
 */

export const MIN_ATTENDANCE_WIDTH_PX = 1024;

const SMALL_SCREEN_DEVICE_TYPES = new Set(["mobile", "tablet"]);

/**
 * `deviceType` is `next/server`'s `userAgent().device.type` — `undefined`
 * for a desktop browser, `"mobile"`/`"tablet"` for a small screen, or one of
 * `console`/`smarttv`/`wearable`/`embedded`, none of which this rule cares
 * about.
 */
export function attendanceAllowedOnDevice(
  deviceType: string | undefined
): boolean {
  return !deviceType || !SMALL_SCREEN_DEVICE_TYPES.has(deviceType);
}
