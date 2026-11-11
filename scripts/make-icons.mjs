// Draws the Wordz app icon (a "W" tile on the board-brown background) and
// writes every file the browser tab, the iPhone Home Screen, and the web app
// manifest need:
//
//   public/favicon.svg           browser tab (rounded corners)
//   public/apple-touch-icon.png  iPhone Home Screen (180px)
//   public/pwa-192.png           manifest icon
//   public/pwa-512.png           manifest icon, also used as the maskable icon
//
// The PNGs are committed, so this only needs re-running when the artwork
// changes. Usage (Playwright's Chromium does the rasterizing):
//
//   node scripts/make-icons.mjs
import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

// The tile sits inside the central 60% so Android's maskable crop (a circle
// covering the central 80%) never clips it. iOS rounds the corners of a
// full-bleed square itself, so only the browser-tab SVG gets `cornerRadius`.
const iconSvg = (cornerRadius) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="board" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a2912"/>
      <stop offset="1" stop-color="#1a1208"/>
    </linearGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5e6c8"/>
      <stop offset="0.4" stop-color="#e8d4a8"/>
      <stop offset="1" stop-color="#dcc490"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${cornerRadius}" fill="url(#board)"/>
  <rect x="106" y="116" width="300" height="300" rx="40" fill="#8a6a34"/>
  <rect x="106" y="104" width="300" height="300" rx="40" fill="url(#tile)"/>
  <text x="252" y="328" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="205" fill="#3d2b1a">W</text>
  <text x="380" y="384" text-anchor="end" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="50" fill="#7a5d3a">4</text>
</svg>
`

writeFileSync(path.join(publicDir, 'favicon.svg'), iconSvg(96))

const browser = await chromium.launch()
const page = await browser.newPage()
for (const [name, size] of [['apple-touch-icon.png', 180], ['pwa-192.png', 192], ['pwa-512.png', 512]]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0">${iconSvg(0).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  )
  await page.screenshot({ path: path.join(publicDir, name), omitBackground: false })
}
await browser.close()
