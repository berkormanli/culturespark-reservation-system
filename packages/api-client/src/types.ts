import type {
  AppointmentStatus,
  StaffPreferenceMode,
} from "@culturespark/shared";

export type ApiErrorCode =
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

export type ApiErrorEnvelope = {
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type Pagination = {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
};

export type PublicBranch = {
  id: string;
  name: string;
  timezone: string;
};

export type PublicBranchListResponse = {
  items: PublicBranch[];
  pagination: Pagination;
};

export type PublicService = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  isActiveGlobally: boolean;
  isSuspendedForDate: boolean;
  isBookable: boolean;
};

export type PublicBranchServicesResponse = {
  date: string;
  items: PublicService[];
  pagination: Pagination;
};

export type PublicStaffOption = {
  id: string;
  name: string;
};

export type PublicBranchStaffResponse = {
  items: PublicStaffOption[];
};

export type PublicAvailabilitySlot = {
  startsAt: string;
  endsAt: string;
  preferredStaffAvailable?: boolean;
};

export type PublicAvailabilityResponse = {
  slotIntervalMinutes: number;
  totalDurationMinutes: number;
  slots: PublicAvailabilitySlot[];
};

export type PublicAppointmentService = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
};

export type PublicAppointment = {
  id: string;
  branchId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  services: PublicAppointmentService[];
  customer: {
    name: string;
    phone: string;
  };
  assignedStaff: {
    id: string;
    name: string;
  };
  preferenceType: StaffPreferenceMode;
  requestedStaffId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreatePublicAppointmentBody = {
  branchId: string;
  serviceIds: string[];
  startsAt: string;
  preferenceType: StaffPreferenceMode;
  requestedStaffId?: string;
  allowAlternateStaff?: boolean;
  customer: {
    name: string;
    phone: string;
  };
};

export type CreatePublicAppointmentResponse = {
  appointment: PublicAppointment;
};
