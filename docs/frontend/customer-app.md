# Customer App (Public) - Frontend Implementation

## 1) Primary screens (MVP)

Route names are illustrative; pick your router conventions.

- `/` BranchSelect
- `/book/services` ServiceSelect (multi-select, with booking date input used for suspension-aware service list)
- `/book/staff` StaffPreference
- `/book/time` DateTimeSelect (availability)
- `/book/details` CustomerDetails + Confirm
- `/book/confirmed/:reference` Confirmation

## 2) Booking state machine (recommended)

Persist this in client state (and optionally session storage):
- `branchId`
- `serviceIds[]`
- `preferenceType` (`REQUIRED|PREFERRED|ANY`)
- `requestedStaffId?`
- `date` (YYYY-MM-DD)
- `selectedStartsAt` (RFC3339 string)
- `customerName`, `customerPhone`
- `allowAlternateStaff` (boolean; only set after preferred modal)

Guard rails:
- If a required field is missing, redirect user back to the appropriate step.

## 3) Availability screen details

Inputs for `/public/availability`:
- branchId, serviceIds, date, preferenceType, requestedStaffId?

Rendering rules:
- REQUIRED: show slots as plain list (all are for the required staff).
- ANY: show slots list.
- PREFERRED:
  - if `preferredStaffAvailable=true` label as "Preferred staff available"
  - otherwise label as "Other staff"

Interaction:
- When user selects a slot with `preferredStaffAvailable=false` and preferenceType=PREFERRED:
  - show modal:
    - "Preferred staff not available. Book with another staff?"
    - If No -> do not proceed
    - If Yes -> set `allowAlternateStaff=true` and allow confirm step

Staff picker source:
- `GET /public/branches/{branchId}/staff?serviceIds[]`
- Return active, qualified staff for the selected service set.

## 4) Confirm booking implementation

Call `POST /public/appointments` with `Idempotency-Key`.

Idempotency recommendations:
- Generate a fresh key when the user reaches confirm screen.
- Reuse the same key for retries from that screen (network errors, reload).
- If the user changes branch/service/time, generate a new key.

Client-side validation (do not rely on this alone):
- startsAt alignment to branch slot interval
- for REQUIRED/PREFERRED: requestedStaffId must be present
- phone normalization (send consistent format)

## 5) Phone capture

MVP rule:
- Customer identity is global; phone is the primary key.

UI guidance:
- Single input with Turkey defaults is fine, but always store/send normalized phone.
