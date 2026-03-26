import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export const projectRoot = path.resolve(rootDir);

export function resolveProjectPath(...segments: string[]) {
  return path.resolve(projectRoot, ...segments);
}

export const sharedConfig = defineConfig({
  root: projectRoot,
  clearScreen: false
});
