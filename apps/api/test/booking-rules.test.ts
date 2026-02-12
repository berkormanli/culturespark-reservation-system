import { randomUUID } from "node:crypto";
import {
  AdminRole,
  AppointmentPreferenceType,
  AppointmentStatus,
  CancellationReason,
  TimeBlockType,
} from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL or DATABASE_URL must be set to run API tests.",
  );
}

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = "test";

const { app, prisma } = await import("../src/index");

const resetDatabase = async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "admin_audit_logs",
      "public_booking_idempotency",
      "appointment_cancellations",
      "appointment_services",
      "appointments",
      "staff_time_blocks",
      "staff_working_hours",
      "staff_services",
      "staff",
      "service_suspensions",
      "services",
      "customers",
      "admin_users",
      "branches"
    RESTART IDENTITY CASCADE;
  `);
};

const createBranch = async (overrides?: {
  slotIntervalMinutes?: number;
  cancellationCutoffHours?: number;
  cancellationOverrideAllowed?: boolean;
}) =>
  prisma.branch.create({
    data: {
      name: `Test Branch ${randomUUID()}`,
      slotIntervalMinutes: overrides?.slotIntervalMinutes ?? 15,
      cancellationCutoffHours: overrides?.cancellationCutoffHours ?? 24,
      cancellationOverrideAllowed:
        overrides?.cancellationOverrideAllowed ?? false,
      active: true,
    },
  });

const createService = async () =>
  prisma.service.create({
    data: {
      name: `Service ${randomUUID()}`,
      durationMinutes: 30,
      bufferMinutes: 0,
      active: true,
    },
  });

const createStaffWithService = async (args: {
  branchId: string;
  serviceId: string;
  name: string;
}) => {
  const staff = await prisma.staff.create({
    data: {
      name: args.name,
      branchId: args.branchId,
      active: true,
    },
  });

  await prisma.staffService.create({
    data: {
      staffId: staff.id,
      serviceId: args.serviceId,
    },
  });

  await prisma.staffWorkingHour.createMany({
    data: Array.from({ length: 7 }, (_, index) => ({
      staffId: staff.id,
      dayOfWeek: index + 1,
      startMinuteOfDay: 0,
      endMinuteOfDay: 1440,
    })),
  });

  return staff;
};

const createAdminUser = async (args: {
  branchId: string;
  role?: AdminRole;
}) =>
  prisma.adminUser.create({
    data: {
      name: "Test Admin",
      email: `admin-${randomUUID()}@example.com`,
      passwordHash: "test-password",
      role: args.role ?? AdminRole.BRANCH_ADMIN,
      branchId: args.branchId,
      active: true,
    },
  });

const loginAsAdmin = async (email: string) => {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/admin/auth/login",
    payload: {
      email,
      password: "test-password",
    },
  });

  expect(response.statusCode).toBe(200);
  const body = response.json();
  return body.accessToken as string;
};

const createCustomer = async (args: { name: string; phone: string }) => {
  const digitsOnly = args.phone.replace(/\D/g, "");
  return prisma.customer.create({
    data: {
      name: args.name,
      phone: args.phone,
      normalizedPhone: `+${digitsOnly}`,
    },
  });
};

describe("booking rules", () => {
  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  test("Idempotency-Key returns same appointment on retry", async () => {
    const branch = await createBranch();
    const service = await createService();
    await createStaffWithService({
      branchId: branch.id,
      serviceId: service.id,
      name: "Staff A",
    });

    const startsAt = new Date("2030-05-01T09:00:00+03:00");
    const payload = {
      branchId: branch.id,
      serviceIds: [service.id],
      startsAt: startsAt.toISOString(),
      preferenceType: "ANY",
      allowAlternateStaff: false,
      customer: {
        name: "Idem Customer",
        phone: "+1 (555) 010-0001",
      },
    };

    const idempotencyKey = `idem-${randomUUID()}`;

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/public/appointments",
      payload,
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    });

    expect(first.statusCode).toBe(201);
    const firstBody = first.json();

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/public/appointments",
      payload,
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    });

    expect(second.statusCode).toBe(201);
    const secondBody = second.json();

    expect(secondBody.appointment.id).toBe(firstBody.appointment.id);
  });

  test("Double-book prevention returns one 201 and one 409", async () => {
    const branch = await createBranch();
    const service = await createService();
    await createStaffWithService({
      branchId: branch.id,
      serviceId: service.id,
      name: "Staff A",
    });

    const startsAt = new Date("2030-05-01T09:30:00+03:00");

    const makePayload = (phone: string) => ({
      branchId: branch.id,
      serviceIds: [service.id],
      startsAt: startsAt.toISOString(),
      preferenceType: "ANY",
      allowAlternateStaff: false,
      customer: {
        name: "Concurrent Customer",
        phone,
      },
    });

    const [first, second] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/public/appointments",
        payload: makePayload("+1 (555) 010-0002"),
        headers: {
          "Idempotency-Key": `idem-${randomUUID()}`,
        },
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/public/appointments",
        payload: makePayload("+1 (555) 010-0003"),
        headers: {
          "Idempotency-Key": `idem-${randomUUID()}`,
        },
      }),
    ]);

    const statusCodes = [first.statusCode, second.statusCode].sort();
    expect(statusCodes).toEqual([201, 409]);

    const conflict = [first, second].find(
      (response) => response.statusCode === 409,
    );
    expect(conflict?.json().error.code).toBe("SLOT_CONFLICT");
  });

  test("PREFERRED allowAlternateStaff=false rejects, true succeeds", async () => {
    const branch = await createBranch();
    const service = await createService();

    const requestedStaff = await createStaffWithService({
      branchId: branch.id,
      serviceId: service.id,
      name: "Requested Staff",
    });

    const alternateStaff = await createStaffWithService({
      branchId: branch.id,
      serviceId: service.id,
      name: "Alternate Staff",
    });

    const startsAt = new Date("2030-05-01T10:00:00+03:00");
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

    await prisma.staffTimeBlock.create({
      data: {
        staffId: requestedStaff.id,
        startsAt,
        endsAt,
        type: TimeBlockType.TIME_OFF,
      },
    });

    const basePayload = {
      branchId: branch.id,
      serviceIds: [service.id],
      startsAt: startsAt.toISOString(),
      preferenceType: "PREFERRED",
      requestedStaffId: requestedStaff.id,
      customer: {
        name: "Preferred Customer",
        phone: "+1 (555) 010-0004",
      },
    };

    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/public/appointments",
      payload: {
        ...basePayload,
        allowAlternateStaff: false,
      },
      headers: {
        "Idempotency-Key": `idem-${randomUUID()}`,
      },
    });

    expect(rejected.statusCode).toBe(422);
    expect(rejected.json().error.code).toBe("PREFERRED_STAFF_UNAVAILABLE");

    const accepted = await app.inject({
      method: "POST",
      url: "/api/v1/public/appointments",
      payload: {
        ...basePayload,
        allowAlternateStaff: true,
      },
      headers: {
        "Idempotency-Key": `idem-${randomUUID()}`,
      },
    });

    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().appointment.assignedStaff.id).toBe(
      alternateStaff.id,
    );
  });

  test("Service suspension blocked until impacted appointments canceled", async () => {
    const branch = await createBranch();
    const service = await createService();
    await createStaffWithService({
      branchId: branch.id,
      serviceId: service.id,
      name: "Staff A",
    });

    const admin = await createAdminUser({ branchId: branch.id });
    const token = await loginAsAdmin(admin.email);

    const startsAt = new Date("2030-05-01T11:00:00+03:00");
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

    const booking = await app.inject({
      method: "POST",
      url: "/api/v1/public/appointments",
      payload: {
        branchId: branch.id,
        serviceIds: [service.id],
        startsAt: startsAt.toISOString(),
        preferenceType: "ANY",
        allowAlternateStaff: false,
        customer: {
          name: "Suspension Customer",
          phone: "+1 (555) 010-0005",
        },
      },
      headers: {
        "Idempotency-Key": `idem-${randomUUID()}`,
      },
    });

    expect(booking.statusCode).toBe(201);
    const appointmentId = booking.json().appointment.id as string;

    const suspensionPayload = {
      serviceId: service.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };

    const blocked = await app.inject({
      method: "POST",
      url: `/api/v1/admin/branches/${branch.id}/service-suspensions`,
      payload: suspensionPayload,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("IMPACTED_APPOINTMENTS_EXIST");

    const cancel = await app.inject({
      method: "POST",
      url: `/api/v1/admin/appointments/${appointmentId}/cancel`,
      payload: {
        reason: CancellationReason.SERVICE_DISABLED,
        override: false,
        customerContacted: true,
        note: "Testing suspension",
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(cancel.statusCode).toBe(200);

    const created = await app.inject({
      method: "POST",
      url: `/api/v1/admin/branches/${branch.id}/service-suspensions`,
      payload: suspensionPayload,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(created.statusCode).toBe(201);
  });

  test("Cancellation cutoff and override obey branch setting", async () => {
    const branch = await createBranch({
      cancellationCutoffHours: 24,
      cancellationOverrideAllowed: false,
    });
    const service = await createService();
    const staff = await createStaffWithService({
      branchId: branch.id,
      serviceId: service.id,
      name: "Staff A",
    });

    const admin = await createAdminUser({ branchId: branch.id });
    const token = await loginAsAdmin(admin.email);

    const customer = await createCustomer({
      name: "Cutoff Customer",
      phone: "+1 (555) 010-0006",
    });

    const startsAt = new Date(Date.now() + 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

    const appointment = await prisma.appointment.create({
      data: {
        branchId: branch.id,
        customerId: customer.id,
        assignedStaffId: staff.id,
        preferenceType: AppointmentPreferenceType.ANY,
        status: AppointmentStatus.CONFIRMED,
        startsAt,
        endsAt,
        allowAlternateStaff: false,
      },
    });

    await prisma.appointmentService.create({
      data: {
        appointmentId: appointment.id,
        serviceId: service.id,
        sortOrder: 0,
        durationMinutes: service.durationMinutes,
        bufferMinutes: service.bufferMinutes,
      },
    });

    const cutoffResponse = await app.inject({
      method: "POST",
      url: `/api/v1/admin/appointments/${appointment.id}/cancel`,
      payload: {
        reason: CancellationReason.CUSTOMER_REQUEST,
        override: false,
        customerContacted: false,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(cutoffResponse.statusCode).toBe(409);
    expect(cutoffResponse.json().error.code).toBe("CANCELLATION_CUTOFF");

    const overrideBlocked = await app.inject({
      method: "POST",
      url: `/api/v1/admin/appointments/${appointment.id}/cancel`,
      payload: {
        reason: CancellationReason.CUSTOMER_REQUEST,
        override: true,
        customerContacted: false,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(overrideBlocked.statusCode).toBe(403);
    expect(overrideBlocked.json().error.code).toBe("OVERRIDE_NOT_ALLOWED");

    await prisma.branch.update({
      where: { id: branch.id },
      data: { cancellationOverrideAllowed: true },
    });

    const overrideAllowed = await app.inject({
      method: "POST",
      url: `/api/v1/admin/appointments/${appointment.id}/cancel`,
      payload: {
        reason: CancellationReason.CUSTOMER_REQUEST,
        override: true,
        customerContacted: false,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(overrideAllowed.statusCode).toBe(200);
    expect(overrideAllowed.json().appointment.status).toBe(
      AppointmentStatus.CANCELLED,
    );
  });
});
