import type { ConfigEnv, UserConfig } from "vite";
import { defineConfig } from "vite";
import { pluginExposeRenderer } from "./vite.base.config";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv;
  const { mode } = forgeEnv;
  const name = (forgeEnv as any).forgeConfigSelf?.name ?? "";

  // Set root path based on the renderer name
  const rootPath =
    name === "app_overlay"
      ? "app-overlay"
      : name === "prompt_overlay"
      ? "prompt-overlay"
      : (forgeEnv as any).root || ".";

  return {
    root: rootPath,
    mode,
    base: "./",
    build: {
      outDir: `.vite/renderer/${name}`,
    },
    plugins: [pluginExposeRenderer(name), react()],
    resolve: {
      preserveSymlinks: true,
    },
    clearScreen: false,
  } as UserConfig;
});
