import type { ApiClientError } from "@culturespark/api-client";
import {
  CULTURESPARK_TIME_ZONE,
  type StaffPreferenceMode,
} from "@culturespark/shared";

export const getTodayInIstanbul = (): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CULTURESPARK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
};

export const formatSlotTime = (startsAt: string): string =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: CULTURESPARK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));

export const formatSlotDateTime = (startsAt: string): string =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: CULTURESPARK_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(startsAt));

export const normalizePhone = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? `+${digits}` : "";
};

const ISTANBUL_OFFSET_MINUTES = 180;

export const isSlotAlignedToInterval = (
  startsAt: string,
  slotIntervalMinutes: number,
): boolean => {
  if (!Number.isInteger(slotIntervalMinutes) || slotIntervalMinutes <= 0) {
    return false;
  }

  const parsed = new Date(startsAt);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  if (parsed.getUTCSeconds() !== 0 || parsed.getUTCMilliseconds() !== 0) {
    return false;
  }

  const minuteOfDay =
    (parsed.getUTCHours() * 60 +
      parsed.getUTCMinutes() +
      ISTANBUL_OFFSET_MINUTES) %
    (24 * 60);

  return minuteOfDay % slotIntervalMinutes === 0;
};

export const buildSelectionSignature = (input: {
  branchId: string;
  serviceIds: string[];
  preferenceType: StaffPreferenceMode;
  requestedStaffId: string | null;
  date: string;
  selectedStartsAt: string;
  allowAlternateStaff: boolean;
}): string =>
  [
    input.branchId,
    input.serviceIds
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .join(","),
    input.preferenceType,
    input.requestedStaffId ?? "-",
    input.date,
    input.selectedStartsAt,
    input.allowAlternateStaff ? "1" : "0",
  ].join("|");

export const getFriendlyErrorMessage = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as ApiClientError).code === "string"
  ) {
    const code = (error as ApiClientError).code;
    if (code === "SLOT_CONFLICT") {
      return "That time was just taken. Please pick another time.";
    }
    if (code === "PREFERRED_STAFF_UNAVAILABLE") {
      return "Preferred staff is no longer available for this slot.";
    }
    if (code === "INVALID_SLOT_ALIGNMENT") {
      return "Selected time is not aligned with branch slot interval.";
    }
    if (code === "REQUESTED_STAFF_REQUIRED") {
      return "Please pick a staff member for required or preferred mode.";
    }
    if (code === "IDEMPOTENCY_KEY_REUSE") {
      return "Session key was reused with another request. Please try again.";
    }
  }

  return "Something went wrong. Please try again.";
};
