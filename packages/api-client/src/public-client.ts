import type { StaffPreferenceMode } from "@culturespark/shared";
import type {
  ApiErrorEnvelope,
  CreatePublicAppointmentBody,
  CreatePublicAppointmentResponse,
  PublicAvailabilityResponse,
  PublicBranchListResponse,
  PublicBranchServicesResponse,
  PublicBranchStaffResponse,
} from "./types";

type RequestOptions = {
  signal?: AbortSignal | undefined;
  headers?: Record<string, string>;
};

type PublicBranchServiceParams = {
  branchId: string;
  date: string;
  page?: number;
  size?: number;
  signal?: AbortSignal;
};

type PublicBranchStaffParams = {
  branchId: string;
  serviceIds: string[];
  signal?: AbortSignal;
};

type PublicAvailabilityParams = {
  branchId: string;
  date: string;
  serviceIds: string[];
  preferenceType: StaffPreferenceMode;
  requestedStaffId?: string;
  signal?: AbortSignal;
};

type CreatePublicAppointmentParams = {
  idempotencyKey: string;
  body: CreatePublicAppointmentBody;
  signal?: AbortSignal;
};

const DEFAULT_API_PREFIX = "/api/v1";

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(args: {
    status: number;
    code: string;
    message: string;
    details: Record<string, unknown>;
  }) {
    super(args.message);
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
  }
}

const parseApiErrorEnvelope = (value: unknown): ApiErrorEnvelope | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  if (!hasOwn(value, "error")) {
    return null;
  }

  const errorValue = Reflect.get(value, "error");
  if (typeof errorValue !== "object" || errorValue === null) {
    return null;
  }

  const code = Reflect.get(errorValue, "code");
  const message = Reflect.get(errorValue, "message");
  const details = Reflect.get(errorValue, "details");

  if (typeof code !== "string" || typeof message !== "string") {
    return null;
  }

  return {
    error: {
      code,
      message,
      details:
        typeof details === "object" && details !== null
          ? (details as Record<string, unknown>)
          : {},
    },
  };
};

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const withQuery = (path: string, query: Record<string, string | undefined>) => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value && value.length > 0) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();
  return queryString.length > 0 ? `${path}?${queryString}` : path;
};

export type PublicApiClient = ReturnType<typeof createPublicApiClient>;

export const createPublicApiClient = (config?: {
  baseUrl?: string;
  apiPrefix?: string;
}) => {
  const baseUrl = config?.baseUrl?.replace(/\/+$/, "") ?? "";
  const apiPrefix = config?.apiPrefix ?? DEFAULT_API_PREFIX;

  const requestJson = async <TResponse>(
    path: string,
    init?: RequestInit,
    options?: RequestOptions,
  ): Promise<TResponse> => {
    const headers = new Headers(init?.headers ?? {});
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    for (const [key, value] of Object.entries(options?.headers ?? {})) {
      headers.set(key, value);
    }

    const response = await fetch(`${baseUrl}${apiPrefix}${path}`, {
      ...init,
      headers,
      signal: options?.signal ?? null,
    });

    const payload = await parseJsonSafely(response);
    if (!response.ok) {
      const apiError = parseApiErrorEnvelope(payload);

      throw new ApiClientError({
        status: response.status,
        code: apiError?.error.code ?? "VALIDATION_ERROR",
        message: apiError?.error.message ?? "Request failed",
        details: apiError?.error.details ?? {},
      });
    }

    return payload as TResponse;
  };

  return {
    getPublicBranches: (params?: {
      page?: number;
      size?: number;
      signal?: AbortSignal;
    }) =>
      requestJson<PublicBranchListResponse>(
        withQuery("/public/branches", {
          page: params?.page?.toString(),
          size: params?.size?.toString(),
        }),
        {
          method: "GET",
        },
        {
          signal: params?.signal,
        },
      ),
    getPublicBranchServices: (params: PublicBranchServiceParams) =>
      requestJson<PublicBranchServicesResponse>(
        withQuery(`/public/branches/${params.branchId}/services`, {
          date: params.date,
          page: params.page?.toString(),
          size: params.size?.toString(),
        }),
        {
          method: "GET",
        },
        {
          signal: params.signal,
        },
      ),
    getPublicBranchStaff: (params: PublicBranchStaffParams) =>
      requestJson<PublicBranchStaffResponse>(
        withQuery(`/public/branches/${params.branchId}/staff`, {
          serviceIds: params.serviceIds.join(","),
        }),
        {
          method: "GET",
        },
        {
          signal: params.signal,
        },
      ),
    getPublicAvailability: (params: PublicAvailabilityParams) =>
      requestJson<PublicAvailabilityResponse>(
        withQuery("/public/availability", {
          branchId: params.branchId,
          date: params.date,
          serviceIds: params.serviceIds.join(","),
          preferenceType: params.preferenceType,
          requestedStaffId: params.requestedStaffId,
        }),
        {
          method: "GET",
        },
        {
          signal: params.signal,
        },
      ),
    createPublicAppointment: (params: CreatePublicAppointmentParams) =>
      requestJson<CreatePublicAppointmentResponse>(
        "/public/appointments",
        {
          method: "POST",
          body: JSON.stringify(params.body),
        },
        {
          signal: params.signal,
          headers: {
            "Idempotency-Key": params.idempotencyKey,
          },
        },
      ),
  };
};

export const createIdempotencyKey = (): string => {
  if (
    "crypto" in globalThis &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `idem-${Date.now()}-${Math.random().toString(16).slice(2, 12)}`;
};
