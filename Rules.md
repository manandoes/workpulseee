# Rules.md — AI Development Rules & Boundaries

These rules define how the AI should behave while building this project. Read this before writing any code.

## 1. Tech Stack Boundaries

### Use

- Next.js (App Router) for frontend + API routes
- Tailwind CSS for styling
- shadcn/ui for UI components
- Prisma as the ORM
- PostgreSQL as the database
- Zod for validation
- React Hook Form for forms
- React Query (TanStack Query) for client-side data fetching/caching
- Recharts for charts/graphs

### Avoid

- Do not introduce a second CSS framework (no Bootstrap, no Material UI) alongside Tailwind/shadcn
- Do not introduce a second ORM or raw SQL queries unless Prisma genuinely cannot express the query — if so, isolate raw SQL in a clearly-named function and comment why
- Do not add a state management library (Redux, MobX, Zustand) unless a specific cross-cutting state problem justifies it — prefer React Query + local state first
- Do not use `any` in TypeScript unless absolutely unavoidable; prefer proper types/interfaces generated from Prisma or Zod schemas
- Do not add new npm packages without checking if the existing stack already solves the problem

## 2. Multi-Tenancy Rules

- **Every** database query touching Company-scoped data MUST filter by `companyId`. No exceptions.
- Never write a query that could leak one company's data into another company's view.
- Any new table added to the schema must include a `companyId` foreign key unless it's a genuinely global table (e.g., system config).

## 3. Authentication & Authorization

- Every API route must check that a valid session exists before processing.
- Every API route that mutates data must check the user's role has permission for that action (see PRD.md § 8 for role permissions).
- Never expose another employee's sensitive data (salary, personal documents) to a role that shouldn't see it.

## 4. Error Handling

- All API routes must return consistent error shapes: `{ error: string, code?: string }` with appropriate HTTP status codes.
- Never let an unhandled exception crash a route — wrap DB calls in try/catch and return a 500 with a generic message (don't leak stack traces to the client).
- Validate all incoming request bodies with Zod before touching the database.
- Log errors server-side with enough context (companyId, userId, route) to debug, but never log sensitive data (passwords, tokens, full documents).

## 5. Code Style & Structure

- Keep components small and single-purpose; extract shared logic into `lib/`.
- Business logic (workload calculation, performance scoring, alert rules) belongs in `lib/`, not scattered inside API routes or components.
- Name files and folders consistently with the structure defined in Architecture.md — don't invent a parallel structure.
- Prefer server components by default in Next.js; use client components only when interactivity requires it.

## 6. Data Integrity

- Never silently delete records referenced elsewhere (tasks, requests, performance records) — use soft deletes (`deletedAt` timestamp) where historical accuracy matters.
- Any change to the Prisma schema must come with a migration, never a manual DB edit.

## 7. What the AI Should Do

- Ask for clarification when a requirement in PRD.md is ambiguous, rather than guessing silently and building the wrong thing.
- Build one phase at a time, per Phases.md — do not jump ahead to later phases before earlier ones are functional.
- Update Memory.md at the end of each work session with what was completed, what's in progress, and what's next.
- Write code that is readable and maintainable over code that is clever.
- Flag any place where a decision was made that deviates from Architecture.md, and why.

## 8. What the AI Should NOT Do

- Do not rewrite or refactor large parts of the codebase without being asked.
- Do not remove existing features while adding new ones unless explicitly instructed.
- Do not hardcode company-specific data, test credentials, or secrets into source files — use environment variables.
- Do not skip validation "to save time."
- Do not mark a phase as complete in Memory.md if it has not been tested/verified to work.
- Do not introduce breaking changes to the database schema without calling it out clearly.

## 9. Environment & Secrets

- All secrets (DB connection string, auth secrets, email API keys, storage keys) go in `.env` and are never committed.
- `.env.example` should always be kept up to date with the variables the app needs (without real values).
- `.env` is the only live env file (local dev). On Vercel, set these same variables in the Vercel Environment Variables UI instead.

## 10. Testing Expectations (v1)

- New API routes should have at least a basic happy-path test.
- Critical business logic (workload %, performance scoring, alert rules) should have unit tests since dashboards depend on their correctness.
