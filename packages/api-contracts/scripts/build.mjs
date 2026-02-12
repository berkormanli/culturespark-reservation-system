import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const sourcePath = resolve("openapi/openapi.yaml");
const distDir = resolve("dist");
const targetPath = resolve(distDir, "openapi.yaml");

mkdirSync(distDir, { recursive: true });
copyFileSync(sourcePath, targetPath);

console.log(`[api-contracts] copied ${sourcePath} -> ${targetPath}`);
