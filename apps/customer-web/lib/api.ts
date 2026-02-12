import { createPublicApiClient } from "@culturespark/api-client";

export const publicApiClient = createPublicApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001",
});
