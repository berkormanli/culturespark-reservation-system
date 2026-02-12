# Staff App (Admin) - Frontend Implementation

## 1) Primary screens (MVP)

- `/login`
- `/` redirects to `/calendar` after auth
- `/calendar` Calendar (day/week) + create/edit/reschedule/cancel panels
- `/services/disable` DisableServiceWizard (branch-scoped)

## 2) Branch context and scoping

Branch Admin:
- branch context is fixed (no switcher).

Super Admin:
- branch switcher is required for branch-scoped operations (calendar, disable service).
- UI must always show current branch context.

Do not trust client-side scoping:
- Backend must enforce branch permissions; frontend should still avoid accidental cross-branch UI.

## 3) Login and session handling

- Login uses `POST /admin/auth/login` and stores `{ accessToken, expiresAt, user }` in localStorage.
- App hydration validates the token with `GET /admin/me`.
- Unauthorized responses clear local session and redirect to `/login`.
- Protected routes are wrapped in a shared shell that shows nav + auth controls.

## 4) Calendar implementation notes

Calendar queries:
- Load appointments by range: `from`/`to` in Istanbul time.
- Support staff filter (by staffId).
- Staff options load from `GET /admin/branches/{branchId}/staff` when available; fallback to staff seen in current appointment list.

Mutations:
- create appointment
- reschedule (change startsAt/assigned staff)
- cancel (with reason + override + customerContacted)

UX rules:
- After mutation, refetch or update cache for the current calendar range.
- Show conflict errors (`SLOT_CONFLICT`) as a toast + keep the editor open.
- "Quick open" from wizard navigates to `/calendar?date=YYYY-MM-DD&focusAppointmentId=...`.

## 5) Disable Service Wizard (must block suspension until cancellations complete)

Step A: Input
- Select service
- Select start/end time range
- On change, call preview:
  - `POST /admin/branches/{branchId}/service-suspensions/preview`

Step B: Impacted reservations
- Render the impacted list with:
  - appointment time
  - customer name/phone
  - assigned staff
  - quick action: open calendar for impacted date/appointment highlight
  - bulk action: cancel selected (reason `SERVICE_DISABLED`)

Step C: Apply
- "Apply suspension" button is disabled if `impactedCount > 0`.
- On click, call create suspension:
  - `POST /admin/branches/{branchId}/service-suspensions`
- If API returns `IMPACTED_APPOINTMENTS_EXIST`, stay on Step B and refetch preview.

Audit expectation:
- Cancellations and suspension creation must create audit entries (server-side).

## 6) Cancellation UI rules

Cancellation form fields:
- reason (CUSTOMER_REQUEST, SERVICE_DISABLED, SERVICE_ISSUE)
- customerContacted (required true for SERVICE_* reasons)
- override (toggle)
- note (optional)

UX mapping:
- If API returns `CANCELLATION_CUTOFF`:
  - If override is available for this user+branch, prompt to toggle override.
  - Otherwise show "Cutoff reached; contact Super Admin."
- If API returns `OVERRIDE_NOT_ALLOWED`:
  - Hide/disable override toggle for this branch/user combination.
