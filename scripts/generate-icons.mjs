// Renders public/favicon.svg into the PNG icons the PWA manifest and iOS need.
import { createRequire } from 'node:module';
// Playwright is used only for this one-off script; resolved from local or global installs.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
// Maskable icon: full-bleed background, artwork scaled into the safe zone.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace('<g transform="rotate(-35 256 256)"', '<g transform="translate(256 256) scale(0.78) translate(-256 -256) rotate(-35 256 256)"');

const targets = [
  { file: 'icon-192.png', size: 192, src: svg },
  { file: 'icon-512.png', size: 512, src: svg },
  { file: 'icon-maskable-512.png', size: 512, src: maskable },
  // iOS draws its own rounded corners, so use the square variant.
  { file: 'apple-touch-icon.png', size: 180, src: maskable.replace('scale(0.78)', 'scale(0.9)') },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${t.src.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`,
  );
  const buf = await page.locator('svg').screenshot({ omitBackground: true });
  await writeFile(new URL(`../public/${t.file}`, import.meta.url), buf);
  console.log('wrote', t.file);
}
await browser.close();
