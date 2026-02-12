import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve("openapi/openapi.yaml");
const spec = readFileSync(sourcePath, "utf8");

const requiredSnippets = [
  "openapi: 3.1.0",
  "Europe/Istanbul",
  "excludes online payments",
  "SMS/email",
];

for (const snippet of requiredSnippets) {
  if (!spec.includes(snippet)) {
    console.error(`[api-contracts] missing required snippet: ${snippet}`);
    process.exit(1);
  }
}

console.log("[api-contracts] basic contract lint passed");
