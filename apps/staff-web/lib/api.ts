import type { ApiErrorCode } from "./types";

const API_PREFIX = "/api/v1";
const FALLBACK_API_BASE_URL = "http://localhost:3001";

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  token?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
};

type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
};

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: ApiErrorCode;
  public readonly details: Record<string, unknown>;

  constructor(args: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(args.message);
    this.status = args.status;
    this.code = args.code;
    this.details = args.details ?? {};
  }
}

const toApiErrorCode = (value: string | undefined): ApiErrorCode => {
  if (!value) {
    return "UNKNOWN_ERROR";
  }

  return value as ApiErrorCode;
};

const getApiBaseUrl = (): string =>
  process.env.NEXT_PUBLIC_API_BASE_URL ?? FALLBACK_API_BASE_URL;

const buildUrl = (
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string => {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${API_PREFIX}${pathname}`, getApiBaseUrl());

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
};

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return null;
  }

  return response.json().catch(() => null);
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> => {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : null,
    cache: "no-store",
  });

  const parsedBody = await parseJsonSafely(response);
  if (!response.ok) {
    const errorBody = parsedBody as ApiErrorResponse | null;
    const details = errorBody?.error?.details;
    throw new ApiClientError({
      status: response.status,
      code: toApiErrorCode(errorBody?.error?.code),
      message: errorBody?.error?.message ?? "Request failed",
      ...(details ? { details } : {}),
    });
  }

  return parsedBody as T;
};
