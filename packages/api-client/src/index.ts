import { CULTURESPARK_TIME_ZONE } from "@culturespark/shared";

export const API_CLIENT_PLACEHOLDER = {
  source: "packages/api-client/src/generated.ts",
  generator: "OpenAPI codegen (to be added)",
  timezone: CULTURESPARK_TIME_ZONE,
} as const;

export * from "./generated";
export * from "./public-client";
export * from "./types";
