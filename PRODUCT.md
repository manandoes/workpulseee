# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Four confirmed audiences, all inside one tenant company (PRD.md § 4, § 9):

- **Owners / Founders** — company-wide health, full access, sole holders of branding and email-delivery settings.
- **Managers / Team Leads** — assign work, watch workload, approve requests for their own team only.
- **HR / Ops Admins** — employee records, leave, reimbursements, payroll, bulk email.
- **Employees** — a separate account type in a separate table, with a self-service space (`/my-space`) and no company-wide views.

Target company profile: startups, digital/creative/marketing agencies and growing teams, typically 5–200 people, currently juggling three or more disconnected tools for people and work management. Currency defaults to INR.

A fifth audience arrives with the hiring module and is unlike the four above: **job applicants**, who are not users of the product at all. They meet WorkPulse once, unauthenticated, on a link a company sent them, often on a phone, and never return. They have no account, no onboarding and no second chance at the form.

## Product Purpose

WorkPulse is an all-in-one operating dashboard for agencies: one place to answer "what is everyone working on", "who is overloaded", and "which projects are falling behind" without stitching together spreadsheets, a project tool, and WhatsApp threads. Success is measured as centralized people-and-work data, fewer employees above 90% workload, faster manager visibility of problems, and shorter approval turnarounds (PRD.md § 5).

## Positioning

Workload intelligence is the mechanism a neighboring tool cannot truthfully copy: WorkPulse computes a live per-person workload percentage from active tasks, estimated effort and deadlines against a company-configured weekly capacity, and drives early-warning alerts from it. Rival HRMS products hold records; rival PM tools hold tasks. Holding both in one tenant is what makes the workload number computable at all.

## Operating Context

- Multi-tenant: one instance serves many companies, and every company-scoped query passes through `scopedWhere` in `lib/tenant.ts`. Tenant isolation is the single most security-critical invariant in the codebase (Rules.md § 2).
- Two separate sign-in paths and two account types, `company` and `employee`, which never overlap.
- Companies are addressed publicly by a globally unique `Company.slug`, already used on the employee login form and in invite links.
- A company account's sidebar is split by a personal `hrms` / `pms` mode cookie; people-administration modules (Employees, Performance, Requests, Payroll, Email) live in the HRMS slice.
- Owners set a company-wide `brandColor`, which re-tints the dashboard accent at runtime through a CSS variable.
- Transactional email is per-company and optional: a company's own Resend/Brevo key when configured, global env vars otherwise. Google Calendar is connected per-company/per-user with an encrypted refresh token and degrades gracefully when absent.
- Uploaded documents are stored as bytes in Postgres (`StoredFile`), capped at 5 MB, restricted to a MIME allowlist that deliberately excludes HTML and SVG.

## Capabilities and Constraints

Shipped: dashboard, employees and org chart, projects and clients, tasks with timers, workload, performance, requests and approvals, attendance, announcements and polls, chat, calendar and meetings, notifications and push, payroll and salary slips, bulk email, email templates, file storage, permission grants.

Confirmed for the hiring module (decided with the user, 2026-09-18):

- Hiring forms are built by the company and answered by the public. Question types cover short answer, long answer, single-choice, multiple-choice, dropdown, email, phone, number, date, and document upload.
- A published form has two possible destinations, chosen per form: **hosted** on `workpulse.tech/{company-slug}/recruitmentform`, or **Google Forms**, created through the Google Forms API on the company's connected Google account with responses synced back into WorkPulse.
- Applicants move through a pipeline: New → Shortlisted → Interview → Offer → Hired / Rejected, with internal notes and a per-applicant detail view.
- The public form takes no login. Abuse is handled by a per-IP submission rate limit, a honeypot field and server-side validation; applicant documents reuse `StoredFile` with its existing 5 MB cap and MIME allowlist. All three were exercised against the running endpoint rather than asserted: a valid multipart submission stores the application and its file, an invalid one is refused with field errors and writes nothing, a filled honeypot answers as though it succeeded while writing nothing, and the hourly cap fired against repeated submissions from one address during development.
- Access is a new grantable permission (`ManageRecruitment`) held by Owner and Admin by default and delegable to an HR lead through the existing `PermissionGrant` mechanism.

Constraints that bind this and every module:

- Permission predicates in `lib/permissions.ts` are the server-side source of truth; navigation built from them is convenience, never a boundary. Every API route re-checks (Rules.md § 3).
- No new heavyweight dependencies for a handful of HTTPS calls — providers are reached with plain `fetch` (Rules.md § 1, as `lib/mailer.ts`, `lib/whatsapp.ts` and `lib/google-calendar.ts` already do).
- Validation is Zod at the trust boundary; errors come back in one `{ error, code, fieldErrors }` shape.
- Performance scoring is directional, not a certified HR compliance instrument.

## Brand Commitments

- Product name **WorkPulse** (repo and package still carry the earlier working title "Talking Lens Media"; the UI says WorkPulse).
- A company's own `brandColor` is theirs, not a WorkPulse decision, and any surface a company shows to outsiders should carry it.
- Voice is plain and operational: controls name their action, errors name the problem and the recovery.
- Brand color never signals status. Status uses a separate palette, always paired with a text label.

## Evidence on Hand

- `PRD.md`, `Architecture.md`, `Rules.md`, `Phases.md`, `Design.md`, `Memory.md` — real, maintained project documents.
- A shipped, coherent visual system in `app/globals.css` and `components/`, documented in `DESIGN.md`.
- No real customers, testimonials, benchmarks, pricing commitments or case studies exist. Marketing testimonials are explicitly placeholders (PRD.md § 6.0) and must not be invented as real.
- No real job openings or applicant data exist; any shown in development is synthetic and must be labeled as such.

## Product Principles

1. **Tenant isolation is never traded for convenience.** Every read is scoped; an id alone is never trusted to authorize anything.
2. **The permission predicate is the boundary.** UI that hides an action is a courtesy; the route that refuses it is the rule.
3. **Degrade gracefully around optional integrations.** A company that never connected Google, or never set an email key, still gets a working product.
4. **The manager's question comes first.** Data-dense screens are for scanning and acting, not for admiring.
5. **A surface shown to outsiders represents the company, not WorkPulse.** Public-facing pages carry the company's identity and are held to a first-impression standard the internal tool does not need.

## Accessibility & Inclusion

AA contrast (4.5:1) is the established floor, already verified per-palette in `DESIGN.md` § 10, including the darkened `*-text` status tokens that exist because the fill hues miss it. Status is never conveyed by color alone. All interactive elements are keyboard-navigable with a visible focus ring. The public applicant form raises the stakes on all of this: it is answered by strangers on unknown devices, with no support path and no second attempt.
