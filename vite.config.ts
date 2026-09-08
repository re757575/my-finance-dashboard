import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 只快取建置產出的靜態檔案（同源），不新增任何對外網路請求，不違反零網路請求原則（PRD 第 8 節）。
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "個人資產負債儀表板",
        short_name: "資產儀表板",
        description:
          "去中心化、無伺服器、高度重視隱私的個人財務健康管理工具，所有資料僅儲存在你的瀏覽器中。",
        lang: "zh-Hant",
        theme_color: "#7e14ff",
        background_color: "#F9FAFB",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // GitHub Pages 部署在子路徑，globPatterns 預設即可涵蓋 base 相對路徑下的產出檔案。
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
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
