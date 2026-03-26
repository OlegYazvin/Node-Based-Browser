import { defineConfig, mergeConfig } from "vite";
import { resolveProjectPath, sharedConfig } from "./vite.base.config";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    build: {
      outDir: ".vite/build",
      sourcemap: true,
      emptyOutDir: false,
      lib: {
        entry: resolveProjectPath("src/preload/preload.ts"),
        formats: ["cjs"],
        fileName: () => "preload.js"
      },
      rollupOptions: {
        external: ["electron", "node:fs", "node:path", "node:os", "node:crypto"]
      }
    }
  })
);
