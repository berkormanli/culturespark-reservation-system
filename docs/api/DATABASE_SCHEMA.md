# Database Schema (MVP)

The Prisma/PostgreSQL schema lives in `packages/database/prisma/schema.prisma`.

## Core entities

- `customers`: global customer records, unique by `normalized_phone`.
- `branches`: branch profile + booking settings (`slot_interval_minutes`, `cancellation_cutoff_hours`, `cancellation_override_allowed`).
- `services`: global catalog of services.
- `service_suspensions`: per-branch service downtime windows.
- `staff`: branch staff records.
- `staff_services`: service skills per staff member.
- `staff_working_hours`: weekly working-hours template (day-of-week + minute-of-day range).
- `staff_time_blocks`: dated unavailability blocks (BREAK/TIME_OFF/OTHER).

## Appointment entities

- `appointments`: reservation header (`status`, `assigned_staff_id`, `preference_type`, `requested_staff_id`).
- `appointment_services`: selected services for each appointment (supports multi-service selection).
- `appointment_cancellations`: cancellation payload fields (`reason`, `override`, `customer_contacted`, `note`).

## Public booking idempotency

- `public_booking_idempotency`: stores `idempotency_key`, `request_hash`, and resulting `appointment_id`.
- Reusing a key with a different semantic request should map to `IDEMPOTENCY_KEY_REUSE` at the API layer.

## Audit logs

- `admin_audit_logs`: server-side audit trail for admin mutations (appointment cancel/reschedule and service suspension create).
- Captures actor (`admin_user_id`), action, target entity metadata, JSON `details`, and timestamp.

## Postgres-only constraint

Prisma cannot model exclusion constraints directly, so the migration adds raw SQL:

- Constraint: `appointments_no_overlapping_confirmed_for_staff`
- Rule: no overlapping `tstzrange(starts_at, ends_at, '[)')` for the same `assigned_staff_id` when `status = CONFIRMED`
- Location: `packages/database/prisma/migrations/20260212191000_init_mvp_schema/migration.sql`

This is the DB-level guardrail against concurrent double-booking.
