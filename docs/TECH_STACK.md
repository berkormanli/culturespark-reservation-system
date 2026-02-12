# Tech Stack (Recommended)

This stack is optimized for fast iteration with Codex: strong typing, code generation, predictable project structure, and minimal "clever" abstractions.

## Decisions

- Language: TypeScript (shared across frontend and backend)
- Monorepo: `pnpm` workspaces + Turborepo
- Customer frontend: Next.js (React)
- Staff frontend: Next.js (React)
- Backend API: Node.js + Fastify (TypeScript)
- DB: PostgreSQL
- ORM/migrations: Prisma (plus SQL migrations for Postgres-only constraints)
- Contracts: OpenAPI for request/response contracts + generated TS types

## Why this works well with Codex

- Clear boundaries: `apps/*` for deployables, `packages/*` for shared code.
- Fewer "magic" runtime behaviors; most behavior is explicit in types and contracts.
- OpenAPI + generated types keeps backend + both frontends consistent.
- Postgres gives the strongest guarantees for concurrency (no double-booking).

## Monorepo tooling choice

- `pnpm` workspaces: built-in monorepo support (`pnpm-workspace.yaml`), fast installs, strictness with `workspace:` protocol.
- Turborepo: simple task pipeline and caching for `build/lint/test` across apps/packages.
- Nx is also a strong option (more batteries included), but Turborepo is simpler to adopt for a new repo.

## Recommended repo layout

```
apps/
  api/               # Fastify API
  customer-web/      # Next.js customer booking UI
  staff-web/         # Next.js staff/admin UI
packages/
  api-contracts/     # OpenAPI spec (+ helpers)
  api-client/        # generated TS client/types
  shared/            # enums, zod schemas, date utilities
  database/          # Prisma schema + SQL migrations
  ui/                # shared UI components (optional)
infra/
  docker/            # local postgres, etc.
docs/
  ...
```

## Backend notes (important)

- Double-booking prevention should be enforced at the DB layer.
  - Preferred: Postgres exclusion constraint to prevent overlapping appointments per staff.
  - Prisma does not model exclusion constraints directly; apply via SQL migration (`packages/database/prisma/migrations/20260212191000_init_mvp_schema/migration.sql`).
- Public booking create must support `Idempotency-Key` (see `docs/api/CONTRACTS.md`).

## Frontend notes

- Data fetching: TanStack Query (or SWR) + a shared `api-client` package.
- Validation: zod on the client for forms; server remains authoritative.
- Dates/timezone: always display as `Europe/Istanbul`; send RFC3339 timestamps.

## Testing

- Unit/integration: Vitest
- API tests: Vitest + supertest (or undici)
- E2E: Playwright (customer booking flow + staff disable-service wizard)

## Local dev

- PostgreSQL via Docker Compose.
- `pnpm` for all scripts.

