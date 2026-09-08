import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "./package.json"), "utf-8")
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  // 相對路徑：GitHub Pages 專案頁面部署在子路徑（/repo-name/）下，
  // 用相對路徑就不需要在設定檔裡寫死 repo 名稱。
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
