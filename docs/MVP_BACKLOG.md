# MVP Backlog (Screens + APIs + Acceptance Criteria)

This backlog is ordered to support incremental delivery.

## Suggested sprint plan (implementation order)

- Sprint 1: Admin auth + RBAC, branch settings, global services
- Sprint 2: Staff + qualifications, working hours/time blocks
- Sprint 3: Availability engine + public booking (idempotency, preferred modal support)
- Sprint 4: Staff calendar + cancel/reschedule policy + audit logs


## Epic A - Auth, RBAC, Branch Scoping

### A1) Admin login
Acceptance criteria
- Given an unauthenticated request to an admin endpoint
  - When the request is sent
  - Then the response is 401
- Given a user is BRANCH_ADMIN for Branch A
  - When they request data from Branch B
  - Then the response is 403

### A2) Branch settings (Super Admin)
Includes per-branch settings:
- `slot_interval_minutes`
- `cancellation_cutoff_hours`
- `cancellation_override_allowed`

Acceptance criteria
- Given Super Admin updates branch slot interval
  - When availability is requested
  - Then returned slots align to the new interval

## Epic B - Global Services + Branch Suspensions (Safe Disable)

### B1) Global service catalog CRUD (Super Admin)
Acceptance criteria
- Given a service is inactive
  - When availability is requested
  - Then the service cannot be selected/booked

### B2) Suspension preview (Branch Admin/Super Admin)
Acceptance criteria
- Given a confirmed appointment overlaps a suspension range and includes service X
  - When preview is requested for service X and the range
  - Then the appointment appears in the impact list with customer contact info

### B3) Enforced "cancel before disable"
Acceptance criteria
- Given suspension preview returns `impactedCount > 0`
  - When the admin attempts to create the suspension
  - Then response is 409 `IMPACTED_APPOINTMENTS_EXIST`
- Given all impacted appointments are canceled with reason `SERVICE_DISABLED`
  - When the admin creates the suspension
  - Then it succeeds

## Epic C - Staff, Qualifications, Working Hours, Time Blocks

### C1) Staff CRUD + deactivate
Acceptance criteria
- Given staff is deactivated
  - When customers search availability
  - Then that staff never contributes to slots

### C2) Staff qualifications
Acceptance criteria
- Given staff is not qualified for one of the selected services
  - When availability is requested
  - Then no slot is generated from that staff

### C3) Working hours + time blocks
Acceptance criteria
- Given a time block overlaps a candidate slot
  - When availability is requested
  - Then the slot is not returned

## Epic D - Availability Engine

### D1) Slot alignment and duration
Acceptance criteria
- Given slot interval is 10 minutes
  - When availability is returned
  - Then every `startsAt` is aligned to 10-minute boundaries
- Given multiple services are selected
  - When availability is returned
  - Then `endsAt - startsAt` equals total duration + total buffers

### D2) Staff preference modes
Acceptance criteria
- REQUIRED
  - Given preferenceType=REQUIRED and requested staff is busy
    - When availability is requested
    - Then conflicting times are not returned
- PREFERRED
  - Given preferenceType=PREFERRED
    - When availability is requested
    - Then each slot includes `preferredStaffAvailable` boolean

### D3) Race-safe booking
Acceptance criteria
- Given two clients attempt to book the same staff and time concurrently
  - When both requests hit the server
  - Then exactly one succeeds and the other returns 409 `SLOT_CONFLICT`

## Epic E - Public Booking

### E1) Create appointment (idempotent)
Acceptance criteria
- Given a booking request is retried with the same `Idempotency-Key`
  - When the second request is received
  - Then the response returns the same appointment and no duplicate is created

### E2) PREFERRED modal enforcement
Acceptance criteria
- Given preferenceType=PREFERRED and preferred staff is unavailable for chosen time but another qualified staff is available
  - When booking is created with `allowAlternateStaff=false`
  - Then response is 422 `PREFERRED_STAFF_UNAVAILABLE`
  - When booking is created with `allowAlternateStaff=true`
  - Then booking succeeds and assigns a different staff

## Epic F - Staff (Admin) Calendar + Appointment Management

### F1) Calendar view (day/week)
Acceptance criteria
- Given Branch Admin opens calendar
  - When appointments are loaded
  - Then only their branch appointments are returned

### F2) Cancel/reschedule + cutoff policy
Acceptance criteria
- Service issue anytime
  - Given appointment starts in 30 minutes
    - When Branch Admin cancels with reason `SERVICE_ISSUE`
    - Then cancellation succeeds
- Normal cutoff
  - Given cutoff is 4 hours and appointment starts in 2 hours
    - When Branch Admin cancels with reason `CUSTOMER_REQUEST` and override=false
    - Then response is 409 `CANCELLATION_CUTOFF`
  - Given branch `cancellation_override_allowed=true`
    - When Branch Admin cancels with reason `CUSTOMER_REQUEST` and override=true
    - Then cancellation succeeds and audit log captures override

## Epic G - Audit Logs

### G1) Audit admin actions
Acceptance criteria
- Given an admin cancels an appointment
  - When the cancellation completes
  - Then an audit log entry is created with actor, reason, timestamp
