-- PostgreSQL-specific prerequisites.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('BRANCH_ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AppointmentPreferenceType" AS ENUM ('ANY', 'PREFERRED', 'REQUIRED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('CUSTOMER_REQUEST', 'SERVICE_DISABLED', 'SERVICE_ISSUE');

-- CreateEnum
CREATE TYPE "TimeBlockType" AS ENUM ('BREAK', 'TIME_OFF', 'OTHER');

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Istanbul',
    "slot_interval_minutes" INTEGER NOT NULL DEFAULT 10,
    "cancellation_cutoff_hours" INTEGER NOT NULL DEFAULT 24,
    "cancellation_override_allowed" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "AdminRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "normalized_phone" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_services" (
    "staff_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_services_pkey" PRIMARY KEY ("staff_id","service_id")
);

-- CreateTable
CREATE TABLE "staff_working_hours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute_of_day" INTEGER NOT NULL,
    "end_minute_of_day" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_time_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "type" "TimeBlockType" NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_time_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_suspensions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "assigned_staff_id" UUID NOT NULL,
    "preference_type" "AppointmentPreferenceType" NOT NULL DEFAULT 'ANY',
    "requested_staff_id" UUID,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "allow_alternate_staff" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_services" (
    "appointment_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "duration_minutes" INTEGER NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("appointment_id","service_id")
);

-- CreateTable
CREATE TABLE "appointment_cancellations" (
    "appointment_id" UUID NOT NULL,
    "reason" "CancellationReason" NOT NULL,
    "override" BOOLEAN NOT NULL,
    "customer_contacted" BOOLEAN NOT NULL,
    "note" VARCHAR(500),
    "cancelled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_by_user_id" UUID,

    CONSTRAINT "appointment_cancellations_pkey" PRIMARY KEY ("appointment_id")
);

-- CreateTable
CREATE TABLE "public_booking_idempotency" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "idempotency_key" VARCHAR(255) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "appointment_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_booking_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_active_idx" ON "branches"("active");

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE INDEX "admin_users_branch_id_idx" ON "admin_users"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_normalized_phone_key" ON "customers"("normalized_phone");

-- CreateIndex
CREATE INDEX "services_active_idx" ON "services"("active");

-- CreateIndex
CREATE UNIQUE INDEX "services_name_key" ON "services"("name");

-- CreateIndex
CREATE INDEX "staff_branch_id_active_idx" ON "staff"("branch_id", "active");

-- CreateIndex
CREATE INDEX "staff_services_service_id_idx" ON "staff_services"("service_id");

-- CreateIndex
CREATE INDEX "staff_working_hours_staff_id_day_of_week_idx" ON "staff_working_hours"("staff_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "staff_working_hours_entry_key" ON "staff_working_hours"("staff_id", "day_of_week", "start_minute_of_day", "end_minute_of_day");

-- CreateIndex
CREATE INDEX "staff_time_blocks_staff_id_starts_at_idx" ON "staff_time_blocks"("staff_id", "starts_at");

-- CreateIndex
CREATE INDEX "service_suspensions_branch_service_starts_idx" ON "service_suspensions"("branch_id", "service_id", "starts_at");

-- CreateIndex
CREATE INDEX "service_suspensions_branch_starts_idx" ON "service_suspensions"("branch_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_assigned_staff_id_starts_at_idx" ON "appointments"("assigned_staff_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_branch_id_starts_at_idx" ON "appointments"("branch_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_status_starts_at_idx" ON "appointments"("status", "starts_at");

-- CreateIndex
CREATE INDEX "appointment_services_service_id_idx" ON "appointment_services"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_services_appointment_id_sort_order_key" ON "appointment_services"("appointment_id", "sort_order");

-- CreateIndex
CREATE INDEX "public_booking_idempotency_appointment_id_idx" ON "public_booking_idempotency"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_booking_idempotency_idempotency_key_key" ON "public_booking_idempotency"("idempotency_key");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_services" ADD CONSTRAINT "staff_services_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_working_hours" ADD CONSTRAINT "staff_working_hours_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_blocks" ADD CONSTRAINT "staff_time_blocks_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_suspensions" ADD CONSTRAINT "service_suspensions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_suspensions" ADD CONSTRAINT "service_suspensions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_requested_staff_id_fkey" FOREIGN KEY ("requested_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_cancellations" ADD CONSTRAINT "appointment_cancellations_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_booking_idempotency" ADD CONSTRAINT "public_booking_idempotency_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data integrity checks not expressible in Prisma schema attributes.
ALTER TABLE "branches"
  ADD CONSTRAINT "branches_slot_interval_minutes_check"
  CHECK ("slot_interval_minutes" > 0),
  ADD CONSTRAINT "branches_cancellation_cutoff_hours_check"
  CHECK ("cancellation_cutoff_hours" >= 0);

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_normalized_phone_not_blank_check"
  CHECK (char_length(trim("normalized_phone")) > 0);

ALTER TABLE "services"
  ADD CONSTRAINT "services_duration_minutes_check"
  CHECK ("duration_minutes" > 0),
  ADD CONSTRAINT "services_buffer_minutes_check"
  CHECK ("buffer_minutes" >= 0);

ALTER TABLE "staff_working_hours"
  ADD CONSTRAINT "staff_working_hours_day_of_week_check"
  CHECK ("day_of_week" BETWEEN 1 AND 7),
  ADD CONSTRAINT "staff_working_hours_start_minute_of_day_check"
  CHECK ("start_minute_of_day" >= 0 AND "start_minute_of_day" < 1440),
  ADD CONSTRAINT "staff_working_hours_end_minute_of_day_check"
  CHECK ("end_minute_of_day" > 0 AND "end_minute_of_day" <= 1440),
  ADD CONSTRAINT "staff_working_hours_non_empty_range_check"
  CHECK ("start_minute_of_day" < "end_minute_of_day");

ALTER TABLE "staff_time_blocks"
  ADD CONSTRAINT "staff_time_blocks_non_empty_range_check"
  CHECK ("starts_at" < "ends_at");

ALTER TABLE "service_suspensions"
  ADD CONSTRAINT "service_suspensions_non_empty_range_check"
  CHECK ("starts_at" < "ends_at");

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_non_empty_range_check"
  CHECK ("starts_at" < "ends_at");

ALTER TABLE "appointment_services"
  ADD CONSTRAINT "appointment_services_duration_minutes_check"
  CHECK ("duration_minutes" > 0),
  ADD CONSTRAINT "appointment_services_buffer_minutes_check"
  CHECK ("buffer_minutes" >= 0),
  ADD CONSTRAINT "appointment_services_sort_order_check"
  CHECK ("sort_order" >= 0);

-- Prisma cannot model exclusion constraints; this protects against concurrent double-booking.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlapping_confirmed_for_staff"
  EXCLUDE USING GIST (
    "assigned_staff_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE ("status" = 'CONFIRMED'::"AppointmentStatus");
