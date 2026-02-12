# Frontend Implementation Overview (Two Apps)

You will build two separate frontends:

1) Customer app (public booking)
2) Staff app (admin operations: calendar, schedules, disable service wizard)

This doc is framework-agnostic, but assumes a typical SPA/SSR web stack with shared TypeScript packages.

## 1) Recommended repository layout (monorepo)

```
apps/
  customer-web/
  staff-web/
packages/
  api-client/        # typed HTTP client + error parsing + idempotency helper
  shared/            # shared types, enums, zod schemas, date utilities
  ui/                # shared UI components (optional)
docs/
  ...
```

Principles:
- Share domain types and validation rules between frontends (and optionally backend).
- Keep auth and branch scoping logic centralized in the staff app.
- Keep booking flow logic centralized in the customer app.

## 2) Data access and caching

Use a single API client wrapper that:
- injects auth (staff app)
- normalizes error shape (`error.code`)
- supports request cancellation
- supports `Idempotency-Key` for booking create

Caching guidelines:
- Public: cache branches/services; do not cache availability for long (it changes frequently).
- Staff: cache reference data (services, staff list), but refetch calendar on mutations.

## 3) Global state vs server state

Prefer:
- "server state" library (React Query / SWR) for API data.
- local state for ephemeral UI state (modals, selected slot).

Shared state needed in customer flow:
- selected branch, services, preference, selected date, selected slot, customer input.

## 4) Dates and timezone

Rules:
- Always display in `Europe/Istanbul`.
- Slot alignment depends on `branch.slot_interval_minutes`.

Frontend responsibilities:
- When user picks a time, send a full RFC3339 timestamp (`startsAt`) in Istanbul offset.
- Reject non-aligned times client-side (but also enforce server-side).

## 5) Error handling patterns

Map error codes to UX:
- `SLOT_CONFLICT` -> "That time was just taken. Please pick another time."
- `PREFERRED_STAFF_UNAVAILABLE` -> show preferred modal again / return to time selection.
- `IMPACTED_APPOINTMENTS_EXIST` -> in wizard, show impact list and block "Apply suspension".
- `CANCELLATION_CUTOFF` -> show "Within cutoff; override required."
- `OVERRIDE_NOT_ALLOWED` -> show "Only Super Admin or allowed branches can override."

## 6) Documentation update requirement

When a screen or endpoint changes, update:
- `docs/api/CONTRACTS.md`
- `docs/frontend/customer-app.md` or `docs/frontend/staff-app.md`

See `docs/PROCESS.md` for the checklist.
