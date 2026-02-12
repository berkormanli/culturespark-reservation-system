import type { StaffPreferenceMode } from "./enums";

export type Uuid = string;

export type BranchSummary = {
  id: Uuid;
  name: string;
  timezone: string;
  slotIntervalMinutes: number;
};

export type ReservationDraft = {
  branchId: Uuid;
  serviceIds: Uuid[];
  requestedStartAt: string;
  staffPreferenceMode: StaffPreferenceMode;
  preferredStaffId?: Uuid;
};
