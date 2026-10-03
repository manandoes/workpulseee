# WorkPulse

An all-in-one operating dashboard for agencies that connects employees,
projects, tasks, performance, expenses, and internal operations in one place.

The product spec and build plan live alongside the code:

| Document                             | What it covers                                     |
| ------------------------------------ | -------------------------------------------------- |
| [PRD.md](./PRD.md)                   | Product requirements, modules, roles               |
| [Architecture.md](./Architecture.md) | Stack, data model, folder structure, app flow      |
| [Rules.md](./Rules.md)               | Engineering boundaries (tenancy, validation, auth) |
| [Phases.md](./Phases.md)             | Ordered build plan                                 |
| [Design.md](./Design.md)             | Visual design system                               |
| [Memory.md](./Memory.md)             | Build progress log                                 |

## Stack

Next.js (App Router) - TypeScript - Tailwind CSS v4 - shadcn/ui - Prisma -
PostgreSQL - Zod - React Hook Form - TanStack Query - Recharts

## Getting started

Requires Node.js 20+ and Docker (for the local PostgreSQL instance).

```bash
npm install
cp .env.example .env       # then fill in the values
npm run db:up              # start PostgreSQL in Docker
npm run db:migrate         # apply migrations
npm run dev                # http://localhost:3000
```

## Scripts

| Script                | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Start the dev server                          |
| `npm run build`       | Production build                              |
| `npm start`           | Serve the production build                    |
| `npm run lint`        | ESLint                                        |
| `npm run typecheck`   | TypeScript, no emit                           |
| `npm run format`      | Prettier write                                |
| `npm test`            | Vitest                                        |
| `npm run db:up`       | Start PostgreSQL via Docker Compose           |
| `npm run db:down`     | Stop PostgreSQL (data kept in a named volume) |
| `npm run db:migrate`  | Create and apply a Prisma migration           |
| `npm run db:generate` | Regenerate the Prisma client                  |
| `npm run db:studio`   | Open Prisma Studio                            |

## Project structure

Follows [Architecture.md](./Architecture.md) section 5:

```
app/
  (marketing)/   public site - no auth
  (auth)/        login (company + employee paths) and company registration
  (dashboard)/   authenticated app shell
  api/           route handlers
components/      ui/ primitives plus feature component folders
lib/             db client, auth, permissions, workload, performance, alerts
prisma/          schema and migrations
jobs/            scheduled recalculation jobs
```
