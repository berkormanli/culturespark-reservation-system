# CultureSpark Reservation System

Monorepo scaffold for the CultureSpark MVP reservation platform.

## MVP boundaries

- No online payments in MVP.
- No SMS/email notifications in MVP.
- Timezone standard is `Europe/Istanbul` across API, web apps, and shared utilities.

## Stack

- Workspace: `pnpm` + Turborepo
- API: Fastify + TypeScript (`apps/api`)
- Frontends: Next.js + TypeScript (`apps/customer-web`, `apps/staff-web`)
- Shared packages:
  - `packages/shared` (types/enums/date utilities)
  - `packages/api-contracts` (OpenAPI source)
  - `packages/api-client` (generated client placeholder)
  - `packages/database` (Prisma schema + PostgreSQL migrations)

## Repository layout

```text
apps/
  api/
  customer-web/
  staff-web/
packages/
  shared/
  api-contracts/
  api-client/
  database/
docs/
.github/workflows/ci.yml
```

## Getting started

### Prerequisites

- Node.js 22+
- pnpm 9+

### Install

```bash
pnpm install
```

### Run all apps in dev mode

```bash
pnpm dev
```

### Run a single app/package

```bash
pnpm --filter @culturespark/api dev
pnpm --filter @culturespark/customer-web dev
pnpm --filter @culturespark/staff-web dev
pnpm --filter @culturespark/database db:migrate:dev
```

### Validate workspace

```bash
pnpm lint
pnpm test
pnpm build
# or recursive build directly
pnpm -r build
```

## Environment templates

- Root defaults: `.env.example`
- API: `apps/api/.env.example`
- Customer web: `apps/customer-web/.env.example`
- Staff web: `apps/staff-web/.env.example`

Set `TZ=Europe/Istanbul` in local runtime environments.

## Documentation

- `docs/TECH_STACK.md`
- `docs/PROCESS.md`
- `docs/PRD.md`
- `docs/MVP_BACKLOG.md`
- `docs/api/CONTRACTS.md`
- `docs/api/DATABASE_SCHEMA.md`
- `docs/frontend/OVERVIEW.md`
- `docs/frontend/customer-app.md`
- `docs/frontend/staff-app.md`
