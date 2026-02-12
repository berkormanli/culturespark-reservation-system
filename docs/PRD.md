# PRD (MVP) - Multi-Branch Hairdresser Reservation System

## 1) Overview

Build a web-based reservation system for a hairdresser chain (10 branches). Customers can create bookings by selecting a branch, choosing one or more services, and selecting a time. Staff is the only schedulable resource. Branch admins manage their branch schedules and appointments; Super Admin manages everything.

This MVP intentionally excludes online payments and notifications (SMS/email). Admins contact customers manually when needed.

## 2) Goals

- Public booking flow with:
  - Global customer profile shared across branches (dedupe by phone)
  - Global service catalog shared across branches
  - Per-branch temporary service disable (suspension) for a time range
  - Staff selection modes: required / preferred / any
  - Adjustable slot granularity per branch
- Admin tools:
  - Staff CRUD + qualifications (staff-services)
  - Staff working hours + time blocks (breaks/time off)
  - Calendar view (day/week) with create/edit/cancel/reschedule
  - "Disable service" wizard that blocks suspensions until impacted reservations are canceled
- Safety:
  - Strict branch scoping for Branch Admin
  - Double-booking prevention (race-safe)
  - Audit log for admin actions

## 3) Non-Goals (MVP)

- Deposits / online payment
- SMS/email reminders
- Customer accounts and full self-service portal (optional later)
- Multi-staff sequencing inside a single appointment (MVP: one staff handles entire appointment)
- Two-way calendar integrations

## 4) Roles and permissions

- Customer (public): view availability, create booking
- BRANCH_ADMIN: manage data for exactly one branch
- SUPER_ADMIN: manage data for all branches, plus global settings

Hard rules:
- Branch admins cannot access or modify other branches' calendars/appointments.
- Customer is global, but Branch Admin views should default to "this branch only" appointment history (Super Admin can see cross-branch).

## 5) Key business rules

### 5.1 Time and slot granularity

- Branch timezone: `Europe/Istanbul`.
- Slot interval is configurable per branch: `slot_interval_minutes`.
- All offered times must align to the slot interval.

### 5.2 Services

- Single global catalog: `services`.
- Per-branch suspensions:
  - A branch admin can disable a service for a time range (suspension).
  - Suspensions affect customer selection and availability.

### 5.3 Multiple services per appointment

- Customers can select multiple services in one appointment.
- Total appointment length = sum(service durations) + sum(service buffers).
- (MVP) Single assigned staff for the whole appointment.

### 5.4 Staff preference modes

Definitions:
- REQUIRED: customer selects a specific staff; booking must be with that staff.
- PREFERRED: customer prefers a staff; if that staff is not available at chosen time, customer must confirm booking with another staff (modal).
- ANY: system assigns any available qualified staff.

Behavior:
- Availability results must support PREFERRED UX by returning per-slot metadata indicating whether the preferred staff is available at that time.

### 5.5 Conflict prevention (no double-booking)

- Overlapping appointments for the same staff member are not allowed.
- Booking creation must be atomic and race-safe (transaction + DB-level guarantee).

### 5.6 Service disable must be "safe"

When disabling a service for a time range:
- System must show all impacted reservations (appointments that overlap and include the service).
- Admin must contact customers manually.
- Impacted reservations must be canceled before the system allows creating the suspension.
- Existing reservations are never auto-canceled by the system when a suspension is created.

### 5.7 Cancellation policy

Cancellation reason categories:
- Service problem cancellations: allowed anytime.
  - `SERVICE_DISABLED`, `SERVICE_ISSUE`
- Normal cancellations: allowed only up to X hours before start.
  - `CUSTOMER_REQUEST`

X is configurable per branch: `cancellation_cutoff_hours`.
Override:
- `cancellation_override_allowed` is configurable per branch.
- Within cutoff window:
  - SUPER_ADMIN can cancel with `override=true`.
  - BRANCH_ADMIN can cancel with `override=true` only if `cancellation_override_allowed=true`.

## 6) Primary user journeys

### 6.1 Customer booking

1. Select branch
2. Select one or more services
3. Select staff preference: Any / Preferred / Required
4. Select date and time from availability
5. Enter name + phone (privacy notice displayed)
6. Confirm booking

PREFERRED modal requirement:
- If chosen time is not available for preferred staff, customer must explicitly accept booking with another staff or return to time selection.

### 6.2 Branch admin "disable service" workflow

1. Choose service + time range
2. Preview impacted reservations (list with customer phone)
3. Contact customers (out of system)
4. Cancel impacted reservations in system (reason `SERVICE_DISABLED`)
5. Apply suspension (only enabled when impact list is empty)

## 7) Success metrics (MVP)

- Booking completion rate (customer flow)
- Double-booking incidents: 0
- Time to disable service safely (wizard usage)
- Admin time spent per booking (proxy for efficiency)
