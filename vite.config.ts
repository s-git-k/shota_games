import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/shota_games/" : "/",
  server: {
    host: true,
    port: 5173
  },
  build: {
    target: "es2020",
    sourcemap: true
  }
}));
