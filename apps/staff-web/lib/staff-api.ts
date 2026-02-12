import { ApiClientError, apiRequest } from "./api";
import type { Appointment, ServiceSummary, StaffSummary } from "./types";

type Pagination = {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
};

type AuthorizedRequest = <T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  },
) => Promise<T>;

type AppointmentListResponse = {
  items: Appointment[];
  pagination: Pagination;
};

type ServiceListResponse = {
  date: string;
  items: ServiceSummary[];
  pagination: Pagination;
};

type StaffListResponse = {
  items?: Array<{ id?: string; name?: string }>;
};

export type ServiceSuspensionPreview = {
  impactedCount: number;
  impactedAppointments: Array<{
    appointmentId: string;
    startsAt: string;
    endsAt: string;
    customer: { name: string; phone: string };
    assignedStaff: { id: string; name: string };
  }>;
};

export const listServicesByBranchAndDate = async (
  branchId: string,
  date: string,
): Promise<ServiceSummary[]> => {
  const response = await apiRequest<ServiceListResponse>(
    `/public/branches/${branchId}/services`,
    {
      query: {
        date,
        page: 1,
        size: 50,
      },
    },
  );
  return response.items;
};

export const listAppointmentsByRange = async (
  authorizedRequest: AuthorizedRequest,
  args: {
    branchId: string;
    from: string;
    to: string;
    staffId?: string;
  },
): Promise<Appointment[]> => {
  const response = await authorizedRequest<AppointmentListResponse>(
    "/admin/appointments",
    {
      query: {
        branchId: args.branchId,
        from: args.from,
        to: args.to,
        page: 1,
        size: 50,
        staffId: args.staffId,
      },
    },
  );
  return response.items;
};

export const listStaffByBranch = async (
  authorizedRequest: AuthorizedRequest,
  branchId: string,
): Promise<StaffSummary[]> => {
  try {
    const response = await authorizedRequest<StaffListResponse>(
      `/admin/branches/${branchId}/staff`,
      {
        query: { page: 1, size: 50 },
      },
    );

    const rawItems = response.items ?? [];
    return rawItems
      .filter(
        (item): item is { id: string; name: string } =>
          typeof item.id === "string" && typeof item.name === "string",
      )
      .map((item) => ({ id: item.id, name: item.name }));
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "NOT_FOUND") {
      return [];
    }
    throw error;
  }
};

export const previewServiceSuspension = async (
  authorizedRequest: AuthorizedRequest,
  branchId: string,
  payload: {
    serviceId: string;
    startsAt: string;
    endsAt: string;
  },
): Promise<ServiceSuspensionPreview> =>
  authorizedRequest<ServiceSuspensionPreview>(
    `/admin/branches/${branchId}/service-suspensions/preview`,
    {
      method: "POST",
      body: payload,
    },
  );
