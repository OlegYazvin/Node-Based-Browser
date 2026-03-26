import { defineConfig, mergeConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolveProjectPath, sharedConfig } from "./vite.base.config";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    root: resolveProjectPath("src/renderer"),
    plugins: [react()],
    base: "./",
    build: {
      outDir: resolveProjectPath(".vite/renderer/main_window"),
      sourcemap: true,
      emptyOutDir: true
    },
    resolve: {
      alias: {
        "@renderer": resolveProjectPath("src/renderer"),
        "@shared": resolveProjectPath("src/shared")
      }
    }
  })
);
