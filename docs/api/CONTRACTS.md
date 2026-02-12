# API Contracts (MVP)

This document is the human-readable companion to the source contract in `packages/api-contracts/openapi.yaml`.

## 1) Conventions

- Base path: `/api/v1`
- JSON request/response
- Timestamps:
  - Store in UTC server-side
  - Accept and return RFC3339 timestamps
  - Branch timezone is `Europe/Istanbul` for scheduling semantics
- Pagination:
  - List endpoints use `page` / `size`
- Standard error envelope:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": { "any": "json" }
  }
}
```

## 2) Idempotency

`POST /public/appointments` requires `Idempotency-Key`.

Behavior:
- Same key + same semantic request => return same appointment (no duplicate)
- Same key + different semantic request => `409 IDEMPOTENCY_KEY_REUSE`

## 3) Appointment lifecycle

Statuses:
- `CONFIRMED`: active reservation, blocks staff time
- `CANCELLED`: does not block staff time

Only `CONFIRMED` appointments are considered in availability conflict checks.
DB enforcement details live in `docs/api/DATABASE_SCHEMA.md` (including the Postgres exclusion constraint used for overlap protection).

## 4) Public endpoints

- `GET /public/branches`
- `GET /public/branches/{branchId}/services?date=YYYY-MM-DD`
- `GET /public/branches/{branchId}/staff?serviceIds[]`
- `GET /public/availability`
  - Query: `branchId`, `serviceIds[]`, `date`, `preferenceType`, `requestedStaffId?`
  - `preferenceType`: `REQUIRED|PREFERRED|ANY`
  - Response includes `slotIntervalMinutes`, `totalDurationMinutes`, `slots[]`
  - For `PREFERRED`, each slot may include `preferredStaffAvailable`
- `POST /public/appointments`
  - Header: `Idempotency-Key`
  - Body: `branchId`, `serviceIds[]`, `startsAt`, `preferenceType`, `requestedStaffId?`, `allowAlternateStaff?`, `customer { name, phone }`

## 5) Admin endpoints

### Auth
- `POST /admin/auth/login`
- `GET /admin/me`

### Branch settings
- `PATCH /admin/branches/{branchId}/settings`
  - Fields: `slotIntervalMinutes`, `cancellationCutoffHours`, `cancellationOverrideAllowed`

### Appointments
- `GET /admin/appointments`
- `POST /admin/appointments`
- `PATCH /admin/appointments/{appointmentId}`
- `POST /admin/appointments/{appointmentId}/cancel`
  - Body: `reason`, `override`, `customerContacted`, `note?`
  - `reason`: `CUSTOMER_REQUEST|SERVICE_DISABLED|SERVICE_ISSUE`

### Service suspensions
- `POST /admin/branches/{branchId}/service-suspensions/preview`
  - Body: `serviceId`, `startsAt`, `endsAt`
  - Response: `impactedCount`, `impactedAppointments[]`
- `POST /admin/branches/{branchId}/service-suspensions`
  - Body: `serviceId`, `startsAt`, `endsAt`
  - Hard rule: fail with `409 IMPACTED_APPOINTMENTS_EXIST` when impacted appointments still exist

### Staff
- `GET /admin/branches/{branchId}/staff`
- `POST /admin/branches/{branchId}/staff`
- `GET /admin/branches/{branchId}/staff/{staffId}`
- `PATCH /admin/branches/{branchId}/staff/{staffId}`
- `DELETE /admin/branches/{branchId}/staff/{staffId}`
- `PUT /admin/branches/{branchId}/staff/{staffId}/skills`
- `GET /admin/branches/{branchId}/staff/{staffId}/working-hours`
- `PUT /admin/branches/{branchId}/staff/{staffId}/working-hours`
- `GET /admin/branches/{branchId}/staff/{staffId}/time-blocks`
- `POST /admin/branches/{branchId}/staff/{staffId}/time-blocks`
- `PATCH /admin/branches/{branchId}/staff/{staffId}/time-blocks/{timeBlockId}`
- `DELETE /admin/branches/{branchId}/staff/{staffId}/time-blocks/{timeBlockId}`

### Global services (Super Admin)
- `GET /admin/services`
- `POST /admin/services`
- `GET /admin/services/{serviceId}`
- `PATCH /admin/services/{serviceId}`
- `DELETE /admin/services/{serviceId}`

## 6) Cancellation policy

Cancellation payload inputs:
- `reason`
- `override`
- `customerContacted`

Rules:
- `SERVICE_DISABLED` and `SERVICE_ISSUE` cancellations are allowed anytime
- `CUSTOMER_REQUEST` is cutoff-bound by `cancellationCutoffHours`
- `override=true` is allowed for:
  - `SUPER_ADMIN`
  - `BRANCH_ADMIN` only when `cancellationOverrideAllowed=true`
- Failures:
  - `409 CANCELLATION_CUTOFF`
  - `403 OVERRIDE_NOT_ALLOWED`

## 7) Error codes

The API uses the following error code enum.

### Existing codes
- `IDEMPOTENCY_KEY_REUSE`
- `SLOT_CONFLICT`
- `INVALID_SLOT_ALIGNMENT`
- `PREFERRED_STAFF_UNAVAILABLE`
- `IMPACTED_APPOINTMENTS_EXIST`
- `CANCELLATION_CUTOFF`
- `OVERRIDE_NOT_ALLOWED`

### Added codes in this version
- `UNAUTHORIZED`
- `FORBIDDEN`
- `INVALID_CREDENTIALS`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `REQUESTED_STAFF_REQUIRED`
- `APPOINTMENT_ALREADY_CANCELLED`

For exact request/response schemas, required fields, and examples, use `packages/api-contracts/openapi.yaml` as source of truth.
