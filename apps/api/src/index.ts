import crypto from "node:crypto";
import { CULTURESPARK_TIME_ZONE } from "@culturespark/shared";
import cors from "@fastify/cors";
import {
  AdminRole,
  type AppointmentPreferenceType,
  AppointmentStatus,
  CancellationReason,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

if (!process.env.TZ) {
  process.env.TZ = CULTURESPARK_TIME_ZONE;
}

const API_PREFIX = "/api/v1";
const ISTANBUL_OFFSET_MINUTES = 180;
const MINUTE_IN_MS = 60_000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const TOKEN_TTL_SECONDS = Number(process.env.ADMIN_TOKEN_TTL_SECONDS ?? "3600");
const JWT_SECRET = process.env.ADMIN_JWT_SECRET ?? "culturespark-dev-secret";

type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID_CREDENTIALS"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "IDEMPOTENCY_KEY_REUSE"
  | "SLOT_CONFLICT"
  | "INVALID_SLOT_ALIGNMENT"
  | "PREFERRED_STAFF_UNAVAILABLE"
  | "REQUESTED_STAFF_REQUIRED"
  | "IMPACTED_APPOINTMENTS_EXIST"
  | "CANCELLATION_CUTOFF"
  | "OVERRIDE_NOT_ALLOWED"
  | "APPOINTMENT_ALREADY_CANCELLED";

type PreferenceType = "ANY" | "PREFERRED" | "REQUIRED";

interface ApiErrorShape {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details: Record<string, unknown>;
}

class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details: Record<string, unknown>;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.statusCode = shape.statusCode;
    this.code = shape.code;
    this.details = shape.details;
  }
}

interface AuthTokenPayload {
  sub: string;
  role: AdminRole;
  branchId: string | null;
  exp: number;
  iat: number;
}

interface AuthUser {
  id: string;
  role: AdminRole;
  branchId: string | null;
  email: string;
  name: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }
}

interface AppointmentServiceSnapshot {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
}

interface BookingSelectionContext {
  branchId: string;
  serviceIds: string[];
  startsAt: Date;
  preferenceType: PreferenceType;
  requestedStaffId: string | null;
  allowAlternateStaff: boolean;
  assignedStaffId: string | null;
}

interface BookingSelectionResult {
  assignedStaffId: string | null;
  requestedStaffId: string | null;
  startsAt: Date;
  endsAt: Date;
  preferenceType: PreferenceType;
  services: AppointmentServiceSnapshot[];
  totalDurationMinutes: number;
}

const prisma = new PrismaClient();

const app = Fastify({ logger: true });

const corsOrigins = (
  process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3002"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

app.register(cors, {
  origin: corsOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
});

const makeApiError = (
  statusCode: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): ApiError => new ApiError({ statusCode, code, message, details });

const parsePagination = (
  pageValue: unknown,
  sizeValue: unknown,
  maxSize = 200,
): { page: number; size: number; skip: number } => {
  const pageRaw = Number(pageValue ?? "1");
  const sizeRaw = Number(sizeValue ?? "20");

  if (!Number.isInteger(pageRaw) || pageRaw < 1) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "page",
    });
  }

  if (!Number.isInteger(sizeRaw) || sizeRaw < 1 || sizeRaw > maxSize) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "size",
    });
  }

  return { page: pageRaw, size: sizeRaw, skip: (pageRaw - 1) * sizeRaw };
};

const parseDateOnly = (
  value: unknown,
  field: string,
): { start: Date; end: Date; dayOfWeek: number } => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field,
    });
  }

  const start = new Date(`${value}T00:00:00+03:00`);
  if (Number.isNaN(start.getTime())) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field,
    });
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const dayOfWeek = toIsoDayOfWeek(
    new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  );

  return {
    start,
    end: new Date(start.getTime() + DAY_IN_MS),
    dayOfWeek,
  };
};

const parseDateTime = (value: unknown, field: string): Date => {
  if (typeof value !== "string") {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field,
    });
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field,
    });
  }

  return parsed;
};

const parseStringList = (value: unknown, field: string): string[] => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.includes(",")
        ? value.split(",")
        : [value]
      : [];

  const normalized = rawValues
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  if (normalized.length === 0) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field,
    });
  }

  return [...new Set(normalized)];
};

const parsePreferenceType = (value: unknown): PreferenceType => {
  if (value === "ANY" || value === "PREFERRED" || value === "REQUIRED") {
    return value;
  }

  throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
    field: "preferenceType",
  });
};

const toIsoDayOfWeek = (day: number): number => (day === 0 ? 7 : day);

const istanbulDateFromUtc = (value: Date): Date =>
  new Date(value.getTime() + ISTANBUL_OFFSET_MINUTES * MINUTE_IN_MS);

const getIstanbulDayOfWeek = (value: Date): number =>
  toIsoDayOfWeek(istanbulDateFromUtc(value).getUTCDay());

const getIstanbulMinuteOfDay = (value: Date): number => {
  const localDate = istanbulDateFromUtc(value);
  return localDate.getUTCHours() * 60 + localDate.getUTCMinutes();
};

const isSlotAligned = (
  startsAt: Date,
  slotIntervalMinutes: number,
): boolean => {
  if (startsAt.getUTCSeconds() !== 0 || startsAt.getUTCMilliseconds() !== 0) {
    return false;
  }

  return getIstanbulMinuteOfDay(startsAt) % slotIntervalMinutes === 0;
};

const overlaps = (
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean => aStart < bEnd && aEnd > bStart;

const normalizePhone = (
  value: unknown,
): { phone: string; normalizedPhone: string } => {
  if (typeof value !== "string") {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "customer.phone",
    });
  }

  const phone = value.trim();
  const digitsOnly = phone.replace(/\D/g, "");

  if (digitsOnly.length < 7) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "customer.phone",
    });
  }

  return {
    phone,
    normalizedPhone: `+${digitsOnly}`,
  };
};

const parseCustomerInput = (
  value: unknown,
): { name: string; phone: string; normalizedPhone: string } => {
  if (typeof value !== "object" || value === null) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "customer",
    });
  }

  const nameValue = Reflect.get(value, "name");
  const phoneValue = Reflect.get(value, "phone");

  if (typeof nameValue !== "string" || nameValue.trim().length === 0) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "customer.name",
    });
  }

  const { phone, normalizedPhone } = normalizePhone(phoneValue);

  return {
    name: nameValue.trim(),
    phone,
    normalizedPhone,
  };
};

const hashBody = (value: object): string =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const encodeBase64Url = (value: string): string =>
  Buffer.from(value).toString("base64url");

const decodeBase64Url = (value: string): string =>
  Buffer.from(value, "base64url").toString("utf8");

const signToken = (payload: Omit<AuthTokenPayload, "exp" | "iat">): string => {
  const header = { alg: "HS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const fullPayload: AuthTokenPayload = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
  };

  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

const verifyToken = (token: string): AuthTokenPayload => {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw makeApiError(401, "UNAUTHORIZED", "Authentication is required");
  }

  const expectedSignature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  if (expectedSignature !== encodedSignature) {
    throw makeApiError(401, "UNAUTHORIZED", "Authentication is required");
  }

  let payload: AuthTokenPayload;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as AuthTokenPayload;
  } catch {
    throw makeApiError(401, "UNAUTHORIZED", "Authentication is required");
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw makeApiError(401, "UNAUTHORIZED", "Authentication is required");
  }

  return payload;
};

const getBearerToken = (request: FastifyRequest): string => {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    throw makeApiError(401, "UNAUTHORIZED", "Authentication is required");
  }

  const [tokenType, token] = authHeader.split(" ");
  if (tokenType !== "Bearer" || !token) {
    throw makeApiError(401, "UNAUTHORIZED", "Authentication is required");
  }

  return token;
};

const requireAdminAuth = async (request: FastifyRequest): Promise<void> => {
  const token = getBearerToken(request);
  const payload = verifyToken(token);

  const user = await prisma.adminUser.findUnique({
    where: { id: payload.sub },
  });
  if (!user || !user.active) {
    throw makeApiError(401, "UNAUTHORIZED", "Authentication is required");
  }

  request.authUser = {
    id: user.id,
    role: user.role,
    branchId: user.branchId,
    email: user.email,
    name: user.name,
  };
};

const getAuthUser = (request: FastifyRequest): AuthUser => {
  if (!request.authUser) {
    throw makeApiError(401, "UNAUTHORIZED", "Authentication is required");
  }

  return request.authUser;
};

const assertSuperAdmin = (authUser: AuthUser): void => {
  if (authUser.role !== AdminRole.SUPER_ADMIN) {
    throw makeApiError(
      403,
      "FORBIDDEN",
      "You do not have permission to perform this action",
    );
  }
};

const assertBranchScope = (authUser: AuthUser, branchId: string): void => {
  if (authUser.role !== AdminRole.BRANCH_ADMIN) {
    return;
  }

  if (!authUser.branchId || authUser.branchId !== branchId) {
    throw makeApiError(
      403,
      "FORBIDDEN",
      "You do not have permission to perform this action",
    );
  }
};

const mapPagination = (page: number, size: number, totalItems: number) => ({
  page,
  size,
  totalItems,
  totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / size),
});

const buildIntervalMap = <
  T extends {
    startsAt: Date;
    endsAt: Date;
  },
>(
  records: T[],
  idSelector: (record: T) => string,
): Map<string, T[]> => {
  const map = new Map<string, T[]>();

  for (const record of records) {
    const id = idSelector(record);
    const existing = map.get(id);
    if (existing) {
      existing.push(record);
    } else {
      map.set(id, [record]);
    }
  }

  return map;
};

const ensureBranchExists = async (branchId: string): Promise<void> => {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    throw makeApiError(404, "NOT_FOUND", "Resource not found", { branchId });
  }
};

const getActiveBranchOrFail = async (branchId: string) => {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, active: true },
  });
  if (!branch) {
    throw makeApiError(404, "NOT_FOUND", "Resource not found", { branchId });
  }

  return branch;
};

const getActiveServicesByIds = async (
  serviceIds: string[],
): Promise<AppointmentServiceSnapshot[]> => {
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, active: true },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      bufferMinutes: true,
    },
  });

  if (services.length !== serviceIds.length) {
    throw makeApiError(404, "NOT_FOUND", "Resource not found", {
      serviceIds,
    });
  }

  const serviceById = new Map(services.map((service) => [service.id, service]));
  return serviceIds.map((serviceId) => {
    const service = serviceById.get(serviceId);
    if (!service) {
      throw makeApiError(404, "NOT_FOUND", "Resource not found", {
        serviceIds,
      });
    }

    return service;
  });
};

const computeDurationMinutes = (
  services: AppointmentServiceSnapshot[],
): number =>
  services.reduce(
    (total, service) => total + service.durationMinutes + service.bufferMinutes,
    0,
  );

const loadQualifiedStaff = async (
  tx: Prisma.TransactionClient | PrismaClient,
  branchId: string,
  serviceIds: string[],
  dayOfWeek: number,
) => {
  const staff = await tx.staff.findMany({
    where: {
      branchId,
      active: true,
      staffServices: {
        some: {
          serviceId: {
            in: serviceIds,
          },
        },
      },
    },
    include: {
      staffServices: {
        where: {
          serviceId: {
            in: serviceIds,
          },
        },
        select: {
          serviceId: true,
        },
      },
      workingHours: {
        where: {
          dayOfWeek,
        },
        select: {
          startMinuteOfDay: true,
          endMinuteOfDay: true,
        },
      },
    },
  });

  return staff.filter((member) =>
    serviceIds.every((serviceId) =>
      member.staffServices.some(
        (staffService) => staffService.serviceId === serviceId,
      ),
    ),
  );
};

const staffCoversRange = (
  startMinuteOfDay: number,
  endMinuteOfDay: number,
  workingHours: Array<{ startMinuteOfDay: number; endMinuteOfDay: number }>,
): boolean =>
  workingHours.some(
    (workingHour) =>
      workingHour.startMinuteOfDay <= startMinuteOfDay &&
      workingHour.endMinuteOfDay >= endMinuteOfDay,
  );

const hasOverlapsForStaff = (
  staffId: string,
  startsAt: Date,
  endsAt: Date,
  map: Map<string, Array<{ startsAt: Date; endsAt: Date }>>,
): boolean => {
  const intervals = map.get(staffId);
  if (!intervals) {
    return false;
  }

  return intervals.some((interval) =>
    overlaps(startsAt, endsAt, interval.startsAt, interval.endsAt),
  );
};

const getAvailableStaffForSlot = async (
  tx: Prisma.TransactionClient | PrismaClient,
  args: {
    branchId: string;
    serviceIds: string[];
    startsAt: Date;
    endsAt: Date;
    dayOfWeek: number;
    startMinuteOfDay: number;
    endMinuteOfDay: number;
  },
) => {
  const qualifiedStaff = await loadQualifiedStaff(
    tx,
    args.branchId,
    args.serviceIds,
    args.dayOfWeek,
  );
  if (qualifiedStaff.length === 0) {
    return {
      qualifiedStaff,
      availableStaffIds: [] as string[],
      serviceSuspended: false,
    };
  }

  const staffIds = qualifiedStaff.map((staff) => staff.id);

  const [appointments, timeBlocks, suspensions] = await Promise.all([
    tx.appointment.findMany({
      where: {
        assignedStaffId: {
          in: staffIds,
        },
        status: AppointmentStatus.CONFIRMED,
        startsAt: {
          lt: args.endsAt,
        },
        endsAt: {
          gt: args.startsAt,
        },
      },
      select: {
        assignedStaffId: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    tx.staffTimeBlock.findMany({
      where: {
        staffId: {
          in: staffIds,
        },
        startsAt: {
          lt: args.endsAt,
        },
        endsAt: {
          gt: args.startsAt,
        },
      },
      select: {
        staffId: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    tx.serviceSuspension.findMany({
      where: {
        branchId: args.branchId,
        serviceId: {
          in: args.serviceIds,
        },
        startsAt: {
          lt: args.endsAt,
        },
        endsAt: {
          gt: args.startsAt,
        },
      },
      select: {
        id: true,
      },
      take: 1,
    }),
  ]);

  const serviceSuspended = suspensions.length > 0;
  if (serviceSuspended) {
    return {
      qualifiedStaff,
      availableStaffIds: [] as string[],
      serviceSuspended,
    };
  }

  const appointmentsByStaff = buildIntervalMap(
    appointments,
    (item) => item.assignedStaffId,
  );
  const timeBlocksByStaff = buildIntervalMap(
    timeBlocks,
    (item) => item.staffId,
  );

  const availableStaffIds = qualifiedStaff
    .filter((member) =>
      staffCoversRange(
        args.startMinuteOfDay,
        args.endMinuteOfDay,
        member.workingHours,
      ),
    )
    .filter(
      (member) =>
        !hasOverlapsForStaff(
          member.id,
          args.startsAt,
          args.endsAt,
          appointmentsByStaff,
        ) &&
        !hasOverlapsForStaff(
          member.id,
          args.startsAt,
          args.endsAt,
          timeBlocksByStaff,
        ),
    )
    .map((member) => member.id)
    .sort((first, second) => first.localeCompare(second));

  return {
    qualifiedStaff,
    availableStaffIds,
    serviceSuspended,
  };
};

const resolveBookingSelection = async (
  tx: Prisma.TransactionClient | PrismaClient,
  context: BookingSelectionContext,
): Promise<BookingSelectionResult> => {
  const branch = await getActiveBranchOrFail(context.branchId);
  const services = await getActiveServicesByIds(context.serviceIds);

  const totalDurationMinutes = computeDurationMinutes(services);
  const endsAt = new Date(
    context.startsAt.getTime() + totalDurationMinutes * MINUTE_IN_MS,
  );
  const slotIntervalMinutes = branch.slotIntervalMinutes;

  if (!isSlotAligned(context.startsAt, slotIntervalMinutes)) {
    throw makeApiError(
      422,
      "INVALID_SLOT_ALIGNMENT",
      "startsAt must align with branch slot interval",
      {
        slotIntervalMinutes,
      },
    );
  }

  const localStartMinute = getIstanbulMinuteOfDay(context.startsAt);
  const localEndMinute = localStartMinute + totalDurationMinutes;

  if (localEndMinute > 1440) {
    return {
      assignedStaffId: null,
      requestedStaffId: context.requestedStaffId,
      startsAt: context.startsAt,
      endsAt,
      preferenceType: context.preferenceType,
      services,
      totalDurationMinutes,
    };
  }

  if (
    (context.preferenceType === "REQUIRED" ||
      context.preferenceType === "PREFERRED") &&
    !context.requestedStaffId
  ) {
    throw makeApiError(
      422,
      "REQUESTED_STAFF_REQUIRED",
      "requestedStaffId is required for REQUIRED and PREFERRED preferenceType",
      {
        field: "requestedStaffId",
      },
    );
  }

  const dayOfWeek = getIstanbulDayOfWeek(context.startsAt);
  const availability = await getAvailableStaffForSlot(tx, {
    branchId: context.branchId,
    serviceIds: context.serviceIds,
    startsAt: context.startsAt,
    endsAt,
    dayOfWeek,
    startMinuteOfDay: localStartMinute,
    endMinuteOfDay: localEndMinute,
  });

  const qualifiedStaffIds = new Set(
    availability.qualifiedStaff.map((staff) => staff.id),
  );

  if (
    context.requestedStaffId &&
    !qualifiedStaffIds.has(context.requestedStaffId)
  ) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "requestedStaffId",
    });
  }

  let selectedStaffId: string | null = null;
  const requestedIsAvailable =
    context.requestedStaffId !== null &&
    availability.availableStaffIds.includes(context.requestedStaffId);

  if (context.assignedStaffId) {
    if (!qualifiedStaffIds.has(context.assignedStaffId)) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "assignedStaffId",
      });
    }

    selectedStaffId = availability.availableStaffIds.includes(
      context.assignedStaffId,
    )
      ? context.assignedStaffId
      : null;
  } else if (context.preferenceType === "REQUIRED") {
    selectedStaffId = requestedIsAvailable ? context.requestedStaffId : null;
  } else if (context.preferenceType === "PREFERRED") {
    if (requestedIsAvailable) {
      selectedStaffId = context.requestedStaffId;
    } else {
      const alternate = availability.availableStaffIds.find(
        (staffId) => staffId !== context.requestedStaffId,
      );

      if (!context.allowAlternateStaff) {
        throw makeApiError(
          422,
          "PREFERRED_STAFF_UNAVAILABLE",
          "Preferred staff is unavailable for this slot",
          {
            requestedStaffId: context.requestedStaffId,
          },
        );
      }

      selectedStaffId = alternate ?? null;
    }
  } else {
    selectedStaffId = availability.availableStaffIds[0] ?? null;
  }

  return {
    assignedStaffId: selectedStaffId,
    requestedStaffId: context.requestedStaffId,
    startsAt: context.startsAt,
    endsAt,
    preferenceType: context.preferenceType,
    services,
    totalDurationMinutes,
  };
};

const appointmentInclude = {
  appointmentServices: {
    orderBy: {
      sortOrder: "asc" as const,
    },
    include: {
      service: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  customer: {
    select: {
      name: true,
      phone: true,
    },
  },
  assignedStaff: {
    select: {
      id: true,
      name: true,
    },
  },
  cancellation: {
    select: {
      reason: true,
      override: true,
      customerContacted: true,
      note: true,
      cancelledAt: true,
      cancelledByUserId: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

const mapAppointment = (
  appointment: Prisma.AppointmentGetPayload<{
    include: typeof appointmentInclude;
  }>,
) => {
  const mapped: {
    id: string;
    branchId: string;
    startsAt: string;
    endsAt: string;
    status: AppointmentStatus;
    services: Array<{
      id: string;
      name: string;
      durationMinutes: number;
      bufferMinutes: number;
    }>;
    customer: { name: string; phone: string };
    assignedStaff: { id: string; name: string };
    preferenceType: AppointmentPreferenceType;
    requestedStaffId: string | null;
    createdAt: string;
    updatedAt: string;
    cancellation?: {
      reason: CancellationReason;
      override: boolean;
      customerContacted: boolean;
      note: string | null;
      cancelledAt: string;
      cancelledByUserId: string | null;
    };
  } = {
    id: appointment.id,
    branchId: appointment.branchId,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    status: appointment.status,
    services: appointment.appointmentServices.map((serviceEntry) => ({
      id: serviceEntry.serviceId,
      name: serviceEntry.service.name,
      durationMinutes: serviceEntry.durationMinutes,
      bufferMinutes: serviceEntry.bufferMinutes,
    })),
    customer: {
      name: appointment.customer.name,
      phone: appointment.customer.phone,
    },
    assignedStaff: {
      id: appointment.assignedStaff.id,
      name: appointment.assignedStaff.name,
    },
    preferenceType: appointment.preferenceType,
    requestedStaffId: appointment.requestedStaffId,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };

  if (appointment.cancellation) {
    mapped.cancellation = {
      reason: appointment.cancellation.reason,
      override: appointment.cancellation.override,
      customerContacted: appointment.cancellation.customerContacted,
      note: appointment.cancellation.note,
      cancelledAt: appointment.cancellation.cancelledAt.toISOString(),
      cancelledByUserId: appointment.cancellation.cancelledByUserId,
    };
  }

  return mapped;
};

const writeAuditLog = async (
  tx: Prisma.TransactionClient,
  args: {
    adminUserId: string;
    role: AdminRole;
    branchId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    details: Record<string, unknown>;
  },
): Promise<void> => {
  await tx.adminAuditLog.create({
    data: {
      adminUserId: args.adminUserId,
      branchId: args.branchId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      details: {
        role: args.role,
        ...args.details,
      },
    },
  });
};

const createAppointmentWithDetails = async (
  tx: Prisma.TransactionClient,
  args: {
    branchId: string;
    customer: {
      name: string;
      phone: string;
      normalizedPhone: string;
    };
    selection: BookingSelectionResult;
    allowAlternateStaff: boolean;
  },
) => {
  if (!args.selection.assignedStaffId) {
    throw makeApiError(409, "SLOT_CONFLICT", "Slot is no longer available", {
      startsAt: args.selection.startsAt.toISOString(),
    });
  }

  const customer = await tx.customer.upsert({
    where: {
      normalizedPhone: args.customer.normalizedPhone,
    },
    update: {
      name: args.customer.name,
      phone: args.customer.phone,
    },
    create: {
      name: args.customer.name,
      phone: args.customer.phone,
      normalizedPhone: args.customer.normalizedPhone,
    },
  });

  const appointment = await tx.appointment.create({
    data: {
      branchId: args.branchId,
      customerId: customer.id,
      assignedStaffId: args.selection.assignedStaffId,
      preferenceType: args.selection.preferenceType,
      requestedStaffId: args.selection.requestedStaffId,
      startsAt: args.selection.startsAt,
      endsAt: args.selection.endsAt,
      allowAlternateStaff: args.allowAlternateStaff,
      status: AppointmentStatus.CONFIRMED,
    },
  });

  await tx.appointmentService.createMany({
    data: args.selection.services.map((service, index) => ({
      appointmentId: appointment.id,
      serviceId: service.id,
      sortOrder: index,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
    })),
  });

  return tx.appointment.findUniqueOrThrow({
    where: {
      id: appointment.id,
    },
    include: appointmentInclude,
  });
};

const isPrismaConflictError = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2004") {
    return false;
  }

  const databaseError =
    typeof error.meta?.database_error === "string"
      ? error.meta.database_error
      : "";

  return databaseError.includes(
    "appointments_no_overlapping_confirmed_for_staff",
  );
};

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ApiError) {
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  if (isPrismaConflictError(error)) {
    reply.status(409).send({
      error: {
        code: "SLOT_CONFLICT",
        message: "Slot is no longer available",
        details: {},
      },
    });
    return;
  }

  app.log.error(error);
  reply.status(500).send({
    error: {
      code: "VALIDATION_ERROR",
      message: "Unexpected server error",
      details: {},
    },
  });
});

app.get("/health", async () => ({
  status: "ok",
  timezone: CULTURESPARK_TIME_ZONE,
  message: "MVP excludes online payments and SMS/email notifications.",
}));

app.get(`${API_PREFIX}/public/branches`, async (request) => {
  const query = request.query as Record<string, unknown>;
  const { page, size, skip } = parsePagination(query.page, query.size);

  const [totalItems, branches] = await Promise.all([
    prisma.branch.count({
      where: {
        active: true,
      },
    }),
    prisma.branch.findMany({
      where: {
        active: true,
      },
      orderBy: {
        name: "asc",
      },
      skip,
      take: size,
      select: {
        id: true,
        name: true,
        timezone: true,
      },
    }),
  ]);

  return {
    items: branches,
    pagination: mapPagination(page, size, totalItems),
  };
});

app.get(`${API_PREFIX}/public/branches/:branchId/services`, async (request) => {
  const params = request.params as { branchId?: string };
  const query = request.query as Record<string, unknown>;

  if (!params.branchId) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "branchId",
    });
  }

  const date = typeof query.date === "string" ? query.date : "";
  const day = parseDateOnly(date, "date");
  const { page, size, skip } = parsePagination(query.page, query.size);

  await getActiveBranchOrFail(params.branchId);

  const [totalItems, services, suspensions] = await Promise.all([
    prisma.service.count(),
    prisma.service.findMany({
      orderBy: {
        name: "asc",
      },
      skip,
      take: size,
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        bufferMinutes: true,
        active: true,
      },
    }),
    prisma.serviceSuspension.findMany({
      where: {
        branchId: params.branchId,
        startsAt: {
          lt: day.end,
        },
        endsAt: {
          gt: day.start,
        },
      },
      select: {
        serviceId: true,
      },
    }),
  ]);

  const suspendedServiceIds = new Set(
    suspensions.map((suspension) => suspension.serviceId),
  );

  return {
    date,
    items: services.map((service) => {
      const isSuspendedForDate = suspendedServiceIds.has(service.id);
      return {
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        bufferMinutes: service.bufferMinutes,
        isActiveGlobally: service.active,
        isSuspendedForDate,
        isBookable: service.active && !isSuspendedForDate,
      };
    }),
    pagination: mapPagination(page, size, totalItems),
  };
});

app.get(`${API_PREFIX}/public/branches/:branchId/staff`, async (request) => {
  const params = request.params as { branchId?: string };
  const query = request.query as Record<string, unknown>;

  if (!params.branchId) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "branchId",
    });
  }

  const serviceIds = parseStringList(query.serviceIds, "serviceIds");

  await getActiveBranchOrFail(params.branchId);
  await getActiveServicesByIds(serviceIds);

  const staff = await prisma.staff.findMany({
    where: {
      branchId: params.branchId,
      active: true,
      staffServices: {
        some: {
          serviceId: {
            in: serviceIds,
          },
        },
      },
    },
    include: {
      staffServices: {
        where: {
          serviceId: {
            in: serviceIds,
          },
        },
        select: {
          serviceId: true,
        },
      },
    },
  });

  const items = staff
    .filter((member) =>
      serviceIds.every((serviceId) =>
        member.staffServices.some(
          (staffService) => staffService.serviceId === serviceId,
        ),
      ),
    )
    .sort((first, second) => first.name.localeCompare(second.name))
    .map((member) => ({
      id: member.id,
      name: member.name,
    }));

  return {
    items,
  };
});

app.get(`${API_PREFIX}/public/availability`, async (request) => {
  const query = request.query as Record<string, unknown>;

  const branchId = typeof query.branchId === "string" ? query.branchId : "";
  const serviceIds = parseStringList(query.serviceIds, "serviceIds");
  const dateRange = parseDateOnly(query.date, "date");
  const preferenceType = parsePreferenceType(query.preferenceType);
  const requestedStaffId =
    typeof query.requestedStaffId === "string" ? query.requestedStaffId : null;

  if (!branchId) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "branchId",
    });
  }

  if (
    (preferenceType === "REQUIRED" || preferenceType === "PREFERRED") &&
    !requestedStaffId
  ) {
    throw makeApiError(
      422,
      "REQUESTED_STAFF_REQUIRED",
      "requestedStaffId is required for REQUIRED and PREFERRED preferenceType",
      {
        field: "requestedStaffId",
      },
    );
  }

  const branch = await getActiveBranchOrFail(branchId);
  const services = await getActiveServicesByIds(serviceIds);

  const totalDurationMinutes = computeDurationMinutes(services);
  const slotIntervalMinutes = branch.slotIntervalMinutes;

  const qualifiedStaff = await loadQualifiedStaff(
    prisma,
    branchId,
    serviceIds,
    dateRange.dayOfWeek,
  );

  const qualifiedStaffIds = qualifiedStaff.map((staff) => staff.id);
  const requestedStaffExists =
    requestedStaffId === null || qualifiedStaffIds.includes(requestedStaffId);

  if (!requestedStaffExists) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "requestedStaffId",
    });
  }

  if (qualifiedStaffIds.length === 0) {
    return {
      slotIntervalMinutes,
      totalDurationMinutes,
      slots: [],
    };
  }

  const [appointments, timeBlocks, suspensions] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        assignedStaffId: {
          in: qualifiedStaffIds,
        },
        status: AppointmentStatus.CONFIRMED,
        startsAt: {
          lt: dateRange.end,
        },
        endsAt: {
          gt: dateRange.start,
        },
      },
      select: {
        assignedStaffId: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.staffTimeBlock.findMany({
      where: {
        staffId: {
          in: qualifiedStaffIds,
        },
        startsAt: {
          lt: dateRange.end,
        },
        endsAt: {
          gt: dateRange.start,
        },
      },
      select: {
        staffId: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.serviceSuspension.findMany({
      where: {
        branchId,
        serviceId: {
          in: serviceIds,
        },
        startsAt: {
          lt: dateRange.end,
        },
        endsAt: {
          gt: dateRange.start,
        },
      },
      select: {
        startsAt: true,
        endsAt: true,
      },
    }),
  ]);

  const appointmentsByStaff = buildIntervalMap(
    appointments,
    (item) => item.assignedStaffId,
  );
  const timeBlocksByStaff = buildIntervalMap(
    timeBlocks,
    (item) => item.staffId,
  );

  const slots: Array<{
    startsAt: string;
    endsAt: string;
    preferredStaffAvailable?: boolean;
  }> = [];

  const lastStartAt =
    dateRange.end.getTime() - totalDurationMinutes * MINUTE_IN_MS;

  for (
    let startsAtMilliseconds = dateRange.start.getTime();
    startsAtMilliseconds <= lastStartAt;
    startsAtMilliseconds += slotIntervalMinutes * MINUTE_IN_MS
  ) {
    const slotStartsAt = new Date(startsAtMilliseconds);
    const slotEndsAt = new Date(
      slotStartsAt.getTime() + totalDurationMinutes * MINUTE_IN_MS,
    );

    const localStartMinuteOfDay = getIstanbulMinuteOfDay(slotStartsAt);
    const localEndMinuteOfDay = localStartMinuteOfDay + totalDurationMinutes;

    if (localEndMinuteOfDay > 1440) {
      continue;
    }

    const suspended = suspensions.some((suspension) =>
      overlaps(
        slotStartsAt,
        slotEndsAt,
        suspension.startsAt,
        suspension.endsAt,
      ),
    );

    if (suspended) {
      continue;
    }

    const availableStaffIds = qualifiedStaff
      .filter((staff) =>
        staffCoversRange(
          localStartMinuteOfDay,
          localEndMinuteOfDay,
          staff.workingHours,
        ),
      )
      .filter(
        (staff) =>
          !hasOverlapsForStaff(
            staff.id,
            slotStartsAt,
            slotEndsAt,
            appointmentsByStaff,
          ) &&
          !hasOverlapsForStaff(
            staff.id,
            slotStartsAt,
            slotEndsAt,
            timeBlocksByStaff,
          ),
      )
      .map((staff) => staff.id);

    if (preferenceType === "REQUIRED") {
      if (requestedStaffId && availableStaffIds.includes(requestedStaffId)) {
        slots.push({
          startsAt: slotStartsAt.toISOString(),
          endsAt: slotEndsAt.toISOString(),
        });
      }
      continue;
    }

    if (availableStaffIds.length === 0) {
      continue;
    }

    if (preferenceType === "PREFERRED") {
      slots.push({
        startsAt: slotStartsAt.toISOString(),
        endsAt: slotEndsAt.toISOString(),
        preferredStaffAvailable:
          requestedStaffId !== null &&
          availableStaffIds.includes(requestedStaffId),
      });
      continue;
    }

    slots.push({
      startsAt: slotStartsAt.toISOString(),
      endsAt: slotEndsAt.toISOString(),
    });
  }

  return {
    slotIntervalMinutes,
    totalDurationMinutes,
    slots,
  };
});

app.post(`${API_PREFIX}/public/appointments`, async (request, reply) => {
  const idempotencyKeyHeader = request.headers["idempotency-key"];
  const idempotencyKey =
    typeof idempotencyKeyHeader === "string" ? idempotencyKeyHeader.trim() : "";

  if (idempotencyKey.length < 8 || idempotencyKey.length > 255) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "Idempotency-Key",
    });
  }

  const body = request.body as Record<string, unknown>;

  const branchId = typeof body.branchId === "string" ? body.branchId : "";
  const serviceIds = parseStringList(body.serviceIds, "serviceIds");
  const startsAt = parseDateTime(body.startsAt, "startsAt");
  const preferenceType = parsePreferenceType(body.preferenceType);
  const requestedStaffId =
    typeof body.requestedStaffId === "string" ? body.requestedStaffId : null;
  const allowAlternateStaff = body.allowAlternateStaff === true;
  const customer = parseCustomerInput(body.customer);

  if (!branchId) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "branchId",
    });
  }

  if (
    (preferenceType === "REQUIRED" || preferenceType === "PREFERRED") &&
    !requestedStaffId
  ) {
    throw makeApiError(
      422,
      "REQUESTED_STAFF_REQUIRED",
      "requestedStaffId is required for REQUIRED and PREFERRED preferenceType",
      {
        field: "requestedStaffId",
      },
    );
  }

  const semanticRequestHash = hashBody({
    branchId,
    serviceIds: [...serviceIds].sort((first, second) =>
      first.localeCompare(second),
    ),
    startsAt: startsAt.toISOString(),
    preferenceType,
    requestedStaffId,
    allowAlternateStaff,
    customer: {
      name: customer.name,
      normalizedPhone: customer.normalizedPhone,
    },
  });

  const appointment = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;

      const existingIdempotency = await tx.publicBookingIdempotency.findUnique({
        where: {
          idempotencyKey,
        },
        include: {
          appointment: {
            include: appointmentInclude,
          },
        },
      });

      if (existingIdempotency) {
        if (existingIdempotency.requestHash !== semanticRequestHash) {
          throw makeApiError(
            409,
            "IDEMPOTENCY_KEY_REUSE",
            "Idempotency-Key has already been used with a different request",
            {
              idempotencyKey,
            },
          );
        }

        return existingIdempotency.appointment;
      }

      const selection = await resolveBookingSelection(tx, {
        branchId,
        serviceIds,
        startsAt,
        preferenceType,
        requestedStaffId,
        allowAlternateStaff,
        assignedStaffId: null,
      });

      const createdAppointment = await createAppointmentWithDetails(tx, {
        branchId,
        customer,
        selection,
        allowAlternateStaff,
      });

      await tx.publicBookingIdempotency.create({
        data: {
          idempotencyKey,
          requestHash: semanticRequestHash,
          appointmentId: createdAppointment.id,
        },
      });

      return createdAppointment;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  return reply.status(201).send({
    appointment: mapAppointment(appointment),
  });
});

app.post(`${API_PREFIX}/admin/auth/login`, async (request) => {
  const body = request.body as Record<string, unknown>;
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    throw makeApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const user = await prisma.adminUser.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      active: true,
    },
  });

  if (!user) {
    throw makeApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const passwordMatches = user.passwordHash.startsWith("$2")
    ? await bcrypt.compare(password, user.passwordHash)
    : user.passwordHash === password;

  if (!passwordMatches) {
    throw makeApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const accessToken = signToken({
    sub: user.id,
    role: user.role,
    branchId: user.branchId,
  });

  return {
    accessToken,
    tokenType: "Bearer",
    expiresInSeconds: TOKEN_TTL_SECONDS,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    },
  };
});

app.get(
  `${API_PREFIX}/admin/me`,
  {
    preHandler: requireAdminAuth,
  },
  async (request) => {
    const authUser = getAuthUser(request);

    return {
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      role: authUser.role,
      branchId: authUser.branchId,
    };
  },
);

app.get(
  `${API_PREFIX}/admin/branches/:branchId/staff`,
  {
    preHandler: requireAdminAuth,
  },
  async (request) => {
    const authUser = getAuthUser(request);
    const params = request.params as { branchId?: string };
    const query = request.query as Record<string, unknown>;

    const branchId = params.branchId ?? "";

    if (!branchId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "branchId",
      });
    }

    assertBranchScope(authUser, branchId);

    const { page, size, skip } = parsePagination(query.page, query.size, 500);

    const [totalItems, staff] = await Promise.all([
      prisma.staff.count({
        where: {
          branchId,
          active: true,
        },
      }),
      prisma.staff.findMany({
        where: {
          branchId,
          active: true,
        },
        orderBy: {
          name: "asc",
        },
        skip,
        take: size,
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    return {
      items: staff,
      pagination: mapPagination(page, size, totalItems),
    };
  },
);

app.patch(
  `${API_PREFIX}/admin/branches/:branchId/settings`,
  {
    preHandler: requireAdminAuth,
  },
  async (request) => {
    const authUser = getAuthUser(request);
    assertSuperAdmin(authUser);

    const params = request.params as { branchId?: string };
    const branchId = params.branchId ?? "";

    if (!branchId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "branchId",
      });
    }

    const body = request.body as Record<string, unknown>;

    const data: {
      slotIntervalMinutes?: number;
      cancellationCutoffHours?: number;
      cancellationOverrideAllowed?: boolean;
    } = {};

    if (Reflect.has(body, "slotIntervalMinutes")) {
      const slotIntervalMinutes = Number(body.slotIntervalMinutes);
      if (!Number.isInteger(slotIntervalMinutes) || slotIntervalMinutes <= 0) {
        throw makeApiError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          {
            field: "slotIntervalMinutes",
          },
        );
      }
      data.slotIntervalMinutes = slotIntervalMinutes;
    }

    if (Reflect.has(body, "cancellationCutoffHours")) {
      const cancellationCutoffHours = Number(body.cancellationCutoffHours);
      if (
        !Number.isInteger(cancellationCutoffHours) ||
        cancellationCutoffHours < 0
      ) {
        throw makeApiError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          {
            field: "cancellationCutoffHours",
          },
        );
      }
      data.cancellationCutoffHours = cancellationCutoffHours;
    }

    if (Reflect.has(body, "cancellationOverrideAllowed")) {
      if (typeof body.cancellationOverrideAllowed !== "boolean") {
        throw makeApiError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          {
            field: "cancellationOverrideAllowed",
          },
        );
      }
      data.cancellationOverrideAllowed = body.cancellationOverrideAllowed;
    }

    if (Object.keys(data).length === 0) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        message: "At least one field must be provided",
      });
    }

    const updatedBranch = await prisma.branch
      .update({
        where: {
          id: branchId,
        },
        data,
        select: {
          id: true,
          slotIntervalMinutes: true,
          cancellationCutoffHours: true,
          cancellationOverrideAllowed: true,
        },
      })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          throw makeApiError(404, "NOT_FOUND", "Resource not found", {
            branchId,
          });
        }

        throw error;
      });

    return {
      branchId: updatedBranch.id,
      slotIntervalMinutes: updatedBranch.slotIntervalMinutes,
      cancellationCutoffHours: updatedBranch.cancellationCutoffHours,
      cancellationOverrideAllowed: updatedBranch.cancellationOverrideAllowed,
    };
  },
);

app.get(
  `${API_PREFIX}/admin/appointments`,
  {
    preHandler: requireAdminAuth,
  },
  async (request) => {
    const authUser = getAuthUser(request);
    const query = request.query as Record<string, unknown>;

    const branchId = typeof query.branchId === "string" ? query.branchId : "";
    if (!branchId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "branchId",
      });
    }

    assertBranchScope(authUser, branchId);

    const from = query.from ? parseDateTime(query.from, "from") : null;
    const to = query.to ? parseDateTime(query.to, "to") : null;

    if (from && to && to <= from) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "to",
      });
    }

    const staffId = typeof query.staffId === "string" ? query.staffId : null;
    const statusRaw = query.status;
    let status: AppointmentStatus | null = null;
    if (statusRaw !== undefined) {
      if (
        statusRaw === AppointmentStatus.CONFIRMED ||
        statusRaw === AppointmentStatus.CANCELLED
      ) {
        status = statusRaw;
      } else {
        throw makeApiError(
          422,
          "VALIDATION_ERROR",
          "Request validation failed",
          {
            field: "status",
          },
        );
      }
    }

    const { page, size, skip } = parsePagination(query.page, query.size);

    const where: Prisma.AppointmentWhereInput = {
      branchId,
    };

    if (from || to) {
      where.startsAt = {};
      if (from) {
        where.startsAt.gte = from;
      }
      if (to) {
        where.startsAt.lt = to;
      }
    }

    if (staffId) {
      where.assignedStaffId = staffId;
    }

    if (status) {
      where.status = status;
    }

    const [totalItems, appointments] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        orderBy: {
          startsAt: "asc",
        },
        skip,
        take: size,
        include: appointmentInclude,
      }),
    ]);

    return {
      items: appointments.map((appointment) => mapAppointment(appointment)),
      pagination: mapPagination(page, size, totalItems),
    };
  },
);

app.post(
  `${API_PREFIX}/admin/appointments`,
  {
    preHandler: requireAdminAuth,
  },
  async (request, reply) => {
    const authUser = getAuthUser(request);
    const body = request.body as Record<string, unknown>;

    const branchId = typeof body.branchId === "string" ? body.branchId : "";
    const serviceIds = parseStringList(body.serviceIds, "serviceIds");
    const startsAt = parseDateTime(body.startsAt, "startsAt");
    const preferenceType = body.preferenceType
      ? parsePreferenceType(body.preferenceType)
      : ("ANY" as const);
    const requestedStaffId =
      typeof body.requestedStaffId === "string" ? body.requestedStaffId : null;
    const assignedStaffId =
      typeof body.assignedStaffId === "string" ? body.assignedStaffId : null;
    const customer = parseCustomerInput(body.customer);

    if (!branchId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "branchId",
      });
    }

    assertBranchScope(authUser, branchId);

    if (preferenceType === "REQUIRED" && !assignedStaffId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "assignedStaffId",
      });
    }

    const appointment = await prisma.$transaction(
      async (tx) => {
        const selection = await resolveBookingSelection(tx, {
          branchId,
          serviceIds,
          startsAt,
          preferenceType,
          requestedStaffId,
          allowAlternateStaff: true,
          assignedStaffId,
        });

        return createAppointmentWithDetails(tx, {
          branchId,
          customer,
          selection,
          allowAlternateStaff: true,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return reply.status(201).send({
      appointment: mapAppointment(appointment),
    });
  },
);

app.patch(
  `${API_PREFIX}/admin/appointments/:appointmentId`,
  {
    preHandler: requireAdminAuth,
  },
  async (request) => {
    const authUser = getAuthUser(request);
    const params = request.params as { appointmentId?: string };
    const body = request.body as Record<string, unknown>;

    const appointmentId = params.appointmentId ?? "";
    if (!appointmentId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "appointmentId",
      });
    }

    const existingAppointment = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      include: {
        appointmentServices: {
          orderBy: {
            sortOrder: "asc",
          },
          select: {
            serviceId: true,
          },
        },
      },
    });

    if (!existingAppointment) {
      throw makeApiError(404, "NOT_FOUND", "Resource not found", {
        appointmentId,
      });
    }

    assertBranchScope(authUser, existingAppointment.branchId);

    if (existingAppointment.status === AppointmentStatus.CANCELLED) {
      throw makeApiError(
        409,
        "APPOINTMENT_ALREADY_CANCELLED",
        "Appointment is already cancelled",
      );
    }

    const startsAt = Reflect.has(body, "startsAt")
      ? parseDateTime(body.startsAt, "startsAt")
      : existingAppointment.startsAt;

    const serviceIds = Reflect.has(body, "serviceIds")
      ? parseStringList(body.serviceIds, "serviceIds")
      : existingAppointment.appointmentServices.map((item) => item.serviceId);

    const assignedStaffId = Reflect.has(body, "assignedStaffId")
      ? typeof body.assignedStaffId === "string"
        ? body.assignedStaffId
        : ""
      : existingAppointment.assignedStaffId;

    if (!assignedStaffId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "assignedStaffId",
      });
    }

    const updatedAppointment = await prisma.$transaction(
      async (tx) => {
        const selection = await resolveBookingSelection(tx, {
          branchId: existingAppointment.branchId,
          serviceIds,
          startsAt,
          preferenceType: "ANY",
          requestedStaffId: null,
          allowAlternateStaff: true,
          assignedStaffId,
        });

        if (!selection.assignedStaffId) {
          throw makeApiError(
            409,
            "SLOT_CONFLICT",
            "Slot is no longer available",
            {
              startsAt: selection.startsAt.toISOString(),
            },
          );
        }

        const appointment = await tx.appointment.update({
          where: {
            id: appointmentId,
          },
          data: {
            startsAt: selection.startsAt,
            endsAt: selection.endsAt,
            assignedStaffId: selection.assignedStaffId,
          },
        });

        await tx.appointmentService.deleteMany({
          where: {
            appointmentId: appointment.id,
          },
        });

        await tx.appointmentService.createMany({
          data: selection.services.map((service, index) => ({
            appointmentId: appointment.id,
            serviceId: service.id,
            sortOrder: index,
            durationMinutes: service.durationMinutes,
            bufferMinutes: service.bufferMinutes,
          })),
        });

        await writeAuditLog(tx, {
          adminUserId: authUser.id,
          role: authUser.role,
          branchId: existingAppointment.branchId,
          action: "APPOINTMENT_RESCHEDULED",
          entityType: "APPOINTMENT",
          entityId: appointmentId,
          details: {
            startsAt: selection.startsAt.toISOString(),
            assignedStaffId: selection.assignedStaffId,
            serviceIds,
          },
        });

        return tx.appointment.findUniqueOrThrow({
          where: {
            id: appointment.id,
          },
          include: appointmentInclude,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return {
      appointment: mapAppointment(updatedAppointment),
    };
  },
);

app.post(
  `${API_PREFIX}/admin/appointments/:appointmentId/cancel`,
  {
    preHandler: requireAdminAuth,
  },
  async (request) => {
    const authUser = getAuthUser(request);
    const params = request.params as { appointmentId?: string };
    const body = request.body as Record<string, unknown>;

    const appointmentId = params.appointmentId ?? "";
    if (!appointmentId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "appointmentId",
      });
    }

    const reasonRaw = body.reason;
    const override = body.override === true;
    const customerContacted = body.customerContacted === true;
    const note = typeof body.note === "string" ? body.note : null;

    if (
      reasonRaw !== CancellationReason.CUSTOMER_REQUEST &&
      reasonRaw !== CancellationReason.SERVICE_DISABLED &&
      reasonRaw !== CancellationReason.SERVICE_ISSUE
    ) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "reason",
      });
    }

    if (
      typeof body.override !== "boolean" ||
      typeof body.customerContacted !== "boolean"
    ) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "override",
      });
    }

    const appointment = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      include: {
        branch: {
          select: {
            cancellationCutoffHours: true,
            cancellationOverrideAllowed: true,
          },
        },
      },
    });

    if (!appointment) {
      throw makeApiError(404, "NOT_FOUND", "Resource not found", {
        appointmentId,
      });
    }

    assertBranchScope(authUser, appointment.branchId);

    if (appointment.status === AppointmentStatus.CANCELLED) {
      throw makeApiError(
        409,
        "APPOINTMENT_ALREADY_CANCELLED",
        "Appointment is already cancelled",
        {},
      );
    }

    if (
      (reasonRaw === CancellationReason.SERVICE_DISABLED ||
        reasonRaw === CancellationReason.SERVICE_ISSUE) &&
      !customerContacted
    ) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "customerContacted",
      });
    }

    if (override) {
      if (
        authUser.role === AdminRole.BRANCH_ADMIN &&
        !appointment.branch.cancellationOverrideAllowed
      ) {
        throw makeApiError(
          403,
          "OVERRIDE_NOT_ALLOWED",
          "Override cancellation is not allowed for this branch or user",
          {},
        );
      }
    }

    if (reasonRaw === CancellationReason.CUSTOMER_REQUEST) {
      const cutoffTime = new Date(
        appointment.startsAt.getTime() -
          appointment.branch.cancellationCutoffHours * 60 * MINUTE_IN_MS,
      );

      if (new Date() > cutoffTime && !override) {
        throw makeApiError(
          409,
          "CANCELLATION_CUTOFF",
          "Cancellation cutoff window has passed",
          {
            cancellationCutoffHours: appointment.branch.cancellationCutoffHours,
          },
        );
      }
    }

    const cancelledAppointment = await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: {
          id: appointmentId,
        },
        data: {
          status: AppointmentStatus.CANCELLED,
        },
      });

      await tx.appointmentCancellation.create({
        data: {
          appointmentId,
          reason: reasonRaw,
          override,
          customerContacted,
          note,
          cancelledByUserId: authUser.id,
        },
      });

      await writeAuditLog(tx, {
        adminUserId: authUser.id,
        role: authUser.role,
        branchId: appointment.branchId,
        action: "APPOINTMENT_CANCELLED",
        entityType: "APPOINTMENT",
        entityId: appointmentId,
        details: {
          reason: reasonRaw,
          override,
          customerContacted,
        },
      });

      return tx.appointment.findUniqueOrThrow({
        where: {
          id: appointmentId,
        },
        include: appointmentInclude,
      });
    });

    return {
      appointment: mapAppointment(cancelledAppointment),
    };
  },
);

const parseSuspensionRequest = (body: unknown) => {
  if (typeof body !== "object" || body === null) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "body",
    });
  }

  const serviceIdValue = Reflect.get(body, "serviceId");
  const startsAtValue = Reflect.get(body, "startsAt");
  const endsAtValue = Reflect.get(body, "endsAt");

  const serviceId = typeof serviceIdValue === "string" ? serviceIdValue : "";
  const startsAt = parseDateTime(startsAtValue, "startsAt");
  const endsAt = parseDateTime(endsAtValue, "endsAt");

  if (!serviceId) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "serviceId",
    });
  }

  if (endsAt <= startsAt) {
    throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
      field: "endsAt",
    });
  }

  return {
    serviceId,
    startsAt,
    endsAt,
  };
};

const listImpactedAppointments = async (args: {
  branchId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
}) =>
  prisma.appointment.findMany({
    where: {
      branchId: args.branchId,
      status: AppointmentStatus.CONFIRMED,
      startsAt: {
        lt: args.endsAt,
      },
      endsAt: {
        gt: args.startsAt,
      },
      appointmentServices: {
        some: {
          serviceId: args.serviceId,
        },
      },
    },
    include: {
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
      assignedStaff: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      startsAt: "asc",
    },
  });

app.post(
  `${API_PREFIX}/admin/branches/:branchId/service-suspensions/preview`,
  {
    preHandler: requireAdminAuth,
  },
  async (request) => {
    const authUser = getAuthUser(request);
    const params = request.params as { branchId?: string };
    const branchId = params.branchId ?? "";

    if (!branchId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "branchId",
      });
    }

    assertBranchScope(authUser, branchId);
    await ensureBranchExists(branchId);

    const suspensionRequest = parseSuspensionRequest(request.body);

    const serviceExists = await prisma.service.findUnique({
      where: {
        id: suspensionRequest.serviceId,
      },
      select: {
        id: true,
      },
    });

    if (!serviceExists) {
      throw makeApiError(404, "NOT_FOUND", "Resource not found", {
        serviceId: suspensionRequest.serviceId,
      });
    }

    const impactedAppointments = await listImpactedAppointments({
      branchId,
      ...suspensionRequest,
    });

    return {
      impactedCount: impactedAppointments.length,
      impactedAppointments: impactedAppointments.map((appointment) => ({
        appointmentId: appointment.id,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        customer: {
          name: appointment.customer.name,
          phone: appointment.customer.phone,
        },
        assignedStaff: {
          id: appointment.assignedStaff.id,
          name: appointment.assignedStaff.name,
        },
      })),
    };
  },
);

app.post(
  `${API_PREFIX}/admin/branches/:branchId/service-suspensions`,
  {
    preHandler: requireAdminAuth,
  },
  async (request, reply) => {
    const authUser = getAuthUser(request);
    const params = request.params as { branchId?: string };
    const branchId = params.branchId ?? "";

    if (!branchId) {
      throw makeApiError(422, "VALIDATION_ERROR", "Request validation failed", {
        field: "branchId",
      });
    }

    assertBranchScope(authUser, branchId);
    await ensureBranchExists(branchId);

    const suspensionRequest = parseSuspensionRequest(request.body);

    const serviceExists = await prisma.service.findUnique({
      where: {
        id: suspensionRequest.serviceId,
      },
      select: {
        id: true,
      },
    });

    if (!serviceExists) {
      throw makeApiError(404, "NOT_FOUND", "Resource not found", {
        serviceId: suspensionRequest.serviceId,
      });
    }

    const createdSuspension = await prisma.$transaction(async (tx) => {
      const impactedCount = await tx.appointment.count({
        where: {
          branchId,
          status: AppointmentStatus.CONFIRMED,
          startsAt: {
            lt: suspensionRequest.endsAt,
          },
          endsAt: {
            gt: suspensionRequest.startsAt,
          },
          appointmentServices: {
            some: {
              serviceId: suspensionRequest.serviceId,
            },
          },
        },
      });

      if (impactedCount > 0) {
        throw makeApiError(
          409,
          "IMPACTED_APPOINTMENTS_EXIST",
          "Cannot create suspension while impacted appointments exist",
          {
            impactedCount,
          },
        );
      }

      const suspension = await tx.serviceSuspension.create({
        data: {
          branchId,
          serviceId: suspensionRequest.serviceId,
          startsAt: suspensionRequest.startsAt,
          endsAt: suspensionRequest.endsAt,
          createdByUserId: authUser.id,
        },
      });

      await writeAuditLog(tx, {
        adminUserId: authUser.id,
        role: authUser.role,
        branchId,
        action: "SERVICE_SUSPENSION_CREATED",
        entityType: "SERVICE_SUSPENSION",
        entityId: suspension.id,
        details: {
          serviceId: suspension.serviceId,
          startsAt: suspension.startsAt.toISOString(),
          endsAt: suspension.endsAt.toISOString(),
        },
      });

      return suspension;
    });

    return reply.status(201).send({
      id: createdSuspension.id,
      branchId: createdSuspension.branchId,
      serviceId: createdSuspension.serviceId,
      startsAt: createdSuspension.startsAt.toISOString(),
      endsAt: createdSuspension.endsAt.toISOString(),
      createdAt: createdSuspension.createdAt.toISOString(),
      createdByUserId: createdSuspension.createdByUserId,
    });
  },
);

const port = Number(process.env.API_PORT ?? "3001");
const host = process.env.API_HOST ?? "0.0.0.0";

const start = async (): Promise<void> => {
  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

export { app, prisma };

if (process.env.NODE_ENV !== "test") {
  void start();
}
