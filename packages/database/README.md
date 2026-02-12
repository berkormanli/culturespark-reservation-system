# @culturespark/database

PostgreSQL + Prisma schema package for the CultureSpark MVP.

## Commands

- `pnpm --filter @culturespark/database db:generate`
- `pnpm --filter @culturespark/database db:migrate:dev`
- `pnpm --filter @culturespark/database db:migrate:deploy`
- `pnpm --filter @culturespark/database db:seed`

## Notes

- `prisma/schema.prisma` is the source of truth for Prisma models.
- `prisma/migrations/20260212191000_init_mvp_schema/migration.sql` includes raw SQL for Postgres-specific rules.
- Staff overlap protection is enforced with a Postgres exclusion constraint on confirmed appointments.
