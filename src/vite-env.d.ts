/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/** 建置時由 vite.config.ts 從 package.json 的 version 欄位注入（畫面 footer 顯示用）。 */
declare const __APP_VERSION__: string;
