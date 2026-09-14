# Memory.md — Project Progress Log

> This file is not filled in at project start. Begin updating it once coding starts, at the end of every work session. Its purpose is to let an AI assistant (in a new chat or tool) pick up exactly where things left off without re-reading the whole codebase or guessing.

## How to Use This File

- Update after every meaningful work session (don't let it fall stale).
- Keep entries factual and specific (file names, decisions made, what was tested).
- Newest entries at the top.
- Never mark a phase "Complete" unless it was actually run/tested.

---

## Current Status

- **Current Phase:** Plan.md Phase 15 — workday breaks, with a blocking overlay.
- **Status:** Complete. A break pauses every running task timer for the employee (not just one task), and ending it resumes exactly those. New `BreakRecord` table (migration `20260914193315_phase15_break_records`); `startBreak`/`endBreak`/`loadOpenBreak` in `lib/attendance-data.ts`; `clockOut` and the NextAuth `signOut` event both close an open break so a day can never end mid-break. `POST /api/attendance/break/{start,end}` (start carries the Phase 14 device check, end does not — mirrors clock-in/clock-out). New `components/ui/dialog.tsx` (Radix) backs `components/attendance/break-overlay.tsx`, a non-dismissible overlay mounted in `app/(dashboard)/layout.tsx` so it follows the employee across every page. The task timer's "Break" button is relabelled "Pause" (the `TimeEntryEndReason.Break` enum value is unchanged) to keep "break" meaning one thing. My Work and the admin Attendance panel now show net worked time with break time called out separately. Typecheck, lint, build and the full 396-test suite (13 new) all pass; driven end-to-end against the real dev server and Postgres with curl. See this session's log.
- **Last Updated:** 2026-09-15

## Phase Completion Tracker

| Phase                             | Status                | Notes                                                                                                       |
| --------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| 0 — Project Setup                 | Complete (1 item open) | Scaffold, DB, theme, tooling all verified locally. "Deploy hello world to hosting" not done — see Blockers.  |
| 1 — Landing Page & Marketing Site | Complete              | All PRD 6.0 sections built. Responsive and Design.md-conformant, verified in a real browser at 3 widths.     |
| 2 — Auth & Multi-Tenancy (Dual Login) | Complete          | Dual login, registration, invite flow, tenant scoping, role-aware shell. Cross-table auth isolation tested.  |
| 3 — Employee Management           | Complete              | Department model, full profiles, directory + search/filter, org chart, role-based visibility, CompanyAccount invites. |
| 4 — Projects & Clients            | Complete (undocumented) | Client/Project/ProjectMember models, project list/detail, team assignment, financials all exist and are exercised by this session's work, but no session log entry was written when it was built — this row corrects Phases.md Phase 4's status, which had drifted stale. |
| 5 — Task Management               | Complete (undocumented) | Task/Comment/Attachment models, board + list views, status flow, overdue auto-flagging all exist, same gap as Phase 4 above. |
| 6 — Workload Intelligence         | Complete              | Workload % calculation, per-employee visual indicator, suggested-assignee picker, company-wide capacity setting, on-write recompute + protected sweep endpoint. See prior session's log. |
| 7 — Requests & Approvals          | Complete              | Polymorphic `Request` model (all 8 types), employee submission form, Owner/Admin/HR/Manager approval queue with Manager scoped to direct reports, in-app notification bell + best-effort decision email. See this session's log. |
| 8 — Performance Tracking          | Complete              | `PerformanceRecord`/`Goal`/`Feedback` models, continuous scoring engine (task completion, on-time delivery, workload, feedback, goals) with real score history, manager-owned goals and feedback, employee read-only My Growth. See this session's log. |
| 9 — Company Dashboard & Alerts    | Complete              | Aggregate dashboard (counts, workload heatmap, performance snapshot) and a rule-based `Alert` engine (overdue tasks, overloaded employees, stalled projects, aging approvals) with company-configurable thresholds, regenerated live on every dashboard visit. Manager/HR scoped. See this session's log. |
| 10 — Employee Self-Service        | Complete              | "My Work" (open tasks split into Due now/Upcoming, current projects, workload) added to `/my-space`; My Growth (Phase 8) and My Requests (Phase 7) already existed. Employees can move their own assigned tasks' status via a new `canUpdateTaskStatus` permission. See this session's log. |
| 11 — Client/Project Financials    | Complete              | New `canViewFinancials` (Owner/Admin only) gates a new `/projects/financials` tab: per-client and agency-wide value/cost/margin/team-size/task-completion rollups, via a new `financialRollup` in `lib/projects.ts` reused for both. See this session's log. |
| 12 — Polish & Hardening           | Complete              | Loading/error/not-found states, a permission audit (clean), pagination on every unbounded list, `/notifications`, and the first automated route tests. See this session's log. |
| 13 — Multi-channel notifications  | Built, unverified live | Phases.md Phase 13's "WhatsApp integration" bullet. One dispatcher fans every notification to email/WhatsApp/push/in-app; new `TaskAssigned`/`TaskCompleted`/`DeadlineApproaching` events; per-person channel toggles; daily deadline sweep + GitHub Actions scheduler. Not marked Complete: nothing has been delivered by a real provider. See this session's log. |

---

## Session Log

### 2026-09-15 — Session 14

**Phase worked on:** Plan.md Phase 15 — workday breaks, with a blocking break overlay

**What was completed:**

- **Schema:** new `BreakRecord` model (migration `20260914193315_phase15_break_records`) — `companyId`, `employeeId`, a required `attendanceRecordId` (a break outside a working day is not a thing, unlike `AttendanceRecord` itself which stands alone), `startedAt`/`endedAt` (open = `null`), and `pausedTaskIds: String[]` so ending a break resumes exactly the tasks it paused and nothing else. No `deletedAt` — every row is history, same reasoning `AttendanceRecord`/`TaskTimeEntry` already carry.
- **`lib/attendance.ts`** (pure, extended): `breakDurationMs(breaks, now)` and `netWorkedMs(sessions, breaks, now)` — sessions minus breaks, shown beside the raw total rather than folded into one figure, so "logged in 8 hours" and "worked 7.5 of them" both stay visible.
- **`lib/attendance-data.ts`:** `loadOpenBreak` (at most one, the same invariant `loadOpenSession` holds), `startBreak` (refuses with `invalidReference` if no session is open or `duplicateFailure` if a break already is; in one transaction, creates the break recording every currently-running `TaskTimeEntry`'s `taskId` and closes those entries with `endReason: "Break"`), `endBreak` (closes the break and, in one transaction, opens a fresh `TaskTimeEntry` for each `pausedTaskIds` entry that still exists — a task deleted mid-break is silently skipped rather than failing the whole unblock). `clockOut` now closes an open break in the same transaction, and a new `closeOpenBreakOnSignOut(companyId, employeeId)` (ids only, no `SessionActor` — mirrors `stopRunningEntries`'s shape) is called from the NextAuth `signOut` event in `lib/auth.ts`, right after the existing task-timer close, so a day can never end mid-break by any exit path. `loadMyAttendance`/`loadEmployeeAttendance` now select each session's breaks in one nested query (`AttendanceRecordWithBreaks`) rather than a second round trip.
- **Naming collision resolved** (per Plan.md's own recommendation): the task timer's "Break" button (meaning "close this task's interval") is relabelled **Pause** in `components/tasks/task-timer.tsx`, plus its toast text — the `TimeEntryEndReason.Break` enum value and the `"break"` `TimerAction` string are both unchanged, so nothing in `lib/task-timer.ts`/`lib/task-timer-data.ts` needed to move.
- **API:** `POST /api/attendance/break/start` (Employee logins only, plus the Phase 14 `attendanceAllowedOnDevice` device check — same reasoning as clock-in) and `POST /api/attendance/break/end` (no device check, same reasoning as clock-out: ending a break has to stay allowed everywhere or the blocking overlay could strand someone on a phone).
- **UI:** new `components/ui/dialog.tsx` — the shadcn/Radix `Dialog` primitive, following `select.tsx`/`accordion.tsx`'s exact `radix-ui` combined-package import style (`radix-ui` was already a dependency, no new package). `DialogContent` takes a `showCloseButton` prop so the general-purpose primitive can be reused for a dialog with no dismissal path of its own. `components/attendance/break-overlay.tsx` — non-dismissible (`onEscapeKeyDown`/`onPointerDownOutside`/`onInteractOutside` all suppressed, `showCloseButton={false}`), a live timer, one "End break" button — mounted in `app/(dashboard)/layout.tsx` (which loads `loadOpenBreak` for an Employee actor alongside its existing avatar read) so it follows the employee across every page, not only My Work. `AttendanceWidget` gained "Take a break", enabled only while clocked in and not already on one — once clicked, `router.refresh()` picks up the new open break server-side and the layout's overlay takes over. `AttendanceTable` (shared by My Work and the admin-facing Attendance panel on an employee's profile) now shows **Worked** (net) and **Break** columns instead of one raw **Duration** column.
- **Tested:** `lib/attendance.test.ts` (+6: `breakDurationMs`/`netWorkedMs` over closed/open/empty breaks). Two new route-test files following `lib/test-helpers.ts`'s real-Postgres, mock-only-`getActor` convention: `app/api/attendance/break/start/route.test.ts` (+4: not clocked in, mobile device blocked, starts and pauses a real running task timer, refuses a second break) and `app/api/attendance/break/end/route.test.ts` (+3: not on a break, ends and resumes exactly the paused task while leaving an untouched task alone, resumes nothing for a break that paused no tasks). 13 new tests; **396/396 passing**.

**Verification performed:**

- `npx prisma migrate dev` applied against the real Supabase Postgres. `npx tsc --noEmit`, `eslint .`, `npm run build`, `npm test` (396/396) all clean.
- **Driven against the running dev app and the real Postgres with curl**, real NextAuth cookie sessions for both an Owner and an Employee (registered a company, invited and accepted an employee invite, signed in both): `break/start` before clocking in → 400 `invalid_reference`; clocked in → `break/start` → 200 with `pausedTaskIds: []`; a second `break/start` while one is open → 409 `duplicate`; `clock-out` while on a break → 200 and the break record's `endedAt` got stamped in the same call (confirmed via a second `break/end` afterward → 400 `invalid_reference`, proving it was already closed). Second run: started a task's timer, then started a break → the break's `pausedTaskIds` correctly named that task and a `break/start` from a mobile user-agent (while already on a break, so the device check still runs first) → 403 `small_screen`; `break/end` → 200. `/my-space` (200) rendered "Take a break" once the break had ended, and an admin's `/employees/[id]` (200) rendered the new "Worked"/"Break" columns correctly.
- Not verified: the blocking overlay's actual browser behavior (focus trap, escape/outside-click truly suppressed) — reasoned through against Radix's own `Dialog` contract and `DialogContent`'s suppressed handlers, but not clicked through in a real browser this session, same class of gap every phase since 6 has carried for visual/interaction polish.

**Files created/changed:**

- Created (lib): none new — `lib/attendance.ts`/`lib/attendance-data.ts` extended in place
- Created (tests): `app/api/attendance/break/start/route.test.ts`, `app/api/attendance/break/end/route.test.ts`
- Created (API): `app/api/attendance/break/start/route.ts`, `app/api/attendance/break/end/route.ts`
- Created (components): `components/ui/dialog.tsx`, `components/attendance/break-overlay.tsx`
- Changed: `prisma/schema.prisma` (+`BreakRecord`, + migration), `lib/attendance.ts` (+`breakDurationMs`/`netWorkedMs`), `lib/attendance-data.ts` (+`loadOpenBreak`/`startBreak`/`endBreak`/`closeOpenBreakOnSignOut`, `clockOut` and the two read functions extended), `lib/attendance.test.ts`, `lib/auth.ts` (`signOut` event closes an open break), `components/attendance/attendance-widget.tsx` (+"Take a break"), `components/attendance/attendance-table.tsx` (Worked/Break columns), `components/tasks/task-timer.tsx` (Break → Pause), `app/(dashboard)/layout.tsx` (mounts `BreakOverlay`), `app/(dashboard)/my-space/page.tsx` (+`openBreak`)

**Known issues / TODOs:**

- **No real-browser check of the overlay's focus trap / escape suppression**, see Verification above.
- **Plan.md's other two open questions for this phase** — relabel task-timer "Break" to "Pause" (done, above) and My Work showing net worked with break called out separately (done, above) — are both resolved as recommended.

**Next step:**

- Plan.md Phase 16 — half-day / first-half / second-half leave on a `Request`.

### 2026-09-15 — Session 13

**Phase worked on:** Plan.md Phase 14 — attendance only from a laptop-sized screen

**What was completed:**

- New `lib/device.ts` (pure): `MIN_ATTENDANCE_WIDTH_PX = 1024` and `attendanceAllowedOnDevice(deviceType)`, named identically by both the client and the server so the threshold lives in one place rather than as a magic number twice.
- **Client:** `components/attendance/attendance-widget.tsx` adds a `screenAllowed` state (`"unknown" | "allowed" | "blocked"`), resolved from `matchMedia` in an effect so the first client render matches the server's (neither knows the viewport, avoiding a hydration mismatch). Below 1024px, the Log-in button is replaced with a short explanation; Log-out is never affected.
- **Server:** `POST /api/attendance/clock-in` now takes the `NextRequest` and calls `userAgent(request)` from `next/server` (no new dependency, confirmed in `node_modules/next/dist/docs/.../userAgent.md` per this repo's AGENTS.md rule to read the docs for this Next.js build before writing code touching an API it documents). Refuses `device.type` of `mobile`/`tablet` with a 403 and `code: "small_screen"`. `/api/attendance/clock-out` is untouched, per Plan.md's explicit decision: blocking clock-out or end-break would strand an open session on a phone with no way to close it.
- The server check is a policy guardrail, not a security boundary — a spoofed user-agent or desktop mode on a phone defeats it, and a narrow desktop window trips the client check — documented in both `lib/device.ts` and the route's own comment, matching Plan.md's own framing.
- **Tested:** `lib/device.test.ts` (4 cases: desktop/undefined allowed, mobile and tablet blocked, other device types like smarttv/console unaffected) and a new `app/api/attendance/clock-in/route.test.ts` (2 cases: a real mobile Safari user-agent refused with `small_screen`, a real desktop Chrome user-agent succeeds), following the existing `lib/test-helpers.ts` route-test convention (mock `getActor` only, real Postgres). `npx tsc --noEmit`, `eslint`, and the full suite (383 tests total, including these 6 new ones) all pass.

**Not done / still open:**

- Nothing outstanding for this phase. Plan.md's own open question ("should clock-out/end-break be blocked too?") was left as recommended: allowed everywhere.

### 2026-09-12 — Session 12

**Phase worked on:** Phase 13 — multi-channel notifications (the "WhatsApp integration" bullet of Phases.md Phase 13, built out into email + WhatsApp + Web Push + in-app across every notification the app sends)

**What was completed:**

- **Four product decisions confirmed with the user before building:** (1) WhatsApp is **on by default** wherever a phone number exists, rather than opt-in — the cost and consent risk was put to the user explicitly and they chose the default-on reading, so an opt-*out* UI is provided instead; (2) `CompanyAccount` gains a `phone` column so admins can receive WhatsApp at all; (3) the task-completed report to admins fires **per completion**, not as a nightly digest; (4) the scheduler is a **GitHub Actions workflow**, not Vercel Cron, so it is not tied to one host and is not capped at one run a day.
- **One dispatcher, five events.** `deliver()` in `lib/notification-data.ts` is now the single path every notification takes: it writes the bell row, then fans the same sentence out to whichever of Email, WhatsApp and Push that recipient still has on. Five events feed it — `TaskAssigned`, `TaskCompleted`, `DeadlineApproaching` (new) and `RequestSubmitted`, `RequestDecided` (existing, rerouted with their behaviour preserved: the decision email still carries the approver's note through a per-call `email` override).
- **Channel policy is one table.** `CHANNELS_BY_TYPE` in `lib/notifications.ts` says what each notification type is worth spending, and `resolveChannels` narrows it by the recipient's toggles and by whether we actually hold the contact detail — so a provider is never called without an address. `InApp` can never be dropped: the bell is the record that the event happened. `RequestSubmitted` deliberately stays off Email and WhatsApp (approvers see a queue of them all day; Phase 7 was in-app only) and gains push alone.
- **Schema (migration `20260912090000_add_notification_channels`):** `NotificationType` enum; `Notification.type` (NOT NULL, backfilled from the existing `link` — `/my-space/requests/%` is a decision, everything else a submission — then the scaffolding default dropped); `Notification.dedupeKey` + `@@unique([companyId, dedupeKey])`; `CompanyAccount.phone`; new `NotificationPreference` (one row per person, created only once they change something — no row means every channel is on, so no backfill) and `PushSubscription` (keyed on the push service endpoint, deleted rather than soft-deleted on a 404/410 from the push service).
- **Deadline sweep:** `jobs/notifyDeadlines.ts` + `POST /api/jobs/notify-deadlines`, cloned from `generate-alerts` down to the `CRON_SECRET` guard. Warns at two milestones — the day before and the day of (`DEADLINE_WARNING_DAYS`) — reading only the exact due dates being warned about, so `@@index([companyId, status, dueDate])` serves it. Overdue work is deliberately not warned about: the dashboard's `OverdueTask` alert already carries it, and a daily "still overdue" would restate the same fact forever. Re-running the sweep is a no-op because every warning carries a `dedupeKey` naming the task, its deadline and which warning it is.
- **Providers, all three following `lib/mailer.ts`'s contract** (unconfigured means log and report not-sent, never throw): `lib/whatsapp.ts` (Meta Cloud API, direct `fetch`, pinned to Graph `v21.0`); `lib/push.ts` (the one new dependency, `web-push` — VAPID ES256 JWTs and RFC 8291 payload encryption are the wrong kind of code to hand-roll); `notificationEmailBody` added to the existing mailer.
- **UI:** `components/dashboard/notification-settings-form.tsx` on `/notifications`, which both account types already reach — an employee has no access to `/settings` at all, so this is the one place. Push is shown as the two things it actually is: a stored preference, and a per-browser subscription, with a button that registers `public/sw.js` on demand rather than asking for notification permission on page load.
- **Tested:** 36 new tests, all passing — `lib/notifications.test.ts` (31, covering the channel rule hardest since every message that costs money leaves through it, plus phone normalisation, completion watchers, dedupe keys) and `app/api/jobs/notify-deadlines/route.test.ts` (5, the cron guard, including that an unset `CRON_SECRET` fails closed rather than open). `npm run build`, `npx tsc --noEmit` and `eslint` all clean.

**Not done / still open:**

- **Nothing has been sent end-to-end.** No `.env` exists in this working tree, so WhatsApp, push and the deadline sweep have never run against a real provider or a real database. Every provider is written to log-and-skip when unconfigured, which is exactly the state they are in. Meta business verification, template approval and the VAPID keypair are all prerequisites the user has to complete — see Blockers.
- **The other four job endpoints still have no scheduler.** `generate-alerts`, `recalculate-workload`, `recalculate-performance` and `cleanup-chat-messages` are still called by nothing; the new workflow schedules only the deadline sweep, because how often each of the others should run is a separate decision. The dashboard regenerates alerts on every visit in the meantime.
- **WhatsApp default-on is a deliberate, user-chosen risk.** Anyone with a phone number on file starts receiving WhatsApp as soon as credentials are configured, without having consented in-product. The opt-out exists and every message names it, but Meta's own policy expects recorded opt-in, and quality ratings fall on user blocks.

### 2026-09-07 — Session 11

**Phase worked on:** Phase 12 — Polish & Hardening (all five bullets, in one session — confirmed with the user before building)

**What was completed:**

- Three scope decisions confirmed with the user before building: (1) do the whole phase in one session rather than staging it across several; (2) notification refinement stays scoped to what already sends notifications (Request submit/decide) — Phase 9's Alert engine stays dashboard-only, no new triggers; (3) automated route tests cover critical business-logic routes only (tasks, requests, performance, workload/alert settings, the two accept-invite flows, company registration), not all ~35 routes.
- **States:** `components/ui/skeleton.tsx` (new shadcn primitive) + `components/dashboard/loading-skeleton.tsx` (`SkeletonHeader`/`SkeletonList`/`SkeletonDetail`/`SkeletonDashboard`) back new `loading.tsx` files at every top-level dashboard section and the five heavier `[id]` detail segments. `app/(dashboard)/error.tsx`, `app/(marketing)/error.tsx`, `app/global-error.tsx` (client boundaries, reusing `EmptyState`) and `app/not-found.tsx` / `app/(dashboard)/not-found.tsx` replace Next's default fallbacks — the ~26 existing `notFound()` calls now render something branded instead of Next's stock 404. Built against **Next 16.3.4's actual API**, not training-data Next: `error.tsx`'s recovery callback is `retry`, not `reset` (confirmed in `node_modules/next/dist/docs`).
- **Permission audit (Workstream 2):** a systematic pass, not a rewrite — every `app/api/**/route.ts` checked for `getActor()`+`unauthorized()` before any work, `canX()`+`forbidden()` before any mutation, and every `db.<model>.` call checked against `scopedWhere`/`assertSameCompany` (Rules.md §2); every `app/(dashboard)/**/page.tsx` checked for its own server-side re-check rather than relying on `proxy.ts`'s coarse company/employee split. **Result: no gaps found** — every method-vs-`getActor` count matched, every DB query was already scoped (either through `scopedWhere` or a trivial `{ id: actor.companyId }`/prior scoped-read-then-update-by-id pattern), and every page-level `canX`-less page (`dashboard`, `performance`, all four `my-space/*` pages) turned out to already re-check `actor.accountType` — the correct level of check when a page has no further per-role subdivision within its account type. Eleven phases of established discipline held up under a real audit.
- **Pagination (Workstream 3):** new `lib/pagination.ts` (`PAGE_SIZE = 25`, `paginationSchema`, `paginationMeta` — clamps a stale `?page=9` down to the last real page rather than stranding the user on an empty result) + `components/dashboard/pagination.tsx` (a plain server-rendered Prev/Next, no client JS, mirroring how `tasks/page.tsx`'s `ViewToggle` already builds hrefs by hand). Applied to every previously-unbounded list: employees, projects, clients, the approver requests queue, the employee's own requests, the performance queue, and the new notifications page — `grep -rn "take:\s*\d"` across `lib/` had found exactly one unrelated hit before this session (`performance-data.ts`'s `take: 1` for "latest record"). `loadRequestsForApprover`/`loadOwnRequests`/`loadPerformanceQueue`/`loadNotificationsPage` now take a requested page number and do their own count-then-paginate in one place (not duplicated between the page and the matching API route, which both call the same function). The Kanban board view on `/tasks` stays unbounded — pagination doesn't map onto columns — but gained a defensive `take: 500`; the List view of the same page gets real pagination since it's row-oriented like everything else. A judgment call, recorded below.
- **Notifications (Workstream 4):** new `/notifications` page (both account types, reachable via a new "See all" link on the bell) shows the full paginated history via `loadNotificationsPage`; `GET /api/notifications` grew an optional `page` param without changing the bell's own no-param last-20 behavior. `proxy.ts` gained `/notifications` as a protected-but-shared prefix (reachable by both account types, like `/my-space` already was) — a real gap this session found and closed: the route existed with no proxy entry at all before the page was added. No new notification triggers, no retry/queue infrastructure, per the scope decision above.
- **Tests (Workstream 5):** new `lib/test-helpers.ts` — fixtures (`createTestCompany`, `createEmployee`, `createTask`, etc., each uniquely suffixed so concurrent runs never collide) and a `jsonRequest` builder. **This is genuinely new territory for the repo:** no API route had an automated test before this session — every one was verified manually with curl each session, never committed, never repeatable (`lib/*.test.ts` files are pure-function tests with zero DB access). The new convention: import the route handler directly and invoke it (they're just exported async functions) against the real, already-migrated Postgres this repo's `DATABASE_URL` points at, mocking only `@/lib/auth`'s `getActor` to fix "who is signed in" — the database and every permission/business-logic check stay real, matching this codebase's existing no-mocked-DB ethos. 12 new test files, 36 tests, covering the routes named in the scope decision above, each with a happy path plus (where the route has one) a permission-boundary case.
- `vitest.config.mts` now loads `.env` via Vite's own bundled `loadEnv` (no new dependency — vitest is built on Vite) since a standalone `vitest run` never did before, and caps `maxWorkers` at 4: the full suite intermittently timed out under 25 simultaneous per-file worker connection pools against the pooled Supabase Postgres before this cap, and was stable across three consecutive runs after it.

**Verification performed:**

- `build`, `typecheck` (`npx next typegen` first, for the new `/notifications` route), `lint`, `format:check` all clean.
- `npm test`: **289/289** passing — 246 pre-existing + 7 new for `lib/pagination.ts` + 36 new across the 12 route-test files. Confirmed stable across three consecutive full-suite runs after the `maxWorkers` fix (it was not, before).
- **Driven against the running dev app and the real Supabase Postgres with curl**, NextAuth cookie session included (registered a company, fetched a CSRF token, signed in through `POST /api/auth/callback/company-login`, confirmed `/api/auth/session` returned the right actor): `/notifications` returns 200 for both an empty first page and `?page=2`; an unknown route renders the new styled 404 ("Page not found"); an unknown record under the dashboard (`/employees/does-not-exist`) renders the new dashboard-scoped 404 ("That record doesn't exist..."); an unauthenticated request to `/notifications` redirects to `/login?next=%2Fnotifications` (confirms the new `proxy.ts` entry). **Pagination driven end-to-end with real data:** created 30 employees via the API, confirmed `/employees` page 1 reads "Showing 1–25 of 30" and lists 25 distinct employees, page 2 reads "Showing 26–30 of 30" and lists the remaining 5, and `?page=99` (past the last real page) still returns 200 rather than an empty crash (the clamp in `paginationMeta` working as intended).
- Not verified: deliberately triggering a real uncaught exception to watch `error.tsx`'s `retry()` recover it live — the code path was reasoned through against Next's own docs and compiles/builds correctly, but wasn't forced in the running app this session.

**Files created/changed:**

- Created (lib): `pagination.ts`, `test-helpers.ts`
- Created (tests): `pagination.test.ts`, and one `route.test.ts` beside each of the 12 tested route files (`tasks/route.ts`, `tasks/[id]/route.ts`, `tasks/[id]/status/route.ts`, `requests/route.ts`, `requests/[id]/decision/route.ts`, `performance/[employeeId]/goals/route.ts`, `performance/[employeeId]/feedback/route.ts`, `settings/workload/route.ts`, `settings/alerts/route.ts`, `auth/company/register/route.ts`, `auth/company/accept-invite/route.ts`, `auth/employee/accept-invite/route.ts`)
- Created (components): `ui/skeleton.tsx`, `dashboard/{loading-skeleton,pagination,mark-all-read-button,notification-row}.tsx`
- Created (pages): `app/(dashboard)/error.tsx`, `app/(marketing)/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/(dashboard)/not-found.tsx`, `app/(dashboard)/notifications/{page,loading}.tsx`, `loading.tsx` under `dashboard/`, `employees/` (+`[id]/`), `projects/`, `tasks/`, `requests/` (+`[id]/`), `performance/` (+`[id]/`), `my-space/`, `settings/`
- Changed: `lib/request-data.ts`, `lib/performance-data.ts`, `lib/notification-data.ts` (each gains a page-aware read returning `{ rows, ...PaginationMeta }`), `app/api/{requests,performance,notifications}/route.ts` (pass the new `page` param through), `app/(dashboard)/{employees,projects,projects/clients,requests,my-space/requests,performance,tasks}/page.tsx` (real pagination), `proxy.ts` (+`/notifications`, `SHARED_PREFIXES` replaces the single `/my-space` special case), `components/dashboard/notification-bell.tsx` (+"See all" link), `vitest.config.mts` (`.env` loading, `maxWorkers: 4`)

**Decisions made (and why):** see Key Decisions Log below — 4 entries added this session.

**Known issues / TODOs:**

- **No real-browser check yet** — same gap carried since Phase 6, now covering the new loading skeletons, error boundaries and 404 pages too. Worth a visual pass (do the skeletons look right mid-navigation, does the error boundary's "Try again" actually recover) before calling this phase's UI fully verified in the sense earlier phases used the word.
- **The Kanban board view has no real pagination**, only a defensive `take: 500` — a company with more than 500 open tasks across all filters would silently see only the first 500 on the board (the List view of the same page has no such limit). Flagged rather than solved, since board pagination is a genuinely different UI problem than a table's.
- **Route test coverage is intentionally partial** — the ~23 routes outside this session's critical-path list (clients, projects, employees, company-accounts, most GET routes, the three job endpoints) still have no automated test, only their `lib/*-data.ts` unit tests and prior manual verification. `lib/test-helpers.ts` is now there for anyone who wants to extend coverage.
- **`error.tsx`'s `retry()` recovery was reasoned through, not forced live** — see Verification above.

**Next step:**

- Phase 12 was the last phase Phases.md names before Phase 13 (post-v1/future: native mobile, Slack/Teams/WhatsApp, AI-assisted assignment, custom reports, payroll, a client-facing portal). Before calling v1 itself done: the real-browser pass carried since Phase 6, the Phase 0 hosting-deployment blocker (still open — see Open Questions below), and deciding whether any Phase 13 item should start next.

---

### 2026-09-06 — Session 10

**Phase worked on:** Phase 11 — Client/Project Financial View (Agency-specific)

**What was completed:**

- One decision confirmed with the user before building: the new company-wide financial rollup is Owner/Admin only, narrower than `canViewProjects` — which, as this session's research surfaced, already lets a Manager see *every* project in the company (not just ones they lead) and that project's own margin individually. A new `canViewFinancials` permission was added rather than reusing `canViewProjects`; nothing about individual project visibility changed.
- No new schema: Phase 4 already added `Project.value`/`estimatedCost` and `lib/projects.ts` already had `toAmount`/`margin`/`marginPercent`, shown per-project on `/projects/[id]` since that phase. Phase 11 is purely the aggregation Phase 4 never built: `lib/projects.ts` gained `financialRollup(projects)` — one pure function that sums value/cost (only from projects that recorded one), computes margin only when *both* sides have at least one recording (mirroring `margin()`'s own "a missing side is not zero" rule), dedupes team members across projects into a real team size, and sums task counts/completion via the existing `completionPercent` from `lib/tasks.ts`. The same function computes both a client's own rollup and, given every project across every client, the agency-wide total — Phases.md's two bullets ("per-client rollup" and "agency-level aggregated dashboard") turned out to be the same arithmetic over two different slices of data.
- `lib/financials-data.ts` (new, DB-access) — `loadCompanyFinancials(actor)` shapes each client's projects into the rollup's input shape and calls `financialRollup` once per client plus once across everything.
- `lib/permissions.ts`'s `PROJECT_SECTIONS` constant became `projectSectionsFor(actor)` (mirroring `employeeSectionsFor`), since the new "Financials" tab is conditional on `canViewFinancials` while "Projects" and "Clients" stay open to anyone with `canViewProjects` — its own doc comment, which used to say "no per-role filtering... everyone who gets in sees both tabs," no longer held once a third, narrower tab existed. Both existing call sites (`/projects`, `/projects/clients`) were updated to call it with `actor`.
- `/projects/financials` (new page): agency-wide tiles (Total value, cost, margin, margin %) via the existing `MetricTile`, then a new `FinancialsTable` component with one row per client (value, cost, margin, margin %, team size, task count, completion %) — `formatMoney`/`formatPercent` already render `null` as "—", so no separate empty-state branching was needed for a client with no financials recorded at all. Redirects to `/projects` (the section root) on insufficient permission, the same precedent `/employees/accounts` set for a narrower-permission page under a wider-access section.
- Every project's status counts toward a rollup, including `Completed`/`Cancelled` — their revenue and cost already happened, and excluding them would undercount the agency's real numbers. A judgment call, recorded below.

**Verification performed:**

- `build` (confirms `/projects/financials` registers), `typecheck` (`npx next typegen` first), `lint`, `format:check` all clean. `npm test`: **246/246** passing (10 new: 7 for `financialRollup` in `lib/projects.test.ts`, 3 for `canViewFinancials` in `lib/permissions.test.ts`).
- **Driven against the running app and real Postgres with curl** (dev server was already running and did not need a restart — no schema change this phase): registered a company with a Manager and an employee, two clients — Client A with two projects (one with both value ₹2,00,000 and cost ₹1,20,000 recorded, one with only a value ₹1,00,000 recorded) and two tasks (one Done) on the first, plus Client B with one project recording no financials at all. Confirmed the Owner's `/projects/financials` renders both clients and totals that **matched the hand-computed rollup exactly**: value ₹3,00,000 (both projects' values summed), cost ₹1,20,000 (only the one project that recorded it), margin ₹1,80,000, margin 60.0%, task completion 50% (1 of 2 done) — all correct without needing every project to have complete data.
- **Permission boundary, both directions**: the Manager was redirected (307) away from `/projects/financials` and does not see the "Financials" tab, while the Owner does — but the Manager could still see that same project's own margin (₹80,000) on `/projects/[id]` (200), confirming Phase 11 changed nothing about `canViewProjects`'s existing, wider scope.
- Not verified: real browser rendering, same open gap every phase since 6 has carried; a client with more than a handful of projects (no pagination was added — matches every other list this codebase has built so far).

**Files created/changed:**

- Created (lib): `financials-data.ts`
- Created (components): `components/projects/financials-table.tsx`
- Created (pages): `app/(dashboard)/projects/financials/page.tsx`
- Changed: `lib/projects.ts` (+`financialRollup`, +`ProjectRollupInput`/`FinancialRollup`), `lib/projects.test.ts` (+7 tests), `lib/permissions.ts` (+`canViewFinancials`, `PROJECT_SECTIONS` constant → `projectSectionsFor` function), `lib/permissions.test.ts` (+3 tests), `app/(dashboard)/projects/page.tsx` and `app/(dashboard)/projects/clients/page.tsx` (call `projectSectionsFor(actor)` instead of importing the old constant)

**Decisions made (and why):** see Key Decisions Log below — 2 entries added this session.

**Known issues / TODOs:**

- **No real-browser check yet**, same gap carried since Phase 6.
- **No pagination on the financials table** — matches every other list page in this codebase today; flagged here since a client-heavy agency could make this table long, same class of gap Phase 12 ("performance/query optimization for larger datasets") is explicitly scoped to address.
- Phases 6–10's own "real browser pass" note is still outstanding, now joined by Phase 11's UI.

**Next step:**

- Do a real-browser pass over Phases 6–11's UI together before any of them are called fully verified in the sense earlier phases used the word.
- Start **Phase 12 — Polish & Hardening**: notification refinement, a permission audit across all routes, query optimization for larger datasets, empty/loading/error states across all pages, and basic automated tests for critical business logic (much of the last item already exists from every phase since 5's unit-test convention, so this is largely a gap-filling pass).

---

### 2026-09-06 — Session 9

**Phase worked on:** Phase 10 — Employee Self-Service Dashboard

**What was completed:**

- Two decisions confirmed with the user before building: (1) employees *can* update the status of their own assigned tasks from My Work — not read-only, so a new `canUpdateTaskStatus` permission was needed rather than reusing `canManageTask` as-is; (2) task/project names on My Work are plain text, not links — `/tasks/[id]` and `/projects/[id]` are gated to delivery roles (`isDeliveryRole`-only) and would redirect an Employee away, and PRD.md 6.9 doesn't ask for employee-facing detail pages, so none were added.
- `lib/permissions.ts`: added `canUpdateTaskStatus(actor, task)` — the same rule as `canManageTask`, plus "the employee this task is assigned to", mirroring the "usual rule OR the person it's about" shape `canDecideOnRequest` already uses for requests. `app/api/tasks/[id]/status/route.ts` dropped its old `accountType !== "company"` hard block and now checks `canUpdateTaskStatus` instead of `canManageTask` — the only change to that route; `findTask`'s `scopedWhere` already worked unchanged for an Employee actor, and the downstream workload/performance recompute calls key off `task.assigneeId`, not off who made the request, so neither needed touching.
- No new schema and no new pure-logic module: everything "My Work" needs already existed as pure functions (`isOverdue`, `isOpen`, `TASK_ORDER` in `lib/tasks.ts`; `isClosed` in `lib/projects.ts`). Added `lib/my-work-data.ts` (DB-access only, mirrors `lib/alert-data.ts`'s dashboard-loader shape but for one employee) — `loadMyWork(actor)` returns the employee's cached `workloadPercent`, their open (non-`Done`) tasks in `TASK_ORDER`, and the open projects they're a `ProjectMember` of.
- `components/my-space/my-tasks.tsx` (`MyTaskList`) and `components/my-space/my-projects.tsx` (`MyProjectList`) are new, purpose-built components rather than reuses of `components/tasks/task-views.tsx`'s `TaskList`/`TaskBoard`: those link task titles and project names into the delivery-gated pages, which an Employee can't reach. `MyTaskList` splits tasks into "Due now" (overdue or due today, via `isOverdue`/`startOfDayUtc`) and "Upcoming" — reading naturally as PRD.md 6.9's "today's tasks, upcoming deadlines" without a new pure bucketing function. Every row always shows `TaskStatusSelect` (unconditionally — every row here is already the viewer's own task, so there's no `canManage` check to make client-side; the route itself is what actually enforces the boundary).
- `app/(dashboard)/my-space/page.tsx` rewritten from Phase 2's placeholder: reuses `WorkloadBar` and `MetricTile` from the Phase 9 dashboard components, plus the two new My Space components.

**Verification performed:**

- `build`, `typecheck` (`npx next typegen` again, same one-time step every phase with new dynamic routes has needed — though this phase added none; needed only because of the pre-existing `[id]` route, so this may have been a no-op, done anyway for consistency), `lint`, `format:check` all clean. `npm test`: **236/236** passing (3 new in `lib/permissions.test.ts` for `canUpdateTaskStatus`).
- **Driven against the running app and real Postgres with curl** (dev server was already running from the previous session and did not need a restart — no schema change this phase, so no stale-Prisma-client risk): registered a company with a Manager and two employees (Eve, Ned) reporting to the Manager, a project led by the Manager with Eve on the team, and three tasks assigned to Eve (overdue, due today, due in 2030). Confirmed `/my-space` renders 200 for Eve with the correct HTML — "Due now"/"Upcoming" section headers, both tasks' titles as plain text (not links), the project name and client name as plain text on the project card, and the workload bar showing the correct recomputed percentage and band.
- **Permission boundary, both directions**: Eve moved her own overdue task to `InProgress` then `Done` (200 both times, `completedAt` stamped correctly). Ned (not the assignee) got 403 attempting to move Eve's task, with the updated error message. The Manager (leads the project) could still move Eve's task exactly as before Phase 10 — a regression check that swapping `canManageTask` for `canUpdateTaskStatus` in the status route changed nothing for company accounts.
- Confirmed `/tasks` and `/projects` still 307-redirect an Employee away — Phase 10 grants no new page access, only the one status-update permission.
- Confirmed a second employee with no tasks or projects yet still gets a 200 render (empty states covered, not separately screenshotted).
- Not verified: real browser rendering (same open gap every phase since 6 has carried).

**Files created/changed:**

- Created (lib): `my-work-data.ts`
- Created (components): `components/my-space/{my-tasks,my-projects}.tsx`
- Changed: `lib/permissions.ts` (+`canUpdateTaskStatus`, +`AssignableTask`), `lib/permissions.test.ts` (+3 tests), `app/api/tasks/[id]/status/route.ts` (permission check swapped, old accountType block removed), `app/(dashboard)/my-space/page.tsx` (rewritten from the Phase 2 placeholder)

**Decisions made (and why):** see Key Decisions Log below — 2 entries added this session.

**Known issues / TODOs:**

- **No real-browser check yet**, same gap carried since Phase 6.
- **"Due now" vs "Upcoming" is a two-way split with no further windowing** (e.g. no separate "this week" bucket) — PRD.md 6.9 only names "today's tasks" and "upcoming deadlines", and a third bucket wasn't asked for; `components/my-space/my-tasks.tsx` is the one place to add one if it turns out to matter.
- **Phases 6–9's own "real browser pass" note from last session is still outstanding**, now joined by Phase 10's UI.

**Next step:**

- Do a real-browser pass over Phases 6–10's UI together before any of them are called fully verified in the sense earlier phases used the word.
- Start **Phase 11 — Client/Project Financial View**: per-client rollups (project value, team size, task count, completion %, estimated cost, margin) and an agency-level aggregated revenue/cost/margin dashboard.

---

### 2026-09-06 — Session 8

**Phase worked on:** Phase 9 — Company Dashboard & Early-Warning Engine

**What was completed:**

- Two decisions confirmed with the user before building: (1) a project counts as "stalled" when it's still `Planning`/`Active`/`OnHold`, has at least one task, and no task has changed status within a company-configurable number of days (default 14) — reuses `Task.updatedAt`, no new tracking field; (2) alert thresholds are Owner/Admin-only (`canManageCompanySettings`, already existed — no new permission function needed), narrower than the workload-capacity setting Managers can also tune.
- Schema: `enum AlertType`/`AlertSeverity`, three new `Company` threshold columns (`overloadThresholdPercent` default 80, `stalledProjectDays` default 14, `agingApprovalDays` default 5, mirroring `weeklyCapacityHours`), and `model Alert` — a **live snapshot, not a history** (unlike `PerformanceRecord`): regenerating a company's alerts wipes and reinserts its entire `Alert` table in one transaction rather than diffing, since a cleared condition should simply stop existing as a row. `employeeId`/`projectId` are two independent optional pointers (not the usual "exactly one" pair) so a Manager's dashboard can filter to alerts about their own direct reports or led projects. Migration `20260906075014_phase9_alerts` applied against the real Supabase Postgres.
- Pure/DB-access split mirrored from Phases 6/8: `lib/alerts.ts` (`overdueTaskAlerts`, `overloadedEmployeeAlerts`, `stalledProjectAlerts`, `agingApprovalAlerts`, `generateAlerts`, `alertSeverityFor`) + `lib/alert-data.ts` (`recalcCompanyAlerts` — the wipe-and-reinsert transaction, `loadAlertsFor` — the three-way Owner/Admin/Manager/HR scoping split, `loadDashboardMetrics` — the aggregate tiles, similarly scoped).
- `GET /api/dashboard` regenerates a company's alerts synchronously before reading them — unlike Phase 6/8's per-write recompute, an alert's condition can become true purely from elapsed time (a task going overdue, a request aging), so there's no single write to hang a trigger off; "someone is looking at the dashboard" is the natural trigger, with `POST /api/jobs/generate-alerts` (`CRON_SECRET`-guarded like its Phase 6/8 counterparts) as a scheduled backstop.
- `PATCH /api/settings/alerts` (Owner/Admin only) added as a second card, "Alerts," on the existing `/settings` page — rendered conditionally alongside the Phase 6 workload-capacity card, which stays visible to Managers.
- `/dashboard` rewritten from its role-flavored placeholder into the real aggregate dashboard: metric tiles (active employees, pending approvals, reimbursement summary always; active projects, task completion, overdue count, performance snapshot for non-HR), a workload heatmap (colored cells reusing Phase 6's cached `workloadPercent`, PRD.md 6.4's "Rahul 92%, Priya 61%, Aman 38%" example), and the exceptions panel (grouped alerts, Critical=red/Warning=yellow, an explicit green "All clear" empty state) — all scoped by role inside `loadDashboardMetrics`/`loadAlertsFor` rather than in the page itself (`metrics.delivery` is `null` for HR, so the page simply omits those tiles).

**Verification performed:**

- `build`, `typecheck` (needed `npx next typegen` once again, same one-time step Phase 8 needed for new dynamic API routes), `lint`, `format:check` all clean. `npm test`: **233/233** passing (16 new in `lib/alerts.test.ts`).
- `npx prisma migrate dev` applied against the real Supabase Postgres.
- **Driven against the running app and real Postgres with curl** (no browser tool this session, same gap as Sessions 5–8; dev server restarted first for the fresh Prisma client, same lesson as every phase since 7): registered a company with Manager 1, Manager 2, HR and an employee reporting to Manager 1; lowered the overload threshold to 10% and created a task overdue since 2020 assigned to the employee on a project led by Manager 1 → the Owner's dashboard correctly showed both an `OverdueTask` and an `OverloadedEmployee` alert (employee's cached workload was 75%, over the 10% threshold) → Manager 1's dashboard showed the identical two alerts (their own report/project) → Manager 2's dashboard (no reports, one project with zero tasks) showed **zero** alerts, correctly not flagging the empty project as stalled → HR's dashboard showed `delivery: null` (no heatmap/project/task tiles) and correctly zero alerts (the one submitted request hadn't aged past the 1-day threshold yet).
- **The 14-day stalled-project rule needed a database-level check**, since no live test can wait 14 real days: created a fresh project+task via the API, confirmed no `StalledProject` alert existed, then used a small `tsx` script (`PrismaClient` + `$executeRawUnsafe`) to set that task's `updatedAt` 20 days in the past directly in Postgres, and confirmed the very next `GET /api/dashboard` produced the alert with the exact expected message. The script and its temp files were deleted afterward — no leftover artifacts in the project directory.
- Permission boundaries: a Manager got 403 attempting `PATCH /api/settings/alerts`. `/api/jobs/generate-alerts` returned 401 with no secret and with a wrong one. All dashboard and settings pages returned HTTP 200 for the roles that should reach them.

**Files created/changed:**

- Created (lib): `alerts.ts`, `alert-data.ts`
- Created (tests): `alerts.test.ts`
- Created (jobs): `generateAlerts.ts`
- Created (API): `app/api/dashboard/route.ts`, `app/api/settings/alerts/route.ts`, `app/api/jobs/generate-alerts/route.ts`
- Created (components): `components/dashboard/{metric-tile,workload-heatmap,alerts-panel,alert-settings-form}.tsx`
- Changed: `prisma/schema.prisma` (+ migration), `lib/validations/settings.ts` (+`alertSettingsSchema`), `app/(dashboard)/dashboard/page.tsx` (rewritten from the Phase 2 placeholder), `app/(dashboard)/settings/page.tsx` (+ Alerts card)

**Decisions made (and why):** see Key Decisions Log below — 4 entries added this session.

**Known issues / TODOs:**

- **No real-browser check yet**, same gap carried since Phase 6.
- **Alert severity is fixed per type** (`AgingApproval` Critical, the other three Warning) rather than scaling with how far past a threshold something is — PRD.md section 6.8 doesn't ask for graduated severity, and this is the simplest reading of "red/yellow/green." `lib/alerts.ts`'s `alertSeverityFor` is the one place to change it if that turns out to matter.
- **`CRON_SECRET` still has no scheduler pointed at it** — same open Phase 0 hosting blocker as the workload and performance sweeps.
- **"Project contribution" and "rework/quality" from PRD.md section 6.5 remain out of Phase 8/9's performance score** — unrelated to this session's work, carried forward from Phase 8's own note since there's still no data model for either.

**Next step:**

- Do a real-browser pass over Phases 6–9's UI together before any of them are called fully verified in the sense earlier phases used the word.
- Start **Phase 10 — Employee Self-Service Dashboard**: "My Work" (today's tasks, deadlines, current projects, workload), "My Growth" (already built in Phase 8), and "My Requests" (already built in Phase 7) — per Phases.md, this phase is mostly about "My Work," since the other two panels already exist.

---

### 2026-09-06 — Session 7

**Phase worked on:** Phase 8 — Performance Tracking

**What was completed:**

- Two decisions confirmed with the user before building: (1) goals are manager-owned — Owner/Admin/HR or the employee's own manager create and decide them, the employee only ever reads them on My Growth (`canEditEmployee`'s existing scope, reused directly rather than adding a new permission); (2) manager feedback is visible to the employee immediately on submission, no draft/private state.
- Schema: `enum GoalStatus` (Active/Achieved/Missed — decided once, mirrors `RequestStatus`), `model Goal`, `model Feedback` (a required 1–5 `rating` alongside the free-text `body`, since the scoring engine needs a number feedback alone can't give it), and `model PerformanceRecord` — a real history table (Architecture.md's ERD: `Employee 1---* PerformanceRecord`), unlike `workloadPercent`'s single cached value: every triggering recompute that finds enough data appends a new row rather than overwriting one. Migration `20260906070320_phase8_performance` applied against the real Supabase Postgres.
- `lib/permissions.ts`: added `canViewPerformance` (an employee sees only their own; everyone else follows `canEditEmployee`'s scope — this directly answers the PRD FAQ "can employees see each other's performance?"). Also added `/performance` to HR's sidebar navigation, which had been left out before Phase 8 gave HR real work to do there.
- Pure/DB-access split mirrored from `lib/workload.ts`/`workload-data.ts`: `lib/performance.ts` (`taskCompletionRate`, `onTimeDeliveryRate`, `workloadContribution`, `feedbackContribution`, `goalContribution`, `calculatePerformanceScore` with weighted-average renormalization when a component has no data yet, `performanceBand`/`performanceBandLabel`) + `lib/performance-data.ts` (recompute, history/queue reads, goal/feedback writes).
- Full lifecycle: `POST/PATCH /api/performance/[employeeId]/goals[/[goalId]]` (one-time decision, 409 on a second attempt, same shape as request decisions) and `.../feedback`; `GET /api/performance` (queue, Manager-scoped to direct reports) and `GET /api/performance/[employeeId]` (one employee's score history). The recompute (`safeRecalcEmployeePerformance`, never throws) is wired into every task-write route that already recomputes workload — `POST /api/tasks`, `PATCH /api/tasks/[id]` (both old/new assignee), `PATCH /api/tasks/[id]/status`, `DELETE /api/tasks/[id]` — always called after the workload recalc so it reads the just-updated `workloadPercent`.
- `/performance` (queue) and `/performance/[id]` (score chart via Recharts — first use of it in this codebase — plus goals and feedback, with a `canViewPerformance` `notFound()` guard so a Manager can't reach another manager's report by URL) replace their `ComingInPhase` stubs; `/my-space/growth` (self-view, read-only) replaces its stub too.
- `app/api/jobs/recalculate-performance/route.ts` + `jobs/recalculatePerformance.ts` — the periodic sweep, `CRON_SECRET`-guarded exactly like Phase 6's workload sweep.

**Verification performed:**

- `build`, `typecheck`, `lint`, `format:check` all clean (typecheck needed `npx next typegen` once first, to pick up the new dynamic API routes' typed `RouteContext` — a one-time step after adding new route folders, not a bug). `npm test`: **219/219** passing (23 new in `lib/performance.test.ts`, 6 new for `canViewPerformance` in `lib/permissions.test.ts`, plus one existing HR-navigation test extended to check for `/performance`).
- `npx prisma migrate dev` applied against the real Supabase Postgres.
- **Driven against the running app and real Postgres with curl** (no browser tool this session, same gap as Sessions 5–6; the dev server was restarted first — same stale-Prisma-client lesson as Phase 7). One extended script: company + two Managers + an employee reporting to Manager 1 → a project/task assigned to the employee → walked the score through six recomputes (task created, task marked Done, a second task added, feedback given, a goal marked Achieved, the second task unassigned) and **hand-verified every single score against the weighted-average formula — all six matched exactly** (5.83 → 78.57 → 78.57 → 77.94 → 81.25 → back to 81.25 after unassigning), confirming both the formula and the renormalization-when-a-component-is-missing behavior are correct.
- Permission boundaries: Manager 2 (not this employee's manager) got 403 viewing the employee's performance and creating a goal; the employee themselves got 403 attempting to create a goal or feedback for themselves; the employee could see feedback the instant it was given; a second decision on an already-decided goal got 409; Manager 1's queue included the employee, Manager 2's did not.
- Also drove a task reassignment (`PATCH /api/tasks/[id]`, assigning away then back) and a task deletion, confirming both recompute the score exactly like creation and status changes do — the history's record count grew with every one.
- All three pages (`/performance`, `/performance/[id]`, `/my-space/growth`) returned HTTP 200 with authenticated cookies. `/api/jobs/recalculate-performance` returned 401 with no secret and with a wrong one.
- Not verified: real browser rendering (the Recharts line chart, the star-rating feedback display, focus states) — same open gap Phase 6 and 7 both carried forward.

**Files created/changed:**

- Created (lib): `performance.ts`, `performance-data.ts`, `validations/performance.ts`
- Created (tests): `performance.test.ts`
- Created (jobs): `recalculatePerformance.ts`
- Created (API): `app/api/performance/route.ts`, `app/api/performance/[employeeId]/route.ts`, `app/api/performance/[employeeId]/goals/route.ts`, `app/api/performance/[employeeId]/goals/[goalId]/route.ts`, `app/api/performance/[employeeId]/feedback/route.ts`, `app/api/jobs/recalculate-performance/route.ts`
- Created (pages): `app/(dashboard)/performance/[id]/page.tsx`, `app/(dashboard)/my-space/growth/page.tsx` (replaces stub)
- Created (components): `components/performance/{score-badge,score-history-chart,goal-status-badge,goal-views,goal-form,goal-decision-actions,feedback-views,feedback-form}.tsx`
- Changed: `prisma/schema.prisma` (+ migration), `lib/permissions.ts` (+`canViewPerformance`, HR nav), `lib/permissions.test.ts`, `app/(dashboard)/performance/page.tsx` (replaces stub), `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/tasks/[id]/status/route.ts` (each gains the performance recompute call)

**Decisions made (and why):** see Key Decisions Log below — 5 entries added this session.

**Known issues / TODOs:**

- **No real-browser check yet**, same gap as Phases 6–7.
- **`PERFORMANCE_WEIGHTS` (completion 30 / on-time 25 / workload 15 / feedback 15 / goals 15) and the score bands (≥70 Strong / ≥40 Steady / <40 Needs support) are judgment calls**, same as Phase 6's estimate/urgency defaults — PRD.md section 6.5 names the five inputs but gives no formula. `lib/performance.ts` is the one place to retune either if real data reads wrong.
- **No "rework/quality indicator"** despite PRD.md section 6.5 mentioning it — Phases.md's own Phase 8 bullet list only asks for the five inputs actually built, and there is no rework/revision-count data model in the schema to compute one from. Same kind of PRD/Phases gap Phase 6 flagged for skill-based assignee matching.
- **`CRON_SECRET` still has no scheduler pointed at it** — same open Phase 0 hosting blocker as the workload sweep.

**Next step:**

- Do a real-browser pass over Phases 6, 7 and 8's UI together before any of them are called fully verified in the sense earlier phases used the word.
- Start **Phase 9 — Company Dashboard & Early-Warning Engine**: an aggregate dashboard (active employees/projects, task completion, overdue tasks, workload heatmap, pending approvals, reimbursement summary, performance trend) and a rule-based early-warning/exceptions engine with configurable alert thresholds.

---

### 2026-09-06 — Session 6

**Phase worked on:** Phase 7 — Employee Requests & Approvals

**What was completed:**

- Schema: `enum RequestType` (Leave/Reimbursement/Equipment/WFH/HR/Complaint/Document/Suggestion), `enum RequestStatus` (Pending/Approved/Rejected), `model Request` (subject/description, nullable date range, nullable Decimal amount, nullable approver, decisionNote/decidedAt), `model Notification` (recipientEmployeeId/recipientAccountId — exactly one set). Widened the existing `Attachment` model with the same two-nullable-FK pattern already used for `Employee.managerId`/`managerAccountId`: `taskId` became optional, `requestId`/`addedByEmployeeId` added alongside it. Migration `20260906062023_phase7_requests` applied against the real Supabase Postgres.
- `lib/permissions.ts`: added `canDecideOnRequest` (Owner/Admin/HR decide on anyone; Manager only on their own direct reports, reusing `isDirectReport`).
- Pure/DB-access split mirrored throughout: `lib/requests.ts` + `lib/request-data.ts`, `lib/notifications.ts` + `lib/notification-data.ts` — the same convention `lib/tasks.ts`/`lib/task-data.ts` already established.
- Full request lifecycle: employee submission form with type-driven conditional fields (date range for Leave/WFH, amount for Reimbursement) via `createRequestSchema`'s `superRefine`; `GET/POST /api/requests`; `PATCH /api/requests/[id]/decision` (one-time — refuses a second decision with 409); attachments reusing the widened `Attachment` model at `/api/requests/[id]/attachments`.
- In-app notifications: a `NotificationBell` in the dashboard header (desktop sidebar + mobile header) polling `/api/notifications` every 30s, unread badge, mark-one/mark-all-read. Approvers are notified on submission (`resolveApproversFor` — Owner/Admin/HR always, the employee's own manager account only if that account's role is Manager); the employee is notified on decision, plus a best-effort decision email via a new `requestDecisionEmailBody` in `lib/mailer.ts` (logs instead of sending, since `RESEND_API_KEY` is still unset).
- Employee pages: `/my-space/requests` (list), `/my-space/requests/new` (form), `/my-space/requests/[id]` (detail). Approver pages: `/requests` (queue with status/type/search filters, Manager-scoped), `/requests/[id]` (detail with decide form) — replacing the two `ComingInPhase` stubs.
- Security fix while building the queue-detail page: added `if (actor.role === "Manager" && !canDecideOnRequest(actor, request)) notFound();` after the load, since the queue listing filtered a Manager to their own reports but direct URL navigation to another manager's report's request was not otherwise blocked.

**Verification performed:**

- `build`, `typecheck`, `lint`, `format:check` all clean. `npm test`: **189/189** unit tests passing (new: `lib/requests.test.ts`, `lib/notifications.test.ts`, plus a `canDecideOnRequest` block added to `lib/permissions.test.ts`).
- `npx prisma migrate dev` applied against the real Supabase Postgres.
- **Driven against the running app and real Postgres with curl** (no GUI browser available this session, same caveat as Phase 6): two scripted end-to-end runs.
  - `phase7_verify.sh`: company registration → owner + employee sign-in → Leave request rejected with 400 for missing dates → valid Leave and Reimbursement submitted (201) → employee blocked from deciding (403) → owner's queue lists both → owner approves the Leave with a note, rejects the Reimbursement with a note → re-deciding either is blocked (409 `already_decided`) → a company account is blocked from submitting a request (403) → employee's own list reflects both decisions → employee has 2 unread notifications (the decisions), owner has 2 unread (the submissions) → mark-one-read decrements the count, mark-all-read zeroes it.
  - `phase7_manager_scope.sh`: two Managers invited, an employee set to report to Manager 1 (`manager: "account:<id>"`), the employee submits an HR request → it appears in Manager 1's queue and not Manager 2's → Manager 2 gets 403 attempting to decide on it directly, Manager 1 succeeds → only Manager 1 (not Manager 2) receives the submission notification.
  - All 5 new pages (`/my-space/requests`, `/my-space/requests/new`, `/my-space/requests/[id]`, `/requests`, `/requests/[id]`) returned HTTP 200 with authenticated cookies.
  - Confirmed decision emails log correctly (`[mailer] Email delivery is not configured; not sending.`), including the decision note text.
- A real product bug was found and fixed during this verification: the submission notification text initially read "...submitted a HR request request: ..." (doubled "request") because `requestTypeLabel("HR")` already returns "HR request" and the original message template appended " request:" again. Reworded to "...submitted a new request (HR request): ..." which reads correctly for all 8 types, some of which already contain the word "request" in their label and some of which don't. Re-verified live after the fix.
- Not verified: real browser rendering, same open gap as Phase 6's session log — API/curl-only this session too.

**Files created/changed:**

- Created (lib): `requests.ts`, `request-data.ts`, `notifications.ts`, `notification-data.ts`, `validations/requests.ts`
- Created (tests): `requests.test.ts`, `notifications.test.ts`
- Created (API): `app/api/requests/route.ts`, `app/api/requests/[id]/decision/route.ts`, `app/api/requests/[id]/attachments/route.ts`, `app/api/notifications/route.ts`, `app/api/notifications/[id]/read/route.ts`
- Created (pages): `app/(dashboard)/my-space/requests/new/page.tsx`, `app/(dashboard)/my-space/requests/[id]/page.tsx`, `app/(dashboard)/requests/[id]/page.tsx`
- Created (components): `components/requests/{status-badge,request-form,request-views,decision-form,request-attachments,request-detail}.tsx`, `components/dashboard/notification-bell.tsx`
- Changed: `prisma/schema.prisma` (+ migration), `lib/permissions.ts` (+`canDecideOnRequest`), `lib/permissions.test.ts`, `lib/mailer.ts` (+`requestDecisionEmailBody`), `app/(dashboard)/layout.tsx` (renders `NotificationBell`), `app/(dashboard)/my-space/requests/page.tsx`, `app/(dashboard)/requests/page.tsx` (both replace `ComingInPhase` stubs)

**Decisions made (and why):** see Key Decisions Log below — 5 entries added this session.

**Known issues / TODOs:**

- **No real-browser check yet**, same gap as Phase 6 — colors, focus states, and the notification bell's dropdown positioning/accessibility have not been visually verified.
- **No "withdraw a pending request" feature.** Phases.md's Phase 7 bullet list and "Done when" don't ask for it, so it was not built; an employee who submits by mistake currently has to ask an approver to reject it.
- **The 30s notification poll is a fixed interval, not push-based.** Fine for v1; revisit if real-time delivery (websockets/SSE) is ever wanted.

**Next step:**

- Do a real-browser pass over Phase 6 and 7's UI (workload bars, request form, decision flow, notification bell) before they're both called fully verified in the sense earlier phases used the word.
- Start **Phase 8 — Performance Tracking** per Phases.md: review cycles/goals, manager evaluations, and an employee-visible performance summary.

---

### 2026-09-06 — Session 5

**Phase worked on:** Phase 6 — Workload Intelligence

**Starting-state correction:** Phases 4 (Projects & Clients) and 5 (Task Management) were already fully built in the codebase — models, pages, routes, tests all present and passing — but Memory.md's tracker still said "Not started" for both, and no session log entry existed for either. That gap is fixed in the tracker above; this entry only covers what was actually done this session (Phase 6).

**What was completed:**

- Two decisions confirmed with the user before building: (1) one flat weekly-capacity number (default 40h), editable by Owner/Admin/Manager, rather than a number that varies by employment type; (2) no BullMQ/Redis exists and no host is chosen yet, so the periodic recompute runs behind a plain secret-protected HTTP endpoint instead of a queue worker — a documented deviation from Architecture.md section 2.
- `Company.weeklyCapacityHours` (default 40) and `Employee.workloadPercent` / `workloadUpdatedAt` (cached, `null` meaning "never computed") added to the schema, migration `20260906055449_phase6_workload`.
- `lib/workload.ts`: pure calculation — open tasks only, a task with no estimate assumed at 4 hours (documented assumption below), an urgency weight by deadline proximity (overdue ×1.5, due ≤7d ×1.2, due ≤30d ×1.0, later/undated ×0.7), summed and divided by capacity. Can read over 100%. `workloadBand`/`workloadBandLabel` match Design.md's Workload Indicator Scale exactly. 13 new unit tests.
- `lib/workload-data.ts`: `recalcEmployeeWorkload` (one employee), `recalcCompanyWorkload` (one company, batched), `recalcAllCompanies` (the sweep), `safeRecalcEmployeeWorkload` (never throws — called from task-write routes so a recompute failure can never turn a saved task into a 500).
- Recompute wired into every task write that can change a number: `POST /api/tasks`, `PATCH /api/tasks/[id]` (both the old and new assignee, when reassigned), `PATCH /api/tasks/[id]/status`, `DELETE /api/tasks/[id]`. `lib/task-data.ts`'s `findTask` now also selects `assigneeId`.
- `jobs/recalculateWorkload.ts` (the file Architecture.md's folder listing already names) + `POST /api/jobs/recalculate-workload`, guarded by `CRON_SECRET` compared with the same constant-time comparator (`tokenHashMatches`) invite tokens use. Point any external scheduler at it once a host is chosen.
- `/settings` page (Owner/Admin/Manager — new `canManageWorkloadSettings`, deliberately wider than the existing, unused `canManageCompanySettings`) to edit the capacity number; saving recalculates every employee in the company synchronously.
- `WorkloadBar` component (Design.md's exact success/warning/danger scale, band word always shown beside the color) on the employee directory, the employee profile ("as of <timestamp>"), and the project team list.
- `loadAssigneesByProject` now sorts each project's picker lowest-workload-first, labels each option with its %, and marks the lowest "— suggested" — satisfies "suggest next assignee based on lowest workload" through the picker that already existed rather than a new UI surface. Skill/role matching (PRD.md section 6.4 also mentions it) is out of scope: the schema has no skills data.

**Verification performed:**

- `build`, `typecheck`, `lint`, `format:check` all clean. `npm test`: **173/173 unit tests** passing (13 new for `lib/workload.ts`, 2 updated/new for `navigationFor`/`canManageWorkloadSettings` in `lib/permissions.test.ts`).
- `npx prisma migrate dev` applied against the real local Postgres.
- **Driven against the running app and real Postgres with curl** (registered a fresh company, employee, client, project, team membership, and tasks through the real API, exactly as the app's own forms would) — **not a GUI browser**, unlike Phases 0–3's sessions; no browser-automation tool was available in this session, so this is the honest description of what was checked:
  - a task overdue by 10h plus a task 56 days out by 10h, on a 40h capacity, computed to exactly 55.0% (15 + 7 weighted hours ÷ 40) — matches the formula by hand.
  - the employee directory, the employee profile, and the project team page all rendered the same 55.0% / "At risk" band.
  - the assignee picker rendered "Priya Singh — Designer · 55.0% loaded — suggested" before any other candidate existed to compare against.
  - changing capacity to 20h through `/api/settings/workload` immediately recomputed the same employee to 110.0% / "Overloaded".
  - `/api/jobs/recalculate-workload` returned 401 with no secret and with a wrong one, and 200 with the right one — swept all 21 companies present in the dev database without disturbing the value already computed above.
  - an HR account was redirected away from `/settings` (307 → `/dashboard`) and got a 403 from the API route; Owner succeeded on both.
- Not verified: real browser rendering (colors, layout, focus states, screen-reader labels) of the new `WorkloadBar` — the curl checks above confirm the numbers and text are correct, not the visual result. Worth a real-browser pass before calling Phase 6 fully done in the sense earlier phases used the word.

**Files created/changed:**

- Created (lib): `workload.ts`, `workload-data.ts`, `validations/settings.ts`
- Created (tests): `workload.test.ts`
- Created (jobs): `recalculateWorkload.ts`
- Created (API): `app/api/jobs/recalculate-workload/route.ts`, `app/api/settings/workload/route.ts`
- Created (pages): `app/(dashboard)/settings/page.tsx`
- Created (components): `components/dashboard/{workload-bar,workload-settings-form}.tsx`
- Changed: `prisma/schema.prisma` (+ migration), `lib/permissions.ts` (+`canManageWorkloadSettings`, settings nav item), `lib/task-data.ts` (`findTask` gains `assigneeId`, `loadAssigneesByProject` rewritten), `lib/permissions.test.ts`, `components/dashboard/sidebar-nav.tsx`, `components/projects/project-team.tsx`, `proxy.ts` (`/settings` protected), `.env` / `.env.example` (`CRON_SECRET` replaces the unused speculative `REDIS_URL`), `app/(dashboard)/employees/page.tsx`, `app/(dashboard)/employees/[id]/page.tsx`, `app/(dashboard)/projects/[id]/page.tsx`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/tasks/[id]/status/route.ts`

**Decisions made (and why):** see Key Decisions Log below — 5 entries added this session.

**Known issues / TODOs:**

- **No real-browser check yet** — see Verification above. Worth doing before treating Phase 6 as verified to the standard earlier phases used.
- **Capacity is company-wide, not per employee.** The user explicitly asked for one flat number rather than a number that varies by employment type. A Part-Time employee's 100% therefore means the same 40 hours a Full-Time employee's does, unless the company lowers the number for everyone. Revisit if that turns out to matter in practice.
- **The un-estimated-task default (4 hours) and the deadline-urgency weights (1.5/1.2/1.0/0.7) are judgment calls**, not specified anywhere in PRD.md/Architecture.md. They are documented in `lib/workload.ts` and are the single place to change if they read wrong once real data exists.
- **`CRON_SECRET` has no scheduler pointed at it yet** — same open blocker as Phase 0's hosting decision. Once a host is chosen, wire its scheduler at `POST /api/jobs/recalculate-workload`.

**Next step:**

- Do a real-browser pass over the new Workload UI (colors, focus states, screen-reader labels) before starting Phase 7, since this session's verification was API-only.
- Start **Phase 7 — Employee Requests & Approvals**: the polymorphic `Request` model (Leave, Reimbursement, Equipment, WFH, HR, Complaint, Document, Suggestion), the employee-facing submission form, the manager/HR approval queue, and notifications on status change.

---

### 2026-09-05 — Session 4

**Phase worked on:** Phase 3 — Employee Management

**What was completed:**

- `Department` model from Architecture.md section 4, replacing the free-text `Employee.department` placeholder. The migration copies existing values into real Department rows and links them **before** dropping the column, so no data was lost.
- Full employee profile (PRD.md section 6.2): professional fields (department, job title, employment type, start date) and personal fields (personal email, phone, date of birth, location, address, emergency contact).
- Reporting line to **either** another Employee **or** a CompanyAccount, as Architecture.md section 4 describes, modelled as two nullable foreign keys rather than a polymorphic column.
- Employee directory with search (name, employee ID, email, job title) and filters (department, status), all driven from the URL so a filtered view can be linked and bookmarked.
- Employee profile page, edit form, and suspend/reactivate.
- Org chart at `/employees/org`, built by `buildOrgTree`.
- **Company account invites** (Admin / Manager / HR) at `/employees/accounts` — the gap flagged at the end of Phase 2. Reuses the employee invite mechanism exactly: hashed one-time token, 7-day expiry, cleared on use.
- Role-based visibility: Owner/Admin/HR manage every record; a Manager can view the directory but edit only their own direct reports; personal details are limited to Owner/Admin/HR and the person's own manager.
- New AA-passing status text tokens, and an `EmployeeStatusBadge` that uses them.

**Verification performed:**

- `build`, `typecheck`, `lint`, `format:check` all clean.
- **78 unit tests** (35 new), covering the reporting line, cycle detection, org-tree assembly, status transitions, the directory filter, and every new permission rule.
- **87/87 end-to-end checks** against the running app and real Postgres — real NextAuth sign-ins, real cookies, no mocks. Covering: company-account invite and acceptance; employee create/edit/suspend/reactivate; department find-or-create; every search and filter; duplicate and validation failures; reporting-line cycle rejection; **role-based visibility for Owner, Admin, HR, Manager and Employee**; cross-tenant isolation in five directions; and cross-table auth isolation re-checked now that company accounts can be invited.
- **47/47 browser checks in real Chrome**: registered a company, added an employee, searched, opened and edited the profile, viewed the org chart, and invited a company account — all through the actual forms. Plus zero horizontal overflow across 6 routes x 3 widths (390/768/1440), an accessibility spot-check on each route (single h1, no heading jumps, every control labelled, every button and link named, main landmark present), and **WCAG contrast measured on the rendered pixels** — no text below its AA threshold.
- **Checked the database directly**: no employee has both manager columns set; no cross-tenant department or manager link exists; every company-account password is a bcrypt cost-12 hash; no accepted invite still holds its token.

**Files created/changed:**

- Created (lib): `employees.ts` (pure domain logic), `employee-data.ts` (shared reads + write resolution), `format.ts`, `validations/employees.ts`
- Created (tests): `lib/employees.test.ts`; extended `lib/permissions.test.ts`
- Created (API): `app/api/employees/[id]/route.ts`, `app/api/employees/[id]/status/route.ts`, `app/api/company-accounts/route.ts`, `app/api/auth/company/accept-invite/route.ts`
- Created (pages): `app/(dashboard)/employees/{new,org,accounts}/page.tsx`, `app/(dashboard)/employees/[id]/{page.tsx,edit/page.tsx}`
- Created (components): `components/forms/fields.tsx` (moved from `components/auth/form-field.tsx`, plus `SelectField` and `TextareaField`), `components/employees/{employee-form,directory-filters,employees-tabs,status-badge,org-tree,employee-status-actions,invite-account-form,invite-link-notice}.tsx`
- Changed: `prisma/schema.prisma` (+ migration `20260905120000_phase3_employee_profiles`), `lib/permissions.ts`, `lib/auth.ts`, `lib/mailer.ts`, `lib/validations/auth.ts`, `app/globals.css`, `app/api/employees/route.ts`, `app/(dashboard)/employees/page.tsx`, `app/(auth)/invite/[token]/page.tsx`, `components/auth/accept-invite-form.tsx`, `components/auth/company-login-form.tsx`, `vitest.config.mts`
- Deleted: `components/employees/invite-employee-form.tsx` (superseded by `employee-form.tsx`)

**Known issues / TODOs:**

- **Employees are suspended, not deleted.** Phase 3's "Done when" asks for add/view/edit/list, and Rules.md section 6 says records referenced elsewhere must not be deleted, so removal is Suspend + Reactivate. The soft-delete unique-slot problem noted in Phase 2 therefore does not arise yet — revisit if a real "remove permanently" is ever needed.
- **Departments have no management screen.** They are created by typing a name on the employee form and reused by name. There is no rename, merge or delete, and an emptied department lingers. Phases.md does not ask for one; worth adding if companies accumulate typos.
- **Company accounts can be invited but not edited or removed.** No way to change someone's role, or revoke an Admin. Not in Phase 3's scope, but it is a real gap for an Owner.
- **Password reset is still not built** (carried from Phase 2). It needs working email.
- Email delivery is still unconfigured, so both invite kinds show the link to the inviting admin instead of sending it.
- The success toast can briefly overlap the action buttons in the top-right of a profile page. Cosmetic, auto-dismisses in 4s.

**Next step:**

- Start **Phase 4 — Projects & Clients**: the `Client` and `Project` models, project list and detail pages, assigning employees to a project team, and the basic project financial fields (project value, estimated cost). `scopedWhere` and the permission helpers are ready to be reused; `Employee` is now rich enough to be a real team member.

---

### 2026-09-05 — Session 3

**Phase worked on:** Phase 2 — Auth & Multi-Tenancy Foundation (Dual Login)

**What was completed:**

- Prisma models for `Company`, `CompanyAccount` and `Employee` per Architecture.md section 4, plus `CompanyRole` and `EmployeeStatus` enums, applied as migration `20260905085402_phase2_auth_tenancy`.
- Company registration creating a tenant and its first Owner account, with an auto-derived unique company slug.
- Two genuinely separate login paths built as two NextAuth Credentials providers, each reading exactly one table.
- Employee invite flow end to end: Admin/HR invites → one-time link → employee sets password → becomes Active → signs in.
- Session encodes `companyId`, `companySlug`, `companyName`, `role` and `accountType`.
- `scopedWhere()` tenant helper in `lib/tenant.ts`, used by every company-scoped query written so far.
- Role-aware app shell: brown sidebar with yellow active state, navigation that differs per role, and section stubs for the phases still to come.
- Route protection in `proxy.ts`, including keeping employees out of company areas and company users out of `/my-space`.

**Verification performed:**

- `build`, `lint`, `typecheck`, `format:check` all clean.
- **43 unit tests** across `lib/tenant`, `lib/permissions`, `lib/invites` and `lib/slug` — covering the tenant filter, every role rule, invite token hashing/expiry and slug generation.
- **42/42 end-to-end checks against the running app and real Postgres**, including:
  - registration creates a tenant + Owner; a second company registers independently
  - session carries companyId, role and accountType
  - **company credentials are rejected on the employee path, and employee credentials are rejected on the company path** — the Architecture.md section 8 invariant, tested in both directions
  - company B cannot see company A's employees; company A can see its own
  - an employee cannot sign in before accepting their invite, and cannot sign in against another company's slug
  - the invite token cannot be replayed after use
  - an employee is refused (403) when calling the invite and directory endpoints
  - anonymous users are redirected from every protected route
- **Full UI flow driven in Chrome**: registered a company through the form → landed on `/dashboard`; invited an employee → appeared in the directory; opened the invite link → set a password → landed on `/my-space` with only the employee navigation visible.
- **Checked the database directly**: passwords stored as bcrypt cost-12 hashes (`$2b$12$`, 60 chars, no plaintext anywhere), and `inviteTokenHash` is `NULL` after acceptance — single use enforced in the data, not just in code.

**Files created/changed:**

- Created (lib): `auth.ts`, `auth.config.ts`, `tenant.ts`, `permissions.ts`, `passwords.ts`, `invites.ts`, `slug.ts`, `mailer.ts`, `api.ts`, `validations/auth.ts`
- Created (tests): `lib/tenant.test.ts`, `lib/permissions.test.ts`, `lib/invites.test.ts`, `lib/slug.test.ts`, `vitest.config.mts`
- Created (API): `app/api/auth/[...nextauth]/route.ts`, `app/api/auth/company/register/route.ts`, `app/api/auth/employee/accept-invite/route.ts`, `app/api/employees/route.ts`
- Created (app): `app/(dashboard)/layout.tsx`, `dashboard/`, `employees/`, `my-space/` (+ growth, requests), and stubs for `projects`, `tasks`, `performance`, `requests`; `app/(auth)/invite/[token]/page.tsx`
- Created (components): `components/auth/*` (4 forms + shared field), `components/dashboard/*` (sidebar nav, sign-out, page header), `components/employees/invite-employee-form.tsx`
- Created: `proxy.ts`, `types/next-auth.d.ts`
- Changed: `prisma/schema.prisma`, the three auth pages, `components/ui/sonner.tsx`, `.env`, `.env.example`

**Known issues / TODOs:**

- **No way to create additional CompanyAccounts yet.** Registration produces the Owner, and the role rules for Admin/Manager/HR are written and unit-tested, but there is no UI or endpoint to actually add those users. Architecture.md section 4 says they are "invited by an Owner/Admin". Phases.md did not list it under Phase 2, so it was not built — it belongs in Phase 3 alongside role-based access control.
- **Password reset is not built.** PRD.md section 8 and Architecture.md section 5 both mention it, but Phase 2's bullet list and "Done when" do not. It needs working email, so it is best done once a provider key exists.
- Email delivery is unconfigured, so invites are not actually emailed. The invite link is shown to the inviting admin instead, and the server logs the message body.
- A soft-deleted employee still occupies its `companyEmail` / `employeeCode` uniqueness slot, so the same address cannot be re-invited after removal. Worth revisiting when employee deletion is built in Phase 3.
- The local dev database holds test data from these runs (5 companies, 2 employees). Harmless, and useful for Phase 3; reset with `npx prisma migrate reset` if you want it clean.

**Next step:**

- Start **Phase 3 — Employee Management**: employee profile model and detail pages, directory with search and filter, edit flows, and the org/reporting structure. Fold in the missing CompanyAccount invite flow (Admin/Manager/HR) noted above, since Phase 3 covers role-based access control.

---

### 2026-09-05 — Session 2

**Phase worked on:** Phase 1 — Landing Page & Marketing Site

**What was completed:**

- Built the full public marketing site with every section PRD.md section 6.0 requires: hero, features (all seven core modules), how-it-works (four steps), pricing placeholder, testimonials placeholder, FAQ, closing CTA band, and footer.
- Header nav carries the two distinct entry points PRD.md section 6.0 requires — "Company Login" and "Employee Login" — plus a mobile menu.
- Added standalone `/features`, `/pricing` and `/faq` routes (listed in Architecture.md section 5). They compose the same section components as the landing page, so there is no duplicated copy to keep in sync.
- Added `/contact`, `/terms` and `/privacy` placeholder pages so the PRD-required footer links are not dead ends.
- Stubbed the auth entry points: `/login` (path chooser), `/login/company`, `/login/employee`, `/register`, plus the `(auth)` shell. These are entry points and visual shells only — forms, schemas and authentication are Phase 2.
- Fixed a WCAG failure in the Design.md palette (see Key Decisions).

**Verification performed:**

- `build`, `lint`, `typecheck`, `format:check` all clean; `test` runs (still no business logic to test in this phase).
- All 11 routes return HTTP 200; an unknown path correctly returns 404.
- **Rendered in real Chrome** (not just compiled) and inspected computed styles: `h1` is exactly 32px in `#4A3A2C`, body is Inter 14px on `#FFFBF2` — matching the Design.md Display/Body tokens.
- **Responsive: zero horizontal overflow across 11 routes x 3 widths (390 / 768 / 1440px)**, measured by comparing `documentElement.scrollWidth` against the viewport and listing any element escaping its bounds.
- Interactions driven and confirmed working: the mobile menu opens with all six links and toggles `aria-expanded`; the FAQ accordion expands and reveals its answer.
- Accessibility spot-check: exactly one `h1`, correct heading order, no images missing `alt`, no unnamed buttons or links, no empty `href="#"` links, and header/nav/main/footer landmarks all present.
- Palette audit: no hardcoded hex values or arbitrary colours anywhere outside `globals.css`; the status palette appears only on the workload bars, never as branding.

**Files created/changed:**

- Created (components/marketing): `section.tsx`, `brand-mark.tsx`, `site-header.tsx`, `site-footer.tsx`, `hero.tsx`, `product-preview.tsx`, `features-section.tsx`, `how-it-works-section.tsx`, `pricing-section.tsx`, `testimonials-section.tsx`, `faq-section.tsx`, `cta-band.tsx`, `page-placeholder.tsx`, `auth-path-tabs.tsx`
- Created (routes): `app/(marketing)/{features,pricing,faq,contact,terms,privacy}/page.tsx`, `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/login/{company,employee}/page.tsx`, `app/(auth)/register/page.tsx`
- Created (ui): `components/ui/accordion.tsx`
- Changed: `app/(marketing)/layout.tsx` (header/footer shell), `app/(marketing)/page.tsx` (placeholder replaced by the real landing page), `app/globals.css` (contrast fix, smooth anchor scrolling with sticky-header offset)

**Known issues / TODOs:**

- The hero headline uses Design.md's Display token at 32px. That is the specified value and is followed exactly, but it reads small for a 1440px hero; worth revisiting with the user if the landing page should feel bolder.
- The features grid holds seven items in a three-column layout, so the last row has a single item. Acceptable, but an eighth module (for example the early-warning engine) would balance it.
- Deployment is still not done — carried over from Phase 0, same blocker.

**Next step:**

- Start **Phase 2 — Auth & Multi-Tenancy Foundation (Dual Login)**: the `Company`, `CompanyAccount` and `Employee` Prisma models; company registration creating a tenant plus its Owner; two independent login endpoints that never cross-check each other (Architecture.md section 8); the employee invite flow; sessions encoding `companyId`, `role` and `accountType`; the tenant-scoping query helper; and a role-aware dashboard shell. The Phase 1 auth stubs are the pages to replace.

---

### 2026-09-05 — Session 1

**Phase worked on:** Phase 0 — Project Setup

**What was completed:**

- Scaffolded Next.js 16.3.4 (App Router) + React 19 + TypeScript + Tailwind CSS v4 in the project root.
- Installed the exact stack from Architecture.md section 2: Prisma 7, @prisma/client, Zod, React Hook Form (+ @hookform/resolvers), TanStack Query, Recharts, lucide-react, NextAuth v5 beta, bcryptjs.
- Initialised shadcn/ui (Radix base, `nova` preset, CSS variables) and added `button` + `card`.
- Implemented the full Design.md colour/type/spacing system as CSS variables in `app/globals.css`, mapped onto shadcn's semantic tokens so all future components inherit the theme with no per-component hardcoding. Brand and status palettes are declared as separate token groups per Design.md section 3.
- Set Inter as the single typeface (Design.md section 4), replacing the scaffold's Geist.
- Overrode shadcn `button` variants to match Design.md section 6 exactly.
- Set up PostgreSQL 17 locally via a new `docker-compose.yml`; container `talking-lens-media-postgres` is healthy on port 5432.
- Wired Prisma: `prisma/schema.prisma` (datasource + generator, models deferred to their phases), `prisma7.config.ts`, and `lib/db.ts` (client singleton using the pg driver adapter).
- Created the full folder structure from Architecture.md section 5.
- Configured ESLint (+ eslint-config-prettier, `no-explicit-any` as error per Rules.md section 1), Prettier (+ tailwind plugin), and Vitest.
- Wrote `.env` (local, gitignored) and `.env.example` (committed), and fixed `.gitignore` which was ignoring `.env.example`.
- Replaced the Next.js default page with a themed Phase 0 placeholder at `app/(marketing)/page.tsx`.
- Rewrote `README.md` for this project.

**Verification performed (all passing):**

- `npm run build` — compiles, 2 static routes.
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run format:check` — clean.
- `npm test` — runs (no test files yet; Phase 0 has no business logic to test).
- `npx prisma migrate status` — connects to the live database, "Database schema is up to date!". **This is a real connection to a running Postgres, not a config-only check.**
- Served the production build and fetched `/` — HTTP 200. Inspected the served CSS and confirmed all Design.md tokens resolve: `#FFFBF2` background, `#F2B705` brand-yellow, `#4A3A2C` brand-brown, all four status colours, `#E9DFCB` border; `rounded-xl` compiles to exactly 12px; `:focus-visible` gives a 2px brand-yellow outline at 2px offset; body is 14px Inter; headings are semibold brand-brown.

**Files created/changed:**

- Created: `app/globals.css` (rewritten), `app/(marketing)/page.tsx`, `app/(marketing)/layout.tsx`, `lib/db.ts`, `prisma/schema.prisma`, `prisma7.config.ts`, `docker-compose.yml`, `.env`, `.env.example`, `.prettierrc`, `.prettierignore`, `components.json`, `components/ui/button.tsx`, `components/ui/card.tsx`, `lib/utils.ts`
- Changed: `app/layout.tsx`, `eslint.config.mjs`, `next.config.ts`, `package.json`, `.gitignore`, `README.md`
- Deleted: `app/page.tsx` (Next.js default)
- Folders created (empty, filled in later phases): `app/(auth)/**`, `app/(dashboard)/**`, `app/api/**`, `components/{dashboard,employees,tasks,requests}`, `jobs/`, `types/`

**Decisions made (and why):** see Key Decisions Log below — 9 entries added this session.

**Known issues / TODOs:**

- `npm audit` reports 4 high-severity advisories (`mysql2`, `deepmerge-ts`), all reached only through the **Prisma CLI dev dependency**. Not in the runtime bundle, and we use PostgreSQL, not MySQL. `npm audit fix --force` would downgrade to Prisma 6 and break against `@prisma/client` 7, so it was left alone. Revisit when Prisma 8 is stable.
- Empty structural folders won't survive a `git commit` (git doesn't track empty directories). They fill up naturally from Phase 1 onward.
- This project directory is not its own git repository — it sits inside a parent repo (`Web Projects`) that tracks other projects. Worth initialising a dedicated repo before the first commit.

**Next step:**

- Start **Phase 1 — Landing Page & Marketing Site**: hero, features overview, how-it-works, FAQ accordion, pricing placeholder, testimonials placeholder, footer, and a header nav with distinct "Company Login" / "Employee Login" entry points (routes stubbed). Design.md section 8 has the specific marketing-page guidance. The Phase 0 placeholder at `app/(marketing)/page.tsx` should be replaced by the real landing page.

---

### Session Template (copy for each new entry)

```
### [Date] — Session N
**Phase worked on:**
**What was completed:**
-
**Files created/changed:**
-
**Decisions made (and why):**
-
**Known issues / TODOs:**
-
**Next step:**
-
```

---

## Key Decisions Log

- **2026-09-07 (Phase 12) — Notification refinement stays scoped to what already sends notifications; the Alert engine stays dashboard-only.** Confirmed with the user directly: Phase 9's Critical/Warning alerts (overdue tasks, overloaded employees, stalled projects, aging approvals) could plausibly also fire a Notification, but that's a new trigger with its own dedup story (alerts are wiped-and-reinserted on every dashboard visit, so "notify once" needs different logic than the alert table itself has), not "refinement" of Requests' existing submit/decide notifications. Matches Phases.md's literal wording and Rules.md §8's "don't add features beyond what's asked."
- **2026-09-07 (Phase 12) — Automated route-handler tests are new territory for this repo, and only mock `getActor`, never the database.** Every prior phase verified its API routes manually with curl each session — real, but not repeatable or committed. The new convention (`lib/test-helpers.ts`) imports a route handler directly and calls it against the real, already-migrated Postgres `DATABASE_URL` points at, with only `@/lib/auth`'s `getActor` mocked to fix "who is signed in." This was a deliberate choice over mocking Prisma: it keeps every permission check and tenant-scoping query exercised for real, matching the no-mocked-DB ethos every `lib/*.test.ts` file already has, at the cost of tests needing a reachable database to run.
- **2026-09-07 (Phase 12) — Coverage is 12 critical routes, not all ~35.** Confirmed with the user directly. Tasks, requests, performance goals/feedback, workload/alert settings, and the two invite-acceptance-plus-registration auth flows were judged the highest-value/highest-risk surface (real business logic, real permission boundaries); the remainder (clients, projects, employees, company-accounts, most GET routes, the three cron job endpoints) stay covered only by their `lib/*-data.ts` unit tests and prior manual verification, same as before this session.
- **2026-09-07 (Phase 12) — `vitest.config.mts` caps `maxWorkers` at 4 rather than leaving it unbounded.** Discovered while adding the first DB-touching tests: with one worker per test file (25 files), the full suite intermittently timed out against the pooled Supabase Postgres this repo's `DATABASE_URL` points at — too many simultaneous connection pools opened against a shared pgbouncer at once. Capping worker count (rather than, say, provisioning a dedicated test database) was the smallest fix that made three consecutive full-suite runs pass cleanly.

_(Running list of important architectural/product decisions made mid-build, in case they diverge from or extend the original docs.)_

- **2026-09-06 (Phase 11) — The agency-wide financial rollup is Owner/Admin only, narrower than `canViewProjects`.** Confirmed with the user directly, after this session's research surfaced that `canViewProjects` (Owner/Admin/Manager) already lets a Manager browse every project company-wide and see that project's own margin, not just ones they lead. Totalling those same numbers into one company-wide view was judged more sensitive than any single project's figures, so a new `canViewFinancials` follows `canManageCompanySettings`'s Owner/Admin-only group instead — the same reasoning already used once for Phase 9's alert thresholds.
- **2026-09-06 (Phase 11) — A financial rollup sums whatever a project actually recorded rather than requiring every project to be fully filled in.** A project's value and cost are set independently (Phase 4 never required both), so a rollup requiring both from every project would go blank the moment any one project was missing either number — useless for a real, in-progress agency. `financialRollup` sums only the recorded sides and computes margin only once at least one project recorded each side, the aggregate reading of `margin()`'s existing "a missing side is not zero" rule. `Completed`/`Cancelled` projects are still counted — their revenue and cost already happened.
- **2026-09-06 (Phase 10) — Employees can update the status of their own assigned tasks from My Work.** Confirmed with the user directly, over the read-only alternative. This needed a new `canUpdateTaskStatus` permission rather than reusing `canManageTask` (which stays delivery-role-only, unchanged, for the full task edit/create/delete surface) — the same "usual rule OR the person it's about" shape `canDecideOnRequest` already draws for requests over their approver rule. Only `PATCH /api/tasks/[id]/status` changed; nothing about who may create, edit or delete a task, or reach `/tasks` itself, changed.
- **2026-09-06 (Phase 10) — My Work's task and project names are plain text, not links.** Confirmed with the user directly. `/tasks/[id]` and `/projects/[id]` are gated to delivery roles (`isDeliveryRole`), so a link to either would redirect an Employee straight back out; PRD.md section 6.9 asks for "today's tasks, upcoming deadlines, current projects, workload," not for employee-facing detail pages, so none were built. This is also why `components/my-space/my-tasks.tsx`/`my-projects.tsx` are new components rather than reuses of `components/tasks/task-views.tsx`'s `TaskList`/`TaskBoard`, which both link into those gated pages.
- **2026-09-06 (Phase 9) — A project is "stalled" when no task has changed status in a company-configurable number of days, not when it's simply past its due date.** Confirmed with the user directly: `Project.dueDate` is optional and a due-date-based rule would say nothing about an undated project that's genuinely gone quiet, whereas `Task.updatedAt` already exists and needs no new tracking field. A project with zero tasks yet is excluded from the rule entirely — it's "not started," a different problem this rule doesn't try to catch.
- **2026-09-06 (Phase 9) — Alert thresholds are Owner/Admin only, reusing the existing `canManageCompanySettings`.** Confirmed with the user: unlike Phase 6's workload capacity (which a Manager also tunes, since it's the number they judge their own team's load against), what counts as an exception company-wide is a policy decision, not something a Manager should be adjusting for their own convenience.
- **2026-09-06 (Phase 9) — `Alert` is a live snapshot, wiped and reinserted on every regenerate, not a history like `PerformanceRecord`.** Architecture.md calls it a "system-generated exception," and PRD.md section 6.8's "red/yellow/green alerts" panel is plainly about what needs attention *right now*. A resolved/unresolved state machine would have added a dimension nothing asks for; deleting all of a company's alerts and reinserting the currently-triggered ones in one transaction is simpler and always correct.
- **2026-09-06 (Phase 9) — Alerts are regenerated when the dashboard is read, not by any single write.** Every other Phase 6/8 recompute hangs off a specific write (a task saved, a goal decided) because the number changes because of that write. An alert's condition can *also* become true purely because time passed — a task crossing its due date, a request sitting a day longer — with no write involved at all. Since there is no natural write to hook, `GET /api/dashboard` recomputes synchronously before reading, with the `CRON_SECRET`-guarded sweep job as a backstop for a company nobody visits for a while.
- **2026-09-06 (Phase 8) — Goals and feedback are manager-owned; the employee only ever reads them.** Confirmed with the user directly. Both reuse `canEditEmployee`'s existing scope (Owner/Admin/HR any employee, a Manager only their own direct reports) rather than a new permission function — the same people who administer an employee's record are the people who set their goals and give their feedback.
- **2026-09-06 (Phase 8) — Manager feedback is visible to the employee the instant it's given; there is no draft/private state.** Confirmed with the user. Simpler than a real performance-review workflow, and nothing in PRD.md section 6.5 or Phases.md's Phase 8 bullet list asks for one.
- **2026-09-06 (Phase 8) — `PerformanceRecord` is a real history table, not a single cached value like `workloadPercent`.** Architecture.md's own ERD draws `Employee 1---* PerformanceRecord`, and PRD.md section 6.5 explicitly asks for a "performance history timeline per employee" — a single overwritten number could never answer that. Every recompute that finds enough data to produce a score appends a new row; when there isn't enough data yet, no row is written at all (simpler than a nullable `score` sentinel column, and "no records yet" already reads correctly as "not enough data").
- **2026-09-06 (Phase 8) — The score formula only averages the components that have data, renormalizing the remaining weights.** PRD.md section 6.5 names five inputs (task completion, on-time delivery, workload, feedback, goals) but no formula — a judgment call, like Phase 6's estimate/urgency defaults. Without renormalization, a brand-new hire with no feedback or goals yet would have "no feedback" silently count as a 0 rather than being excluded, unfairly tanking their score. Weights (30/25/15/15/15) and bands (≥70/≥40 thresholds) live in `lib/performance.ts`, the one place to retune them.
- **2026-09-06 (Phase 8) — "Workload carried" contributes to the score capped at 100, never rewarding overload.** The direction of this input was genuinely ambiguous (does carrying *more* work mean performing *better*?). Capping at full capacity means carrying up to 100% counts as full contribution, but going over gets no bonus — Design.md's Workload Indicator Scale already flags overload as a risk elsewhere (the workload bar itself), so this score should not create an incentive to chase it.
- **2026-09-06 (Phase 7) — Notifications are both in-app and best-effort email, but email only fires on a decision, not on submission.** Confirmed with the user: build both channels. An approver already gets an in-app bell notification on submission and checks the queue directly, so paging their inbox too was judged noise; the employee waiting on a decision is the one who benefits most from an email nudge, mirroring how invite emails already work (log-and-continue when `RESEND_API_KEY` is unset).
- **2026-09-06 (Phase 7) — A request carries one `decisionNote`, not a comment thread.** Confirmed with the user: Phases.md asks for "approve/reject/comment," and a single note set at decision time satisfies that without inventing a new Comment-on-Request model when `Comment` already exists for Tasks and isn't asked for here.
- **2026-09-06 (Phase 7) — `Attachment` was widened rather than adding a separate `RequestAttachment` model.** Same two-nullable-FK shape already used for `Employee.managerId`/`managerAccountId`: `taskId` became optional and `requestId`/`addedByEmployeeId` were added alongside the existing columns. Reuses `app/api/tasks/[id]/attachments/route.ts`'s exact shape for `app/api/requests/[id]/attachments/route.ts` instead of duplicating the attachment model and its validation.
- **2026-09-06 (Phase 7) — A Manager's `/requests` queue is scoped to their own direct reports; Owner/Admin/HR see the whole company.** Confirmed with the user. Mirrors `isDirectReport`/`canEditEmployee`'s existing shape exactly (`canDecideOnRequest`), and is enforced twice: once in the queue's own query (`loadRequestsForApprover`) and again as a `notFound()` guard on the detail page, since a Manager could otherwise navigate directly to another manager's report's request by URL even though the queue listing itself would never show it.
- **2026-09-06 (Phase 7) — `lib/notifications.ts` had to be split into a pure module and `lib/notification-data.ts`.** The first draft mixed `resolveApproversFor` (pure) with `db.notification.create` (DB-touching) in one file; importing the pure function for a unit test also imported `lib/db.ts` at module load, which throws `DATABASE_URL is not set` outside a running server. Splitting them the way `lib/tasks.ts`/`lib/task-data.ts` already does fixed it and is now the pattern to follow for any future pure-logic-plus-DB-write feature.
- **2026-09-06 (Phase 6) — Weekly capacity is one flat, company-wide number, editable by Owner/Admin/Manager.** Confirmed with the user directly: PRD.md section 6.4 does not say whether capacity should vary by employment type, and the simplest v1 reading is one number rather than a Full-Time/Part-Time/Intern/Contract table nobody asked for. `Company.weeklyCapacityHours`, defaulting to 40.
- **2026-09-06 (Phase 6) — The periodic recompute runs behind an HTTP endpoint, not BullMQ/Redis.** Architecture.md section 2 names BullMQ+Redis for this. Confirmed with the user: no queue infra exists (Phase 0 only stood up Postgres) and no host is chosen (see Open Questions/Blockers), so `jobs/recalculateWorkload.ts` (the file Architecture.md's own folder listing names) is called by `POST /api/jobs/recalculate-workload`, guarded by `CRON_SECRET`, for an external scheduler to hit once one exists. Every task write that can change a workload number also recomputes it synchronously, so in practice the sweep is a safety net rather than the only path to a fresh number.
- **2026-09-06 (Phase 6) — An un-estimated task assumes 4 hours rather than 0.** Reading a missing estimate as free capacity would make skipping the estimate indistinguishable from having none of that work, which is backwards. `DEFAULT_ESTIMATE_HOURS` in `lib/workload.ts` — the single place to change if 4 turns out to be wrong once real task data exists.
- **2026-09-06 (Phase 6) — Deadline urgency weights (1.5 overdue / 1.2 due ≤7d / 1.0 due ≤30d / 0.7 later or undated) are a judgment call.** PRD.md section 6.4 says the calculation should be "based on active tasks, estimated effort, and deadlines" but gives no formula. This is what lets a task due tomorrow count for more than the same task due next quarter, at the same estimated effort. Flagged here per Rules.md section 7 rather than left undocumented.
- **2026-09-06 (Phase 6) — `canManageWorkloadSettings` is a new, wider permission than the existing `canManageCompanySettings`.** The latter (Owner/Admin only) already existed, unused, from an earlier phase, but the user asked for capacity to be editable by Owner/Admin/**Manager** — it is the number a Manager uses to judge their own team's load, not a company-identity setting like name or currency, so it follows `canViewProjects`/`canViewTasks`'s role group instead.
- **2026-09-05 (Phase 3) — A manager may be a CompanyAccount or an Employee, modelled as two nullable foreign keys.** Architecture.md section 4 allows both. A polymorphic `managerType` + `managerId` pair would have thrown away referential integrity, so `Employee` now carries `managerId` (to `Employee`) and `managerAccountId` (to `CompanyAccount`), and the form's single picker encodes which one it means. `managerFields()` guarantees only one is ever set, and a unit test asserts it. **This resolves the Phase 2 note that deferred the polymorphic case.**
- **2026-09-05 (Phase 3) — Status colours are darkened for use as text.** Design.md section 3 specifies the status hues for fills, and section 10 requires AA (4.5:1) for all text. Measured on our four surfaces the fill hues reach only success 3.01:1, warning 3.13:1 and danger 3.82:1, so a status badge using them as label text would break section 10. New `--success-text` / `--warning-text` / `--danger-text` tokens are the same hues darkened to the first value that passes (4.53–4.70:1); `info` already passed and is unchanged. The original fill tokens are untouched and still used for the dot, the bars and the charts. **This closes the "status colours fail AA as text" open question raised in Phase 1.**
- **2026-09-05 (Phase 3) — PATCH means PATCH: an absent field is left alone.** The first implementation rebuilt every column on every update, so a request naming three fields silently wiped the other twelve. The edit form always submits everything, so nothing looked wrong — the end-to-end test caught it. Now only keys actually present in the request are written, and an explicit empty string is what clears a value.
- **2026-09-05 (Phase 3) — Departments are created by typing a name, not managed on their own screen.** `Department` is a real tenant-scoped model with a unique name per company, but the only way to make one is to type it on an employee's form, where the route finds or creates it. Phases.md asks for department as a profile field and a filter, not for department administration, and a separate CRUD screen would be scope not asked for. The trade-off is recorded under Known Issues.
- **2026-09-05 (Phase 3) — Employees are suspended, never deleted.** Rules.md section 6 forbids deleting records that other data references, and Phases.md Phase 3 asks only for add/view/edit/list. Suspension revokes the login and keeps the history that tasks, requests and performance records will hang off from Phase 5 onward. Reactivating someone who never accepted their invite returns them to `Invited`, not `Active` — they have no password to restore.
- **2026-09-05 (Phase 3) — Managers can browse everyone but edit only their own reports; personal details follow the same line.** PRD.md section 9 gives a Manager "own team", and Rules.md section 3 forbids exposing an employee's sensitive data to a role that should not see it. So every company account can see the directory and professional information, while home address, date of birth, personal email, phone and emergency contact are limited to Owner/Admin/HR and the person's own manager. Because the profile is a server component, a role without the right never receives those values at all — they are not hidden in the markup, they are absent from it.
- **2026-09-05 (Phase 3) — Company account invites reuse the employee invite mechanism exactly.** `CompanyAccount.passwordHash` is now nullable, with the same hashed one-time token, 7-day expiry and clear-on-use. `/invite/[token]` looks the token up in each table in turn and renders the matching form; the two forms still post to two separate endpoints that each touch a single table, so the Architecture.md section 8 invariant is intact and is re-tested in both directions. **Owner is deliberately not an invitable role** — that identity is established once, by registration.
- **2026-09-05 (Phase 3) — New `app/api/company-accounts/` route folder.** Architecture.md section 5 puts registration, login and reset under `api/auth/company/`, but listing and inviting colleagues is a resource collection, not an auth ceremony. It follows the same convention as `api/employees/`. Invite *acceptance* does live at `api/auth/company/accept-invite/`, mirroring the employee route exactly as section 5 lays out.
- **2026-09-05 (Phase 3) — Shared form primitives moved to `components/forms/fields.tsx`.** They were in `components/auth/form-field.tsx`, which meant the employee forms would have imported their inputs from the auth folder. Same components, plus `SelectField` and `TextareaField`; five imports updated.
- **2026-09-05 (Phase 3) — Native `<select>` rather than the Radix one.** shadcn's Select needs a controlled wrapper to work with React Hook Form. A native select registers directly, is keyboard-accessible for free, and is styled to match the Input, which keeps the forms simple. Radix remains available where a richer control genuinely earns it.
- **2026-09-05 (Phase 3) — The org chart is nested lists, not a drawn diagram.** Screen readers announce the nesting as the hierarchy it is, it is keyboard navigable, and it reflows on a phone without horizontal scrolling. `buildOrgTree` is pure and unit-tested, and guarantees that **every employee appears exactly once** — even one caught in a reporting loop, or pointing at a manager who no longer exists. Writes are also guarded: `wouldCreateCycle` rejects a loop before it can be saved.
- **2026-09-05 (Phase 2) — Two NextAuth providers rather than two hand-written sign-in endpoints.** Architecture.md section 8 requires that `/api/auth/company` never touches `Employee` and vice versa. That separation is implemented as two Credentials providers (`company-login`, `employee-login`), each querying exactly one table, with sign-in going through NextAuth's callback route. The `app/api/auth/company/` and `app/api/auth/employee/` folders from Architecture.md section 5 hold registration and invite acceptance. **The invariant is what matters and it is tested in both directions** — company credentials are rejected on the employee path and vice versa.
- **2026-09-05 (Phase 2) — `AUTH_TRUST_HOST` is required outside Vercel.** Auth.js v5 refuses to run behind an untrusted Host header, which surfaced as a generic 500 on every sign-in. Set as an environment variable (documented in `.env.example`) rather than hardcoded, so each deployment opts in explicitly. **When deploying, this must be set or all sign-in breaks** — pin the host at your proxy too.
- **2026-09-05 (Phase 2) — `middleware.ts` renamed to `proxy.ts`.** Next.js 16 deprecates the middleware file convention and warns on build. Same code, new filename.
- **2026-09-05 (Phase 2) — Tenant helper extracted to `lib/tenant.ts`.** It started inside `lib/auth.ts`, which meant importing NextAuth and Prisma just to test it. As the single most security-critical function in the codebase it needs direct unit tests, so it now lives in its own dependency-free module. The tests include the case that matters most: a caller-supplied `companyId` cannot override the session's.
- **2026-09-05 (Phase 2) — Company login asks for a company ID only when it has to.** Architecture.md section 4 makes work email unique *per company*, so one address can exist in several tenants. The form asks for email and password, and only reveals the company field when the server reports the address matched more than one — which is what PRD.md section 8's "optional Company ID/slug" describes.
- **2026-09-05 (Phase 2) — Invite tokens are stored hashed, not in plaintext.** 32 bytes of randomness, SHA-256 hashed in the database, 7-day expiry, cleared on use. A database leak therefore yields no usable invite links. SHA-256 rather than bcrypt is correct here because the token is already high-entropy and needs no key-stretching.
- **2026-09-05 (Phase 2) — Sign-in spends equal time on unknown accounts.** Without this, a missing email returns measurably faster than a wrong password, which lets someone enumerate valid accounts by timing. Unknown accounts now perform a dummy bcrypt comparison.
- **2026-09-05 (Phase 2) — Employee `manager` is a self-relation for now.** Architecture.md section 4 allows a manager to be either a CompanyAccount or an Employee. Modelling that polymorphically in Phase 2 would have added complexity before the org chart exists, so `managerId` currently points at another Employee. Revisit when Phase 3 builds the reporting structure.
- **2026-09-05 (Phase 2) — `department` and `jobRole` are plain strings for now.** Architecture.md lists `Department` as its own entity, introduced in Phase 3. They are nullable columns on `Employee` until then, and will be normalised when the Department model lands.
- **2026-09-05 (Phase 1) — Secondary text colour changed to meet WCAG AA.** Design.md contains an internal contradiction: section 10 mandates AA (4.5:1) and explicitly names "`text-secondary` on `background`" as a pair to verify, but the specified `#8A7A66` on `#FFFBF2` measures only **4.02:1** — a fail for normal text. Rather than invent a colour, `--muted-foreground` now points at Design.md's own `brand-brown-soft` (`#7A6653`), whose documented role in section 3 is "secondary text, icons, muted labels" and which measures **5.28:1**. All secondary text on the site now passes AA. **If you prefer the exact original hex, say so and I will revert it — but the site will then fail its own accessibility rule.**
- **2026-09-05 (Phase 1) — New `components/marketing/` folder.** Architecture.md section 5 lists feature folders under `components/` (`dashboard/`, `employees/`, `tasks/`, `requests/`) but none for the public site. Marketing components follow that same per-feature convention in a new `marketing/` folder.
- **2026-09-05 (Phase 1) — Added `/contact`, `/terms`, `/privacy` routes.** Not in Architecture.md section 5, but PRD.md section 6.0 requires the footer to link to contact and terms/privacy, and shipping dead links is worse. They are honest placeholders that say the copy is not written yet. **The legal pages must be drafted or reviewed by a qualified professional before launch — I have not written legal text.**
- **2026-09-05 (Phase 1) — Testimonials left genuinely empty.** PRD.md section 6.0 asks for a social-proof placeholder. It renders as an honest "customer stories are on the way" empty state. I did not invent quotes, names, or company logos, because publishing fabricated testimonials would misrepresent real customers.
- **2026-09-05 (Phase 1) — Pricing amounts are labelled indicative.** PRD.md section 6.0 calls pricing a placeholder, so the plan *structure* is real (three tiers, INR per PRD section 11) but the page states plainly that prices are indicative and nothing is charged. Confirm real pricing before launch.
- **2026-09-05 (Phase 1) — Product mock uses non-heading elements.** The hero's dashboard mock originally used `h3`/`h4`, which broke the page heading order (`h1` straight to `h3`). It is an illustration of the product rather than a section of the document, so its labels are now styled paragraphs. Heading order is now clean.
- **2026-09-05 — Prisma 7 requires a driver adapter.** Prisma 7 no longer ships a bundled query engine binding by default; `new PrismaClient({ log })` fails typecheck without an `adapter`. Added `@prisma/adapter-pg` and construct `PrismaPg` from `DATABASE_URL` in `lib/db.ts`. This is a stack detail Architecture.md predates, not a deviation from it.
- **2026-09-05 — Pinned Prisma CLI to `^7`.** Installing `prisma` unpinned resolved to `8.0.0-rc.13` (a release candidate) against `@prisma/client` 7.10.0, causing a peer conflict. CLI and client are now both on 7.x.
- **2026-09-05 — Explicit radius scale instead of shadcn's calc-based one.** shadcn defines `--radius-xl` as `calc(var(--radius) * 1.4)`, which cannot produce Design.md's "rounded-xl ≈ 12px" from a sensible base. Declared the scale literally (6/8/10/12/16/20px) in `@theme`, so `rounded-xl` is exactly 12px. Verified in the compiled CSS.
- **2026-09-05 — shadcn button variants restyled to Design.md section 6.** shadcn ships a *tinted* destructive button (`bg-destructive/10`); Design.md specifies **filled** danger. Also pointed `outline` at `brand-brown-light`/`brand-brown` (Design.md's "Secondary"), `ghost` at `text-secondary`, and primary hover at the real `brand-yellow-hover` token instead of an opacity shortcut.
- **2026-09-05 — Dropped shadcn's `.dark` theme block.** Design.md section 2 is light-theme-only for v1. Leaving a neutral-grey dark palette in place would have been dead, off-brand code. Tokens remain CSS variables, so dark mode can be added later by redefining them.
- **2026-09-05 — Added `docker-compose.yml` for local PostgreSQL.** Not named in Architecture.md's folder structure, but the app needs a real database to develop against and Architecture.md section 2 already lists Docker as a deployment option. Keeps local setup to one command and avoids per-developer Postgres installs.
- **2026-09-05 — Phase 0 placeholder page lives at `app/(marketing)/page.tsx`, not `app/page.tsx`.** Both resolve to `/`, so keeping the scaffold's root page would have collided with the Phase 1 marketing page. Placing it in the route group now means Phase 1 just replaces the file.
- **2026-09-05 — Windows rolldown binding in `optionalDependencies`.** Vitest 5 failed to start because npm's optional-dependency bug skipped `@rolldown/binding-win32-x64-msvc`. Installing it as a normal devDependency would break `npm ci` on Linux CI (platform mismatch), so it sits in `optionalDependencies` where non-Windows installs skip it cleanly.
- **2026-09-05 — Removed Prisma-injected agent skill folders.** `prisma init` wrote `.agents/`, `.windsurf/`, `.claude/` and `skills-lock.json` into the project. These are editor tooling, not application code, and are absent from Architecture.md section 5.

## Open Questions / Blockers

- **Phase 0, hosting deployment — needs the user. Database half resolved: Supabase Postgres.** Phases.md asks for a "hello world" deploy to confirm the hosting pipeline. The production build pipeline is verified locally (`npm run build` then `npm start`, serving `/` at HTTP 200), but nothing has been deployed to a host. Deploying requires a Vercel (or other) account and is an outward-facing action, so it was not done unprompted. **2026-09-06:** the user set `DATABASE_URL` in `.env` to a Supabase pooler connection and asked for the app to run against it; all 5 migrations were deployed there with `prisma migrate deploy` and the app was smoke-tested against it (register, login, dashboard, settings all working). Local dev now points at Supabase rather than the `docker-compose.yml` Postgres — that file is unused for now but left in place. **Still to unblock:** confirm the hosting provider for the app itself (Vercel or other) and connect the account.
- **Currency — resolved.** `Company.currency` defaults to `"INR"` per PRD.md section 11, configurable per company. No UI to change it yet.
- **Email provider needed.** Neither invite kind — employee, or company account — can actually be emailed until `RESEND_API_KEY` and a verified `EMAIL_FROM` domain exist. Until then the one-time link is shown to the inviting admin to share manually, with a copy button. Password reset also depends on this.
- **Should Managers be able to add employees?** Currently Owner, Admin and HR can; a Manager cannot add or suspend anyone, though they can edit their own direct reports. PRD.md section 9 gives Managers their own team's work but does not say they may add people, so the narrower reading is what is built and tested. One line in `canManageEmployees` changes it if you disagree.
- **Should HR see the company accounts screen?** Right now only Owner and Admin can list or invite Admin/Manager/HR logins, on the reading that HR manages *employee* records rather than who administers the tenant (Architecture.md section 4 says those accounts are "invited by an Owner/Admin"). If HR should be able to onboard managers too, `canManageCompanyAccounts` is the single place to change.
- **Status colours as text — resolved in Phase 3.** Separate `--success-text` / `--warning-text` / `--danger-text` tokens now carry the same hues darkened until they pass AA on all four surfaces; the original fill tokens are unchanged and still used for dots, bars and charts. Verified on the rendered pixels in Chrome (the Invited badge measures 4.53:1). **Say the word if you would rather keep the exact original hues on badges — but they measure 3.0–3.8:1 as text and would fail Design.md section 10.**
- **Pricing needs confirmation.** The three tiers and their INR amounts on `/pricing` are placeholders I chose to give the section a real structure. Replace them with actual commercial pricing before launch.
- **Contact details needed.** `/contact` has no email address or form, because I did not want to publish an address you have not chosen. Tell me the support address (or whether you want a form) and I will fill it in.
- **`CRON_SECRET` now has a scheduler, for one job only (Phase 13).** `.github/workflows/scheduled-jobs.yml` calls `POST /api/jobs/notify-deadlines` daily at 03:30 UTC (09:00 IST) and needs two repository secrets, `APP_URL` and `CRON_SECRET`. **It cannot work until the app is deployed somewhere** — the same open hosting decision above. The four older job endpoints (`recalculate-workload`, `recalculate-performance`, `generate-alerts`, `cleanup-chat-messages`) are still called by nothing; add them to that workflow once their cadences are decided.
- **WhatsApp needs Meta setup before a single message can send (Phase 13).** `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are unset, so `lib/whatsapp.ts` logs instead of sending. Prerequisites, all outside this repo: a Meta Business app with the WhatsApp product, completed **Business Verification** (before it, only a handful of hand-added test numbers can be reached), a **permanent System User token** (the one the dashboard shows first expires in 24 hours), and an **approved Utility message template** with two body variables, named to match `WHATSAPP_TEMPLATE_NAME`. Every message is business-initiated and therefore **billable per conversation** — there is no free path for notifications.
- **Web Push needs a VAPID keypair (Phase 13).** `npx web-push generate-vapid-keys`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. They are a matched pair: replacing either kills every existing subscription and every browser must opt in again. Push is skipped entirely while they are unset. Note iOS only delivers Web Push to a site the user has added to their home screen.
- **WhatsApp is on by default, which the user chose knowingly (Phase 13).** Anyone with a phone number on file will start receiving WhatsApp the moment credentials are configured, without having opted in inside the product. The concern was raised before building and the user confirmed the default-on reading; an opt-out lives on `/notifications` and every email names it. Worth revisiting if Meta quality ratings drop, since those fall on user blocks.
