/**
 * Layout QA: renders pages in headless Chrome at desktop and phone widths, light and dark, and records
 * total page height, the tallest image, and a full-page screenshot.
 *   node scripts/qa/measure.mjs <baseUrl> <outDir> <slug> [<slug> ...]
 * Requires puppeteer-core (npm i --no-save puppeteer-core) and Google Chrome installed.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, outDir, ...slugs] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewports = [{ name: '1280', width: 1280, height: 900 }, { name: '375', width: 375, height: 812 }];
const themes = ['light', 'dark'];
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
const rows = [];
for (const slug of slugs) {
  for (const vp of viewports) {
    for (const theme of themes) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
      await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
      await page.goto(`${base}/blog/${slug}/`, { waitUntil: 'networkidle0' });
      // lazy images: scroll through so they load before measuring
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
      await new Promise((r) => setTimeout(r, 400));
      const m = await page.evaluate(() => {
        const art = document.querySelector('article') || document.body;
        const imgs = [...art.querySelectorAll('img')].map((i) => { const r = i.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), alt: i.getAttribute('alt') || '' }; });
        const fit = [...document.querySelectorAll('h2')].find((h) => /where does lockpact fit|where lockpact fits|doesn.t it hold/i.test(h.textContent));
        const cta = fit ? fit.getBoundingClientRect().top + window.scrollY : null;
        const h2s = document.querySelectorAll('article h2').length;
        return { height: document.documentElement.scrollHeight, images: imgs.length, maxImgH: imgs.reduce((a, b) => Math.max(a, b.h), 0), maxImgW: imgs.reduce((a, b) => Math.max(a, b.w), 0), fitsY: cta ? Math.round(cta) : null, h2s };
      });
      const file = `${outDir}/${slug}-${vp.name}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      rows.push({ slug, viewport: vp.name, theme, ...m });
      await page.close();
    }
  }
}
await browser.close();
writeFileSync(`${outDir}/measure.json`, JSON.stringify(rows, null, 1));
for (const r of rows.filter((r) => r.theme === 'light')) console.log(`${r.slug.padEnd(48)} ${r.viewport.padStart(4)}  height ${String(r.height).padStart(6)}  imgs ${String(r.images).padStart(2)}  maxImg ${r.maxImgW}x${r.maxImgH}  h2s ${r.h2s}  fits@${r.fitsY} (${r.fitsY ? Math.round(100 * r.fitsY / r.height) : '-'}%)`);
