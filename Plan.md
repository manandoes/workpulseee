# Plan.md — Phases 13–17

Five features, planned against the code as it stands today. Each phase is
independently shippable: its own migration, its own tests, nothing in a later
phase needed to make an earlier one work.

Conventions followed throughout (Rules.md): business logic in a pure `lib/*.ts`
with a `lib/*-data.ts` counterpart for the database, Zod on every request body,
`companyId` on every new table and in every query, soft delete only where
history matters, unit tests for the logic dashboards depend on.

| Phase | Feature                                    | New tables | Risk   |
| ----- | ------------------------------------------ | ---------- | ------ |
| 13    | Performance date-range / weekly / monthly  | —          | Low    |
| 14    | Attendance only from a laptop-sized screen | —          | Low    |
| 15    | Workday breaks + blocking break overlay    | 1          | Medium |
| 16    | Half-day / first-half / second-half leave  | —          | Low    |
| 17    | Calendar: Google preview + in-app meetings | 3          | High   |

---

## Phase 13 — Performance for a period

### What exists

`lib/performance.ts` scores an employee from **all** their tasks, feedback and
goals plus their current workload, renormalizing weights over whichever
components have data. `lib/performance-data.ts` appends each score to
`PerformanceRecord`; `/performance/[id]` and `/my-space/growth` render the
latest score and the history chart.

### Decision (confirmed)

The filter **recomputes** the score over the chosen window rather than only
filtering which stored points the chart draws. "Performance between 1 and 31
March" should be a March number, not an all-time number that happens to have
been computed in March.

### Design

`lib/performance.ts` (pure, extended):

- `PERFORMANCE_PERIODS = ["all", "week", "month", "custom"]`, plus
  `resolvePeriod(preset, from, to, now): Period | null` (`null` = all time).
  Weeks start Monday; boundaries are UTC-midnight inclusive, matching how every
  other date-only field in the schema is stored.
- `scopeInputsToPeriod(input, period)` — filters a `PerformanceInput`:
  - **tasks**: a task counts for a period if it was completed in it
    (`completedAt` inside), or it came due in it and is not Done (`dueDate`
    inside). That is "work that landed or came due in this window"; it is a
    judgment call and gets the same in-place comment the existing weights have.
  - **feedback**: `createdAt` inside the window.
  - **goals**: decided goals (`Achieved`/`Missed`) whose `updatedAt` is inside.
  - **workload**: `null` for any bounded period. Workload is a live snapshot
    with no history, so it cannot honestly describe March. The existing
    renormalization already handles a `null` component, so nothing else changes.
- `calculatePerformanceScore` is **untouched** — it keeps taking an input and
  returning a score, which keeps its existing tests valid.

`lib/performance-data.ts`:

- `scoreInputsFor` selects the timestamps the filter needs (`feedback.createdAt`,
  `goal.updatedAt`).
- New `loadPeriodScore(companyId, employeeId, period)` → `number | null`.
- `recalcEmployeePerformance` and the sweeps are unchanged: `PerformanceRecord`
  stays an all-time timeline. Period scores are computed on read and never
  stored — nothing can go stale, and no backfill is needed.

`lib/validations/performance.ts`: `performancePeriodSchema` (preset + `from`/`to`
date strings), each field `.catch(undefined)` like `requestFiltersSchema`, so a
hand-edited URL degrades to "all time" instead of erroring.

UI:

- `components/performance/period-filter.tsx` — preset select plus two date
  inputs shown only for "Custom". State lives in the URL exactly as
  `ListFilters` does, so a filtered view is linkable and the server does the
  work. (Not folded into `ListFilters`: that component is search-first and every
  one of its consumers is a directory list. Sharing the convention, not the
  component, is the smaller change.)
- `/performance/[id]` and `/my-space/growth` read `searchParams`, show the
  period score with its band, and filter the history chart to the same window.
  When a period has no data the page says so rather than showing a zero.

Tests (`lib/performance.test.ts`): week/month boundaries around UTC midnight,
custom range inclusivity at both ends, workload excluded for a bounded period,
an empty window scoring `null`, and the existing all-time behaviour unchanged.

---

## Phase 14 — Attendance only from a laptop-sized screen

### Decision (confirmed, and narrower than "block mobile login")

Everyone — employees and company accounts — can sign in and use the app on a
phone or tablet. What a small screen cannot do is **apply attendance**: clocking
in (and starting a break, once Phase 15 lands).

Clocking out and ending a break stay allowed on any screen. Blocking those would
strand an open session or an open break on a phone with no way to close it,
which is worse than the thing the rule is protecting against. **Flag if you want
this the other way.**

### Design

Two layers, because neither alone is honest:

- **Client** — `AttendanceWidget` uses `matchMedia("(min-width: 1024px)")` and
  replaces the Log-in button with a short explanation below that width. Resolved
  in an effect with an "unknown" first render, so server and client markup match.
- **Server** — `/api/attendance/clock-in` (and Phase 15's break-start) call
  `userAgent(request)` from `next/server` — already available, no dependency —
  and refuse `device.type` of `mobile`/`tablet` with a 403 `small_screen`.

`lib/device.ts` (pure): `MIN_ATTENDANCE_WIDTH_PX = 1024` and
`attendanceAllowedOnDevice(deviceType)`, so the rule is one testable function
both layers name rather than a magic number in two files.

**Stated plainly:** a user-agent can be spoofed and desktop-mode on a phone
defeats the server check, while a desktop browser in a narrow window trips the
client check. This is a policy guardrail, not a security boundary, and the code
comment will say so.

Tests: `lib/device.test.ts` over the device types, including `undefined`
(desktop) which must be allowed.

---

## Phase 15 — Workday breaks, with a blocking overlay

### Decision (confirmed)

A break belongs to the **working day**, not to one task. Starting one pauses
every running task timer; ending it resumes exactly those.

Naming collision to resolve: the task timer already has a Break button meaning
"close this task's interval". Recommend relabelling that one **Pause** so
"break" means one thing in the product. One string change plus its toast; the
`TimeEntryEndReason.Break` enum value stays.

### Schema

```prisma
model BreakRecord {
  id String @id @default(cuid())

  companyId String
  company   Company @relation(...)

  employeeId String
  employee   Employee @relation(...)

  /// The session this break sits inside — a break outside a working day is
  /// not a thing, so this is required, not nullable.
  attendanceRecordId String
  attendanceRecord   AttendanceRecord @relation(...)

  startedAt DateTime  @default(now())
  endedAt   DateTime?

  /// Tasks whose running timer this break paused, so ending it can resume
  /// exactly those and nothing else.
  pausedTaskIds String[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([companyId])
  @@index([employeeId, startedAt])
}
```

No `deletedAt` — every row is history, the same reasoning `AttendanceRecord` and
`TaskTimeEntry` already carry.

### Logic

`lib/attendance.ts` (pure): `breakDurationMs(breaks, now)` and
`netWorkedMs(sessions, breaks, now)`.

Display decision: My Work shows **net worked** time with break time called out
beside it, rather than one figure that quietly includes lunch.

`lib/attendance-data.ts`:

- `loadOpenBreak(actor)` — at most one ever open, the same invariant
  `loadOpenSession` holds.
- `startBreak(actor)` — refuses with the existing `WriteFailure` shapes if there
  is no open session (`invalidReference`) or a break is already open
  (`duplicateFailure`). In one transaction: create the break, close the
  employee's running `TaskTimeEntry` rows with `endReason: Break`, and record
  their `taskId`s on the break.
- `endBreak(actor)` — closes the break and reopens a `TaskTimeEntry` for each
  `pausedTaskIds` entry, in one transaction.
- `clockOut` closes an open break in the same transaction, so a day can never
  end mid-break.
- The NextAuth `signOut` event in `lib/auth.ts` closes an open break alongside
  `stopRunningEntries`, for the same reason that hook exists.

### API and UI

- `POST /api/attendance/break/start` (Phase 14 device check applies) and
  `POST /api/attendance/break/end` (no device check).
- `components/ui/dialog.tsx` — the shadcn/Radix Dialog primitive, following
  `select.tsx`/`accordion.tsx`'s existing import style. `radix-ui` is already a
  dependency.
- `components/attendance/break-overlay.tsx` — non-dismissible dialog (no escape,
  no outside click) with a live timer and one "End break" button. Radix gives
  the focus trap and the ARIA wiring; hand-rolling the overlay would not.
- Mounted in `app/(dashboard)/layout.tsx`, which already reads the actor, so the
  overlay follows the employee across every page rather than only My Work.
- "Take a break" sits in `AttendanceWidget`, enabled only while clocked in.

Tests (`lib/attendance.test.ts`): net worked excludes breaks, an open break
counts up to `now`, nested/overlapping breaks are impossible by construction,
and a break with no paused tasks resumes nothing.

---

## Phase 16 — Half day on a leave request

### Design

Schema: `enum LeaveDayPart { FullDay FirstHalf SecondHalf }` and a nullable
`Request.dayPart LeaveDayPart?` — the same "nullable column used only by the
types that need it" shape `startDate`/`endDate`/`amount` already use, rather
than a second table.

`lib/requests.ts`: `requestNeedsDayPart(type)` — `Leave` only, beside the
existing `requestNeedsDateRange`/`requestNeedsAmount` so the form and the write
resolver keep agreeing about what a type needs. Widening it to `WFH` later is
one `||`. Plus `dayPartLabel` for display.

`lib/validations/requests.ts`: required when the type needs it, defaulting to
`FullDay`; and **a half day must be a single day** — if `dayPart` is
`FirstHalf`/`SecondHalf` then `startDate` must equal `endDate`, refused in the
same `superRefine` that already cross-checks the range.

Data/UI: `request-data.ts` writes `dayPart` only for types that need it and
selects it for reads; `request-form.tsx` shows the select when
`requestNeedsDayPart(type)`; the detail and list views render "Leave · First
half".

Migration: backfill existing `Leave` rows to `FullDay` so old and new rows read
the same way. Every other type stays `null`.

Tests: `lib/requests.test.ts` for the predicate, and the validation schema for
the single-day rule and the default.

---

## Phase 17 — Calendar (Google preview + in-app meetings)

### Decision (confirmed, revised)

Each person may connect their Google account so the app can **preview** their
schedule. The WorkPulse `Meeting` row is always the source of truth — booking
still works fully with colleagues who have never connected Google — but when
the organizer *is* connected, booking or cancelling a meeting in WorkPulse
also creates or deletes a mirrored event on their own Google Calendar
(`calendar.events` scope, not the broader `calendar` scope), inviting any
other participants who are themselves connected. A Google write failure
(token expired, API error, not connected) never blocks the WorkPulse-side
booking — it just means that meeting stays WorkPulse-only, the same
graceful-degradation rule the read side already followed.

This is the largest phase, and the only one with an external dependency and a
setup step outside the codebase.

### Schema (3 tables)

- `GoogleCalendarConnection` — `companyId`, the usual two-nullable-FK
  `employeeId`/`accountId` recipient shape, `googleEmail`,
  `refreshTokenEncrypted`, `scope`, `connectedAt`. One per person.
- `Meeting` — `companyId`, organizer (two-FK shape), `title`, `description?`,
  `startAt`, `endAt`, `location?`, `status`.
- `MeetingParticipant` — mirrors `ConversationParticipant` exactly, including
  the pair of unique constraints.

Adds `MeetingScheduled` to `NotificationType` so an invite reuses
`lib/notifications.ts` and its channels rather than inventing delivery.

### Secrets

A refresh token must stay reversible, so it cannot be hashed like the invite
tokens. It is encrypted at rest with AES-256-GCM via `node:crypto` (no new
dependency) under a new `GOOGLE_TOKEN_ENCRYPTION_KEY`, and is never returned to
any client. `.env.example` gains `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI` and that key.

### Google access

`lib/google-calendar.ts` talks to Google with plain `fetch` — token exchange,
refresh, `events.list` for the connected person's own preview, `freeBusy` for
colleagues, and `events.insert`/`events.delete` to mirror a booked/cancelled
WorkPulse meeting onto the organizer's own calendar. The `googleapis` package
is ~50MB of surface for a handful of HTTPS calls, which Rules.md section 1
rules out.

**Privacy rule, enforced in the data layer:** you see your own events with their
titles; another person's Google data is returned as **busy intervals only**, no
titles, no attendees. In-app meetings you are a participant of show their title.
Anything else would leak calendar contents across the company.

### Logic, API, UI

`lib/calendar.ts` (pure, unit-tested): merge overlapping busy intervals, derive
free slots inside working hours, detect a conflict for a proposed time.

Routes: `/api/calendar/google/connect`, `/callback`, `/disconnect`,
`/api/calendar/availability`, `/api/meetings`. The OAuth callback verifies a
signed `state` parameter (CSRF), and the whole feature degrades to a disabled
"Connect Google Calendar" button with an explanation when the env vars are
absent — a missing integration must not break the page.

Who you can book with: `loadSquadMembers` already returns every company account
and employee in the tenant, and Squad/Chat already expose that directory. The
calendar reuses it, so calendar visibility can never exceed what chat already
allows.

UI: a `/calendar` page (added to `PROTECTED_PREFIXES` **and** `SHARED_PREFIXES`
in `proxy.ts`, since both account types use it, plus a nav item in both branches
of `navigationFor`) showing your week — Google events and WorkPulse meetings
merged — a member picker rendering a colleague's busy blocks, and a "Propose
meeting" form that refuses a slot that conflicts.

### What this needs from you

A Google Cloud project with the Calendar API enabled, an OAuth consent screen,
and a client ID/secret for the redirect URI. I cannot create those; everything
else is code.

---

## Sequencing

13 → 14 → 15 → 16 → 17, and 14 before 15 because the break-start route needs the
device check that 14 introduces. 13 and 16 are independent of everything and can
move if you would rather see them first.

Per phase: `npx prisma migrate dev` for the ones with schema changes, then
`npm run typecheck`, `npm run lint`, `npm test`, and a Memory.md entry —
the workflow Rules.md section 7 asks for.

## Open decisions

1. **Phase 14** — clock-out and end-break stay allowed on a phone (my
   recommendation, so nothing gets stranded). Say if you want them blocked too.
2. **Phase 15** — relabel the task timer's "Break" button to "Pause"?
   Recommended, so "break" means one thing.
3. **Phase 15** — My Work shows net worked time with breaks called out
   separately, rather than one figure including breaks.
4. **Phase 13** — the period task rule ("completed in the window, or came due in
   it and unfinished") is a judgment call; it is the one line to retune if the
   numbers read wrong.
5. **Phase 16** — half days are `Leave` only for now; `WFH` is a one-line
   widening if you want it there too.
