// 產生網站與 PWA 圖示：public/favicon.svg 與各尺寸 PNG。圖示的設計只寫在這裡，改完重跑即可。
//
// 用法：node scripts/generate-icons.mjs
//
// - PNG 由 Playwright 的 Chromium 繪製，不另外安裝影像處理套件。
// - 一般圖示（favicon、pwa-*）是圓角方塊，四角透明。
// - maskable 與 apple-touch-icon 要滿版：系統會自行裁成圓形或圓角，四角透明會變成黑色。
//   內容縮到中央安全區（直徑 80% 的圓）之內，裁切後不會被切掉。
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const PUBLIC_DIR = path.resolve(import.meta.dirname, "../public");

// emerald-400 → emerald-700，與畫面上的 emerald 強調色同一色系
const GRADIENT = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#34d399"/>
    <stop offset="1" stop-color="#047857"/>
  </linearGradient>`;

// 512×512 座標系的圖案：三根遞增的長條（資產逐期成長）加上一條向上的趨勢線
const GLYPH = `<g fill="#ffffff">
    <rect x="112" y="320" width="72" height="88" rx="18" fill-opacity="0.7"/>
    <rect x="220" y="264" width="72" height="144" rx="18" fill-opacity="0.85"/>
    <rect x="328" y="208" width="72" height="200" rx="18"/>
  </g>
  <path d="M104 240 L204 164 L268 200 L376 108" fill="none" stroke="#ffffff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M330 100 L390 96 L386 156" fill="none" stroke="#ffffff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>`;

/** 圓角方塊、四角透明 */
const roundedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${GRADIENT}</defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  ${GLYPH}
</svg>
`;

/** 滿版背景，圖案縮到中央安全區 */
const fullBleedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${GRADIENT}</defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(0.8) translate(-256 -256)">
  ${GLYPH}
  </g>
</svg>
`;

const PNG_TARGETS = [
  { file: "pwa-192x192.png", size: 192, svg: roundedSvg },
  { file: "pwa-512x512.png", size: 512, svg: roundedSvg },
  { file: "maskable-icon-512x512.png", size: 512, svg: fullBleedSvg },
  { file: "apple-touch-icon-180x180.png", size: 180, svg: fullBleedSvg },
];

await writeFile(path.join(PUBLIC_DIR, "favicon.svg"), roundedSvg);
console.log("已寫入 public/favicon.svg");

const browser = await chromium.launch();
try {
  for (const { file, size, svg } of PNG_TARGETS) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
    });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
    );
    await page.screenshot({
      path: path.join(PUBLIC_DIR, file),
      omitBackground: true,
    });
    await page.close();
    console.log(`已寫入 public/${file}（${size}×${size}）`);
  }
} finally {
  await browser.close();
}
