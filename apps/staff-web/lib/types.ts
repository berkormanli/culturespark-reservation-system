export type AdminRole = "SUPER_ADMIN" | "BRANCH_ADMIN";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  branchId: string | null;
};

export type SessionData = {
  accessToken: string;
  expiresAt: number;
  user: AdminUser;
};

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
  | "APPOINTMENT_ALREADY_CANCELLED"
  | "UNKNOWN_ERROR";

export type BranchSummary = {
  id: string;
  name: string;
  timezone: string;
};

export type StaffSummary = {
  id: string;
  name: string;
};

export type ServiceSummary = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  isActiveGlobally: boolean;
  isSuspendedForDate: boolean;
  isBookable: boolean;
};

export type CancellationReason =
  | "CUSTOMER_REQUEST"
  | "SERVICE_DISABLED"
  | "SERVICE_ISSUE";

export type Appointment = {
  id: string;
  branchId: string;
  startsAt: string;
  endsAt: string;
  status: "CONFIRMED" | "CANCELLED";
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    bufferMinutes: number;
  }>;
  customer: {
    name: string;
    phone: string;
  };
  assignedStaff: {
    id: string;
    name: string;
  };
  preferenceType: "ANY" | "PREFERRED" | "REQUIRED";
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
};
